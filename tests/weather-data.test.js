const { test } = require('node:test');
const assert = require('node:assert/strict');
const validation = require('../services/weather-validation');
const { getWeatherEmbed } = require('../services/weather');
const location = { name: 'Test', lat: 52, lon: 5, country: 'NL' };
const field = (embed, name) => embed.toJSON().fields.find(item => item.name === name)?.value;

function freshWeather() {
    delete require.cache[require.resolve('../services/api')];
    delete require.cache[require.resolve('../services/weather')];
    return require('../services/weather');
}

for (const scenario of ['complete-empty', 'partial-http', 'partial-shape', 'invalid-records', 'unavailable']) {
    test(`lightning coverage: ${scenario}`, async (t) => {
        const weather = freshWeather();
        t.mock.method(console, 'error', () => undefined);
        t.mock.method(globalThis, 'fetch', async url => {
            const first = url.includes('strikes_00');
            if (scenario === 'unavailable' || (scenario === 'partial-http' && first)) return { ok: false, status: 503 };
            const data = scenario === 'partial-shape' && first ? { error: 'bad payload' }
                : scenario === 'invalid-records' && first ? [[5, 52, '2026-10-24 12:00:00.123456789'], [999, 999, 'not-a-date']] : [];
            return { ok: true, json: async () => data };
        });
        const lightning = await weather.getLightningData();
        const embed = weather.getWeatherEmbed(location, { current: {} }, null, lightning, null, 'lightning');
        if (scenario === 'unavailable') {
            assert.equal(lightning, null);
            assert.equal(embed.toJSON().description, undefined);
            assert.equal(field(embed, 'Lightning Activity'), undefined);
        }
        else if (scenario === 'complete-empty') {
            assert.equal(lightning.availableFeeds, 24);
            assert.match(field(embed, 'Lightning Activity'), /Within 5 km: \*\*0\*\*/);
            assert.equal(embed.toJSON().description, undefined);
        }
        else {
            assert.equal(embed.toJSON().description, undefined);
            assert.equal(lightning.availableFeeds, scenario === 'invalid-records' ? 24 : 23);
            if (scenario === 'invalid-records') {
                assert.equal(lightning.invalidRecords, 1);
                assert.equal(lightning.strikes[0].time.toISOString(), '2026-10-24T12:00:00.123Z');
            }
            const normal = weather.getWeatherEmbed(location, { current: {} }, null, lightning);
            assert.equal(normal.toJSON().description, undefined);
        }
    });
}

test('missing current measurements and air quality do not become zero or crash', () => {
    const embed = getWeatherEmbed(location, { current: { temp: '12', humidity: null, weather: null }, daily: [null] }, { list: [] });
    assert.match(field(embed, 'Conditions'), /Unavailable/);
    assert.doesNotMatch(field(embed, 'Conditions'), /0\.0°C|32\.0°F/);
    assert.match(field(embed, 'Humidity'), /Unavailable/);
    assert.match(field(embed, 'Air Quality'), /Unavailable/);
    assert.match(field(embed, 'Nearby Lightning Strikes'), /Unavailable/);
    assert.doesNotMatch(JSON.stringify(embed.toJSON()), /NaN|undefined/);
});

test('valid zeros remain visible for weather and air pollutants', () => {
    const embed = getWeatherEmbed(location, { current: { temp: 0, humidity: 0 } }, { list: [{ main: { aqi: 1 }, components: { co: 0, no: null, pm10: '3' } }] }, null, null, 'airquality');
    assert.match(field(embed, 'CO'), /0\.0/);
    assert.match(field(embed, 'NO'), /Unavailable/);
    assert.match(field(embed, 'PM10'), /Unavailable/);
    const normal = getWeatherEmbed(location, { current: { temp: 0, humidity: 0 } });
    assert.match(field(normal, 'Conditions'), /0\.0°C/);
    assert.match(field(normal, 'Humidity'), /\*\*0%\*\*/);
});

test('CAPE stays visible when lightning fails; malformed CAPE is unavailable', (t) => {
    t.mock.method(Date, 'now', () => Date.parse('2026-10-24T00:00Z'));
    const stability = { hourly: { time: ['2026-10-24T00:00'], cape: [0] } };
    const good = getWeatherEmbed(location, { current: {} }, null, null, stability, 'lightning');
    assert.match(field(good, 'Air Stability'), /\*\*0 J\/kg\*\* - \*\*Stable/);
    for (const invalid of [{}, { hourly: { time: ['bad'], cape: [20] } }, { hourly: { time: ['2026-10-24T00:00'], cape: [] } }, { hourly: { time: ['2026-10-24T00:00'], cape: [null] } }]) {
        assert.match(field(getWeatherEmbed(location, { current: {} }, null, null, invalid, 'lightning'), 'Air Stability'), /unavailable/);
    }
});

test('bad forecasts and alert records render as incomplete or unavailable', () => {
    for (const mode of ['forecast', 'alerts', 'airquality']) {
        const embed = getWeatherEmbed({ ...location, country: null }, { current: {}, daily: null, alerts: {} }, { list: [] }, null, null, mode);
        assert.match(embed.toJSON().description, /unavailable/i);
    }
    const alerts = getWeatherEmbed(location, { current: {}, alerts: [null, { event: 'Storm', tags: [123], start: 'bad', description: null }] }, null, null, null, 'alerts').toJSON();
    assert.match(alerts.description, /Incomplete weather alerts/);
    assert.match(alerts.fields[0].name, /Unavailable/);
    assert.doesNotMatch(alerts.fields[0].name, /<t:null/);
    const forecast = getWeatherEmbed(location, { current: {}, timezone_offset: 0, daily: [null, { dt: 123, temp: null, weather: [] }] }, null, null, null, 'forecast').toJSON();
    assert.match(forecast.description, /Incomplete forecast/);
    assert.match(forecast.fields[0].value, /Unavailable/);
});

test('validators reject unusable responses and distinguish not-found locations', () => {
    assert.equal(validation.locationResponse([]), null);
    for (const input of [null, {}, [{ lat: 999, lon: 5, name: 'Bad' }]]) assert.throws(() => validation.locationResponse(input), /Invalid location/);
    for (const input of [null, {}, { current: [] }]) assert.throws(() => validation.weatherResponse(input), /Invalid weather/);
    for (const input of [null, { list: [] }, { list: [{ main: { aqi: 0 } }] }]) assert.throws(() => validation.airQualityResponse(input), /Invalid air quality/);
    assert.throws(() => validation.lightningResponse([[0, 0, 'bad']]), /Invalid lightning/);
});

test('malformed successful HTTP responses are not cached', async (t) => {
    const weather = freshWeather();
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ++calls === 1 ? {} : [location] }));
    await assert.rejects(weather.getLocation('cache-retry'), /Invalid location/);
    assert.equal((await weather.getLocation('cache-retry')).name, 'Test');
    assert.equal((await weather.getLocation('cache-retry')).name, 'Test');
    assert.equal(calls, 2);
});

test('air-quality command reports feed failure without losing the weather reply', async (t) => {
    freshWeather();
    delete require.cache[require.resolve('../commands/weather/weather')];
    t.mock.method(console, 'error', () => undefined);
    t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => url.includes('/geo/') ? [location] : url.includes('/onecall') ? { current: {} } : { list: [] } }));
    let reply;
    await require('../commands/weather/weather').execute({
        options: { getString: name => name === 'mode' ? 'airquality' : 'Test' },
        deferReply: async () => undefined,
        editReply: async value => { reply = value; },
    });
    assert.match(reply.embeds[0].toJSON().description, /Air quality data unavailable/);
});

test('forecast chart uses local dates and missing temperatures stay null', () => {
    const day = { dt: Date.parse('2026-10-24T23:30:00Z') / 1000, weather: [] };
    for (const offset of [3600, undefined]) {
        const json = getWeatherEmbed(location, { current: {}, timezone_offset: offset, daily: [day, { ...day, dt: day.dt + 86400 }] }, null, null, null, 'forecast').toJSON();
        const chart = JSON.parse(new URL(json.image.url).searchParams.get('c'));
        assert.deepEqual(chart.data.labels, offset ? ['10-25', '10-26'] : ['10-24', '10-25']);
        assert.deepEqual(chart.data.datasets[0].data, [null, null]);
        assert.doesNotMatch(JSON.stringify(chart), /NaN/);
        if (!offset) assert.match(json.description, /dates shown in UTC/);
    }
});
