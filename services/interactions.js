const { MessageFlags } = require('discord.js');
const { weatherNavigation } = require('./weather-navigation');

async function handleInteraction(interaction, logger = console) {
    const weatherButton = interaction.isButton?.() && interaction.customId.startsWith('weather:');
    if (!weatherButton && !interaction.isChatInputCommand()) return;
    try {
        if (weatherButton) {
            await weatherNavigation.handleButton(interaction);
            return;
        }
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) throw new Error('Unknown command: ' + interaction.commandName);
        await command.execute(interaction);
    }
    catch (error) {
        logger.error(error);
        try {
            const content = 'There was an error while executing this command!';
            if (weatherButton && (interaction.deferred || interaction.replied)) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            else if (interaction.deferred && !interaction.replied) await interaction.editReply({ content });
            else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
        catch (replyError) {
            logger.error('Failed to send command error response:', replyError);
        }
    }
}

module.exports = { handleInteraction };
