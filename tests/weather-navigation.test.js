const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ButtonStyle, MessageFlags } = require('discord.js');
const { createWeatherNavigation, weatherNavigation } = require('../services/weather-navigation');
const { handleInteraction } = require('../services/interactions');

const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
function slash(messageId = 'message') {
    return {
        user: { id: 'owner' }, payloads: [],
        async editReply(payload) { this.payloads.push(payload); return { id: messageId }; },
    };
}
function buttons(payload) { return payload.components[0].toJSON().components; }
function button(payload, mode, overrides = {}) {
    const component = buttons(payload).find(item => item.custom_id.endsWith(':' + mode));
    return {
        customId: component.custom_id, user: { id: 'owner' }, message: { id: 'message' },
        payloads: [], privateReplies: [], deferred: false,
        async deferUpdate() { this.deferred = true; },
        async editReply(value) { this.payloads.push(value); return this.message; },
        async reply(value) { this.privateReplies.push(value); this.replied = true; },
        async followUp(value) { this.privateReplies.push(value); },
        ...overrides,
    };
}

for (const output of ['embed', 'image']) {
    test(`mode buttons preserve ${output} output and resolved location across all five views`, async () => {
        const calls = [];
        const nav = createWeatherNavigation({ render: async (...args) => {
            calls.push(args);
            return output === 'image' ? { files: [{ name: `weather-${args[1]}.png` }], embeds: [], attachments: [] } : { embeds: [{ title: args[1] }], files: [], attachments: [] };
        } });
        const command = slash();
        await nav.start(command, location, 'normal', output);
        let payload = command.payloads[0];
        const controls = buttons(payload);
        assert.equal(controls.length, 5);
        assert.equal(controls.find(item => item.disabled).label, 'Current');
        assert.ok(controls.every(item => item.custom_id.length <= 100));
        assert.ok(controls.every(item => !/embed|image/.test(item.custom_id)));
        for (const mode of ['forecast', 'lightning', 'airquality', 'alerts', 'normal']) {
            const interaction = button(payload, mode);
            await nav.handleButton(interaction);
            assert.ok(interaction.deferred);
            assert.equal(interaction.payloads.length, 1);
            payload = interaction.payloads[0];
            const selected = buttons(payload).filter(item => item.disabled);
            assert.equal(selected.length, 1);
            assert.ok(selected[0].custom_id.endsWith(':' + mode));
            assert.equal(selected[0].style, ButtonStyle.Primary);
            assert.deepEqual(payload.attachments, []);
        }
        assert.equal(calls.length, 6);
        for (const call of calls) {
            assert.deepEqual(call[0], location);
            assert.equal(call[2], output);
        }
    });
}

test('other users and copied or invalid button IDs cannot change a weather view', async () => {
    let renders = 0;
    const nav = createWeatherNavigation({ render: async () => {
        renders++;
        return {};
    } });
    const command = slash();
    await nav.start(command, location, 'normal', 'image');
    for (const overrides of [{ user: { id: 'other' } }, { message: { id: 'copied-message' } }, { customId: 'weather:invalid:image' }]) {
        const interaction = button(command.payloads[0], 'forecast', overrides);
        await nav.handleButton(interaction);
        assert.equal(interaction.deferred, false);
        assert.equal(interaction.payloads.length, 0);
        assert.equal(interaction.privateReplies[0].flags, MessageFlags.Ephemeral);
    }
    assert.equal(renders, 1);
});

test('expired, evicted and pre-restart views provide a private restart instruction', async () => {
    let clock = 0;
    const nav = createWeatherNavigation({ now: () => clock, ttl: 100, maxSessions: 1, render: async () => ({}) });
    const first = slash();
    await nav.start(first, location, 'normal', 'embed');
    const second = slash('second-message');
    await nav.start(second, location, 'normal', 'embed');
    const evicted = button(first.payloads[0], 'forecast');
    await nav.handleButton(evicted);
    assert.match(evicted.privateReplies[0].content, /expired.*\/weather/);
    clock = 100;
    const expired = button(second.payloads[0], 'forecast', { message: { id: 'second-message' } });
    await nav.handleButton(expired);
    assert.match(expired.privateReplies[0].content, /expired.*\/weather/);
    const restart = createWeatherNavigation({ render: async () => { throw new Error('must not render'); } });
    const old = button(second.payloads[0], 'forecast', { message: { id: 'second-message' } });
    await restart.handleButton(old);
    assert.match(old.privateReplies[0].content, /expired.*\/weather/);
});

test('overlapping switches cannot overwrite a newer view or start concurrent fetches', async () => {
    let release;
    let renders = 0;
    const nav = createWeatherNavigation({ render: async () => {
        if (++renders > 1) await new Promise(resolve => { release = resolve; });
        return {};
    } });
    const command = slash();
    await nav.start(command, location, 'normal', 'image');
    const first = button(command.payloads[0], 'forecast');
    const pending = nav.handleButton(first);
    await new Promise(resolve => setImmediate(resolve));
    const overlap = button(command.payloads[0], 'alerts');
    await nav.handleButton(overlap);
    assert.match(overlap.privateReplies[0].content, /updating/);
    assert.equal(renders, 2);
    release();
    await pending;
    assert.ok(buttons(first.payloads[0]).find(item => item.disabled).custom_id.endsWith(':forecast'));
});

test('render and upload failures preserve the existing output and release the update lock', async t => {
    t.mock.method(console, 'error', () => undefined);
    let fail = false;
    const nav = createWeatherNavigation({ render: async () => {
        if (fail) throw new Error('Image failed');
        return {};
    } });
    const command = slash();
    await nav.start(command, location, 'normal', 'image');
    fail = true;
    const failed = button(command.payloads[0], 'forecast');
    await nav.handleButton(failed);
    assert.equal(failed.payloads.length, 0);
    assert.match(failed.privateReplies[0].content, /unchanged/);
    fail = false;
    const upload = button(command.payloads[0], 'forecast', { editReply: async () => { throw new Error('Upload failed'); } });
    await nav.handleButton(upload);
    assert.match(upload.privateReplies[0].content, /unchanged/);
    const retry = button(command.payloads[0], 'forecast');
    await nav.handleButton(retry);
    assert.equal(retry.payloads.length, 1);
});

test('successful switches renew the inactivity expiry and current-mode clicks do not render', async () => {
    let clock = 0;
    let renders = 0;
    const nav = createWeatherNavigation({ now: () => clock, ttl: 100, render: async () => {
        renders++;
        return {};
    } });
    const command = slash();
    await nav.start(command, location, 'normal', 'embed');
    clock = 90;
    const switched = button(command.payloads[0], 'forecast');
    await nav.handleButton(switched);
    clock = 120;
    const current = button(switched.payloads[0], 'forecast');
    await nav.handleButton(current);
    assert.ok(current.deferred);
    assert.equal(renders, 2);
    const next = button(switched.payloads[0], 'alerts');
    await nav.handleButton(next);
    assert.equal(next.payloads.length, 1);
});

test('the shared interaction handler routes weather buttons and ignores unrelated buttons', async t => {
    let routed = 0;
    t.mock.method(weatherNavigation, 'handleButton', async () => { routed++; });
    await handleInteraction({ isButton: () => true, isChatInputCommand: () => false, customId: 'weather:test:forecast' });
    await handleInteraction({ isButton: () => true, isChatInputCommand: () => false, customId: 'other:test' });
    assert.equal(routed, 1);
});

for (const output of ['embed', 'image']) {
    test(`real weather button pipeline refreshes ${output} payloads and clears obsolete attachments`, async t => {
        const weatherService = require('../services/weather');
        const fetches = [];
        const imageModes = [];
        t.mock.method(weatherService, 'getWeather', async (lat, lon) => {
            fetches.push([lat, lon]);
            return { current: {}, daily: [] };
        });
        t.mock.method(weatherService, 'getAirQuality', async () => null);
        t.mock.method(weatherService, 'getAirQualityForecast', async () => null);
        t.mock.method(weatherService, 'getLightningData', async () => ({ strikes: [] }));
        t.mock.method(weatherService, 'getAirStability', async () => null);
        t.mock.method(require('../services/weather-image'), 'getWeatherImage', async (embed, mode) => {
            imageModes.push(mode);
            return { files: [{ attachment: Buffer.from(mode), name: `weather-${mode}.png` }] };
        });
        const command = slash();
        await weatherNavigation.start(command, location, 'forecast', output);
        let payload = command.payloads[0];
        for (const mode of ['airquality', 'lightning', 'alerts', 'normal']) {
            const click = button(payload, mode, { isButton: () => true, isChatInputCommand: () => false });
            await handleInteraction(click);
            assert.equal(click.payloads.length, 1);
            payload = click.payloads[0];
            assert.deepEqual(payload.attachments, []);
            assert.equal(payload.content, '');
            if (output === 'image') {
                assert.equal(payload.files[0].name, `weather-${mode}.png`);
                assert.deepEqual(payload.embeds, []);
            }
            else {
                assert.equal(payload.embeds.length, 1);
                assert.deepEqual(payload.files, []);
            }
        }
        assert.equal(fetches.length, 5);
        assert.ok(fetches.every(([lat, lon]) => lat === location.lat && lon === location.lon));
        assert.deepEqual(imageModes, output === 'image' ? ['forecast', 'airquality', 'lightning', 'alerts', 'normal'] : []);
    });
}
