const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { weatherResponse } = require('../services/weather-validation');
const { daylightData, nightRanges, daylightSummary, windSummary } = require('../services/weather-outlook-data');
const { drawDaylight } = require('../services/weather-daylight-image');
const { drawWindForecast } = require('../services/weather-wind-image');
const { drawHourly } = require('../services/weather-hourly-image');
const { getWeatherEmbed } = require('../services/weather');
const { getWeatherImage, buildWeatherSvg } = require('../services/weather-image');
const { drawForecast } = require('../services/weather-forecast-image');

const start = Date.parse('2026-10-25T00:00:00Z') / 1000 - 7200;
const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
function outlook() {
    return weatherResponse({
        current: { dt: start + 12 * 3600, sunrise: start + 7 * 3600, sunset: start + 18 * 3600, temp: 14, clouds: 50, wind_speed: 5, wind_deg: 0 }, timezone_offset: 7200,
        daily: Array.from({ length: 8 }, (_, index) => ({ dt: start + index * 86400 + 12 * 3600, sunrise: start + index * 86400 + 7 * 3600, sunset: start + index * 86400 + 18 * 3600, temp: { min: 10, max: 20 }, pop: 0.2 })),
        hourly: Array.from({ length: 13 }, (_, index) => ({ dt: start + (12 + index) * 3600, temp: 14, wind_speed: index, wind_gust: index * 2, wind_deg: index * 30 })),
    });
}

test('solar and hourly wind measurements survive repeated validation without converting missing values to zero', () => {
    const input = weatherResponse(outlook());
    assert.equal(input.current.sunrise, start + 7 * 3600);
    assert.equal(input.daily[1].sunset, start + 86400 + 18 * 3600);
    assert.equal(input.hourly[0].wind_speed, 0);
    assert.equal(input.hourly[0].wind_gust, 0);
    assert.equal(input.hourly[0].wind_deg, 0);
    assert.equal(input.hourly[12].wind_deg, 360);
    const invalid = weatherResponse({ current: { sunrise: '1', sunset: null }, daily: [{ sunrise: null }], hourly: [{ dt: 1, wind_speed: -1, wind_gust: '5', wind_deg: 361 }] });
    assert.ok(Number.isNaN(invalid.current.sunrise));
    assert.ok(Number.isNaN(invalid.current.sunset));
    assert.ok(Number.isNaN(invalid.hourly[0].wind_speed));
    assert.ok(Number.isNaN(invalid.hourly[0].wind_gust));
    assert.ok(Number.isNaN(invalid.hourly[0].wind_deg));
});

test('daylight calculations use local calendar days and distinguish before sunrise, daylight and night', () => {
    const weather = outlook();
    const day = daylightData(weather);
    assert.equal(day.sunriseLabel, '07:00');
    assert.equal(day.sunsetLabel, '18:00');
    assert.equal(day.length, 11 * 3600);
    assert.equal(day.remaining, 6 * 3600);
    assert.equal(day.status, '6h 0m left');
    assert.match(daylightData({ ...weather, current: { ...weather.current, dt: start + 6 * 3600 } }).status, /Sunrise in 1h/);
    assert.equal(daylightData({ ...weather, current: { ...weather.current, dt: start + 19 * 3600 } }).remaining, 0);
    assert.equal(daylightData({ ...weather, current: { ...weather.current, dt: start + 19 * 3600 } }).status, 'Daylight ended');
    const fallback = { ...weather, current: { dt: weather.current.dt } };
    assert.equal(daylightData(fallback).sunriseLabel, '07:00');
    assert.match(daylightSummary({ ...weather, timezone_offset: NaN }), /UTC/);
    assert.equal(daylightData({ current: { dt: weather.current.dt } }), null);
    assert.equal(daylightData({ current: { dt: weather.current.dt, sunrise: weather.current.sunset, sunset: weather.current.sunrise } }), null);
    assert.match(drawDaylight({ current: {} }, 0, 0), /Daylight unavailable/);
});

test('night shading respects both sides of midnight and omits unknown solar days', () => {
    const weather = outlook();
    const ranges = nightRanges(weather, start + 16 * 3600, start + 32 * 3600);
    assert.deepEqual(ranges, [[start + 18 * 3600, start + 24 * 3600], [start + 24 * 3600, start + 31 * 3600]]);
    assert.deepEqual(nightRanges({ current: {} }, start, start + 86400), []);
    assert.match(drawHourly(weather, 0).svg, /data-series="night"/);
});

test('wind and gust graphs use km/h, source direction arrows and gaps for missing measurements', () => {
    const weather = outlook();
    const chart = drawWindForecast(weather, 0);
    assert.match(chart.svg, /wind_speed/);
    assert.match(chart.svg, /wind_gust/);
    assert.match(chart.svg, /stroke-dasharray="4 3"/);
    assert.match(chart.svg, /rotate\(0\)/);
    assert.match(chart.svg, /rotate\(360\)/);
    assert.doesNotMatch(chart.svg, /NaN|undefined/);
    const gapped = drawWindForecast({ ...weather, hourly: weather.hourly.map((hour, index) => ({ ...hour, wind_gust: index === 3 ? NaN : hour.wind_gust })) }, 0);
    const path = gapped.svg.match(/data-series="wind_gust" d="([^"]*)"/)[1];
    assert.equal((path.match(/M/g) || []).length, 2);
    const missing = drawWindForecast({ ...weather, hourly: weather.hourly.map(hour => ({ ...hour, wind_gust: NaN })) }, 0);
    assert.match(missing.svg, /Gusts unavailable/);
    assert.equal(drawWindForecast({ ...weather, hourly: weather.hourly.map(hour => ({ ...hour, wind_speed: NaN, wind_gust: NaN })) }, 0), null);
    assert.match(windSummary(weather), /86\.4 km\/h/);
    const windOnly = drawForecast({ ...weather, daily: [] }, 150, 650);
    assert.match(windOnly.svg, /translate\(0 150\)/);
    assert.equal(windOnly.height, 180);
});

test('daylight and wind forecasts are available in embeds and bounded image variants', async () => {
    const weather = outlook();
    const main = getWeatherEmbed(location, weather);
    assert.match(main.toJSON().fields.find(field => field.name === 'Daylight').value, /Sunrise 07:00/);
    const forecast = getWeatherEmbed(location, weather, null, null, null, 'forecast');
    assert.match(forecast.toJSON().fields.find(field => field.name === 'Wind & Gusts Forecast').value, /Peak gusts/);
    const compact = drawForecast(weather, 152, 784);
    assert.equal(compact.overflow, false);
    assert.ok(compact.height <= 784);
    for (const [mode, embed] of [['normal', main], ['forecast', forecast]]) {
        const svg = buildWeatherSvg(embed, mode, { weather, location }).svg;
        assert.match(svg, mode === 'normal' ? /data-series="daylight"/ : /data-series="wind_gust"/);
        const reply = await getWeatherImage(embed, mode, { weather, location });
        const metadata = await sharp(reply.files[0].attachment).metadata();
        assert.equal(metadata.width, 720);
        assert.ok(metadata.height <= 960);
        assert.equal(reply.files.length, 1);
        assert.ok(reply.files[0].attachment.length < 1024 * 1024);
        if (mode === 'forecast') assert.match(svg, /Sun 1\/11/);
    }
});
