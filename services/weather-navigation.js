const { randomBytes } = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildWeatherReply } = require('./weather-reply');

const MODES = [
    { value: 'normal', label: 'Current', emoji: '🌤️' },
    { value: 'forecast', label: 'Forecast', emoji: '📅' },
    { value: 'lightning', label: 'Lightning', emoji: '⚡' },
    { value: 'airquality', label: 'Air Quality', emoji: '🌫️' },
    { value: 'alerts', label: 'Alerts', emoji: '⚠️' },
];

function createWeatherNavigation({ render = buildWeatherReply, now = Date.now, ttl = 30 * 60 * 1000, maxSessions = 500 } = {}) {
    const sessions = new Map();
    const privateReply = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
    const prune = () => {
        for (const [id, session] of sessions) {
            if (!session.busy && now() - session.touched >= ttl) sessions.delete(id);
        }
    };
    const controls = session => [new ActionRowBuilder().addComponents(MODES.map(mode => new ButtonBuilder()
        .setCustomId(`weather:${session.id}:${mode.value}`)
        .setLabel(mode.label)
        .setEmoji(mode.emoji)
        .setStyle(mode.value === session.mode ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(mode.value === session.mode)))];

    async function start(interaction, location, mode, output) {
        const payload = await render(location, mode, output);
        prune();
        while (sessions.size >= maxSessions) {
            const oldest = Array.from(sessions.values()).find(session => !session.busy);
            if (!oldest) throw new Error('Weather navigation is busy');
            sessions.delete(oldest.id);
        }
        const session = { id: randomBytes(12).toString('hex'), owner: interaction.user.id, location: { ...location }, mode, output, touched: now(), busy: true, messageId: null };
        sessions.set(session.id, session);
        try {
            const message = await interaction.editReply({ ...payload, components: controls(session) });
            session.messageId = message.id;
            session.touched = now();
        }
        catch (error) {
            sessions.delete(session.id);
            throw error;
        }
        finally { session.busy = false; }
    }

    async function handleButton(interaction) {
        prune();
        const match = /^weather:([a-f0-9]{24}):(normal|forecast|lightning|airquality|alerts)$/.exec(interaction.customId);
        const session = match && sessions.get(match[1]);
        if (!session || session.messageId !== interaction.message.id) {
            await privateReply(interaction, 'This weather view has expired. Run /weather again to open a new one.');
            return;
        }
        if (interaction.user.id !== session.owner) {
            await privateReply(interaction, 'Only the person who requested this weather view can change it. Run /weather for your own view.');
            return;
        }
        if (session.busy) {
            await privateReply(interaction, 'This weather view is updating. Please try again in a moment.');
            return;
        }
        const mode = match[2];
        session.busy = true;
        try {
            await interaction.deferUpdate();
            if (mode === session.mode) return;
            const payload = await render(session.location, mode, session.output);
            await interaction.editReply({ ...payload, components: controls({ ...session, mode }) });
            session.mode = mode;
            session.touched = now();
            // Refresh insertion order for bounded least-recently-used eviction.
            sessions.delete(session.id);
            sessions.set(session.id, session);
        }
        catch (error) {
            console.error('Weather mode update failed:', error);
            const content = 'Could not update this weather view. The current view is unchanged; please try again.';
            if (interaction.deferred || interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            else await privateReply(interaction, content);
        }
        finally { session.busy = false; }
    }

    return { start, handleButton };
}

const weatherNavigation = createWeatherNavigation();
module.exports = { createWeatherNavigation, weatherNavigation };
