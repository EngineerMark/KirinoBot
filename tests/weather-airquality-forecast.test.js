const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { airQualityForecastResponse } = require('../services/weather-validation');
const { drawAirQualityForecast } = require('../services/weather-airquality-forecast-image');
const { buildWeatherSvg, getWeatherImage } = require('../services/weather-image');
const { buildWeatherReply } = require('../services/weather-reply');

const now = Date.parse('2026-10-25T00:30:00Z');
const start = Math.floor(now / 3600000) * 3600;
const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
const current = { list: [{ main: { aqi: 4 }, components: { co: 0, pm2_5: 55 } }] };
const forecast = () => ({ list: Array.from({ length: 49 }, (_, index) => ({ dt: start + index * 3600, main: { aqi: 1 + index % 5 } })) });

test('forecast validation sorts and deduplicates dates while keeping invalid AQI gaps', () => {
    const input = { list: [{ dt: start + 7200, main: { aqi: 0 } }, { dt: start, main: { aqi: 2 } }, { dt: start + 3600, main: { aqi: 6 } }, { dt: start + 3600, main: { aqi: 5 } }, { dt: 'bad', main: { aqi: 4 } }] };
    const result = airQualityForecastResponse(input);
    assert.deepEqual(result.list.slice(0, 2).map(item => item.main.aqi), [2, 5]);
    assert.ok(Number.isNaN(result.list[2].main.aqi));
    assert.deepEqual(airQualityForecastResponse(result), result);
    for (const bad of [null, {}, { list: [] }, { list: [{ dt: start, main: { aqi: '3' } }] }]) assert.throws(() => airQualityForecastResponse(bad), /Invalid air quality forecast/);
});

test('AQI graph uses categorical steps, local times, next-day labels and missing-data gaps', () => {
    const data = forecast();
    data.list[3].main.aqi = NaN;
    const chart = drawAirQualityForecast(data, 0, 7200, 190, now);
    assert.match(chart.svg, /AQI forecast · next 24h/);
    assert.match(chart.svg, /02:00/);
    assert.match(chart.svg, /02:00 \+1d/);
    const line = chart.svg.match(/data-series="aqi-forecast" d="([^"]*)"/)[1];
    assert.equal((line.match(/M/g) || []).length, 2);
    assert.match(line, /H.*V/);
    assert.doesNotMatch(chart.svg, /NaN|undefined|https?:/);
    assert.match(chart.summary, /1–5/);
    assert.equal(drawAirQualityForecast({ list: [{ dt: start - 3600, main: { aqi: 5 } }] }, 0, 0, 190, now), null);
    assert.match(drawAirQualityForecast(forecast(), 0, NaN, 190, now).svg, /UTC/);
});

test('AQI forecast and all current readings fit one image even with a long location heading', async t => {
    t.mock.method(Date, 'now', () => now);
    const context = { airQuality: current, airQualityForecast: forecast(), weather: { current: {}, timezone_offset: 7200 }, location };
    for (const title of ['Air Quality in Amsterdam', 'Air Quality in a very long location name that needs two lines']) {
        const result = buildWeatherSvg({ title }, 'airquality', context);
        assert.match(result.svg, /aqi-forecast/);
        assert.match(result.svg, /Pollutant severity/);
        assert.match(result.svg, /NH₃/);
        const reply = await getWeatherImage({ title }, 'airquality', context);
        const metadata = await sharp(reply.files[0].attachment).metadata();
        assert.equal(reply.files.length, 1);
        assert.equal(metadata.width, 720);
        assert.ok(metadata.height <= 960);
        assert.ok(reply.files[0].attachment.length < 1024 * 1024);
        assert.match(reply.files[0].description, /AQI forecast/);
    }
    const missing = buildWeatherSvg({ title: 'Air Quality' }, 'airquality', { ...context, airQualityForecast: null });
    assert.match(missing.svg, /Forecast unavailable/);
    assert.match(missing.svg, /Pollutant severity/);
    const forecastOnly = buildWeatherSvg({ title: 'Air Quality' }, 'airquality', { ...context, airQuality: null });
    assert.match(forecastOnly.svg, /aqi-forecast/);
});

test('forecast fetching is restricted to air-quality image output and feed failures preserve current readings', async t => {
    const service = require('../services/weather');
    let forecastCalls = 0;
    let context;
    t.mock.method(console, 'error', () => undefined);
    t.mock.method(service, 'getWeather', async () => ({ current: {} }));
    t.mock.method(service, 'getAirQuality', async () => current);
    t.mock.method(service, 'getLightningData', async () => null);
    t.mock.method(service, 'getAirQualityForecast', async () => {
        forecastCalls++;
        throw new Error('Feed unavailable');
    });
    t.mock.method(require('../services/weather-image'), 'getWeatherImage', async (embed, mode, data) => {
        context = data;
        return { files: [{ name: 'weather.png', attachment: Buffer.from('image') }] };
    });
    const image = await buildWeatherReply(location, 'airquality', 'image');
    assert.equal(forecastCalls, 1);
    assert.equal(image.files.length, 1);
    assert.deepEqual(context.airQuality, current);
    assert.equal(context.airQualityForecast, null);
    await buildWeatherReply(location, 'airquality', 'embed');
    await buildWeatherReply(location, 'normal', 'image');
    await buildWeatherReply(location, 'forecast', 'image');
    assert.equal(forecastCalls, 1);
});

test('air-quality forecast API responses are validated and cached, while malformed responses can be retried', async t => {
    delete require.cache[require.resolve('../services/api')];
    delete require.cache[require.resolve('../services/weather')];
    const service = require('../services/weather');
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async url => {
        calls++;
        assert.ok(url.startsWith('https://api.openweathermap.org/data/2.5/air_pollution/forecast?'));
        return { ok: true, json: async () => calls === 1 ? {} : forecast() };
    });
    await assert.rejects(service.getAirQualityForecast(52, 5), /Invalid air quality forecast/);
    const result = await service.getAirQualityForecast(52, 5);
    assert.equal(result.list.length, 49);
    assert.deepEqual(await service.getAirQualityForecast(52, 5), result);
    assert.equal(calls, 2);
});
