const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fetchWithCache } = require('../services/api');
const { getWeatherEmbed } = require('../services/weather');

test('API errors are rejected without caching or exposing keys', async (t) => {
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => {
        calls++;
        return calls === 1 ? { ok: false, status: 401 } : { ok: true, json: async () => ({ recovered: true }) };
    });
    const url = 'https://example.test/failure?key=secret';
    await assert.rejects(fetchWithCache(url), { message: 'API request failed with HTTP 401' });
    assert.deepEqual(await fetchWithCache(url), { recovered: true });
    assert.deepEqual(await fetchWithCache(url), { recovered: true });
    assert.equal(calls, 2);
});

const location = { name: 'Test', country: 'NL', lat: 52, lon: 5 };

test('lightning ranges and time windows include all matching strikes; zero CAPE remains valid', (t) => {
    const now = Date.parse('2026-10-24T00:00:00Z');
    t.mock.method(Date, 'now', () => now);
    const lightning = { strikes: Array.from({ length: 60 }, () => ({ coord: location, time: new Date(now - 60000) })) };
    const stability = { hourly: { time: ['2026-10-24T00:00', '2026-10-24T01:00'], cape: [0, 100] } };
    const embed = getWeatherEmbed(location, { current: {} }, null, lightning, stability, 'lightning').toJSON();
    const field = name => embed.fields.find(item => item.name === name).value;
    for (const range of [5, 10, 25, 50, 100]) assert.ok(field('Lightning Activity').includes(`Within ${range} km: **60**`));
    assert.ok(field('Recent Lightning Activity').includes('last 60 minutes: **1**'));
    assert.ok(field('Air Stability').startsWith('**0 J/kg** - **Stable**'));
    assert.ok(field('Air Stability').includes(`<t:${now / 1000 + 3600}:R>`));
});

test('alerts without tags render successfully', () => {
    const embed = getWeatherEmbed(location, { current: {}, alerts: [{ event: 'Rain', start: 1, end: 2, description: 'Rain expected.' }] }, null, null, null, 'alerts');
    assert.match(embed.toJSON().fields[0].name, /Rain/);
});

test('forecast only fetches location and weather', async (t) => {
    const urls = [];
    t.mock.method(globalThis, 'fetch', async (url) => {
        urls.push(url);
        if (url.includes('/geo/')) return { ok: true, json: async () => [location] };
        if (url.includes('/onecall')) return { ok: true, json: async () => ({ current: {}, timezone_offset: 0, daily: [] }) };
        throw new Error('Unexpected optional request');
    });
    let reply;
    await require('../commands/weather/weather').execute({
        user: { id: '123' },
        options: { getString: name => name === 'mode' ? 'forecast' : 'unique-test-location' },
        deferReply: async () => undefined,
        editReply: async value => { reply = value; return { id: 'weather-message' }; },
    });
    assert.equal(urls.length, 2);
    assert.equal(reply.embeds.length, 1);
});

test('server command handles direct messages', async () => {
    let reply;
    await require('../commands/utility/server').execute({ guild: null, reply: async value => { reply = value; } });
    assert.match(reply, /only available in a server/);
});
