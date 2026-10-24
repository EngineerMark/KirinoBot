const { test } = require('node:test');
const assert = require('node:assert/strict');
const { measureText, wrapText, temperatureScale } = require('../services/weather-image-layout');
const { drawImageTitle } = require('../services/weather-image-title');
const { drawForecast } = require('../services/weather-forecast-image');
const { drawHourly } = require('../services/weather-hourly-image');
const { buildWeatherSvg } = require('../services/weather-image');
const { getWeatherEmbed } = require('../services/weather');

test('long headings stay inside the card and retain an inline flag without stretched glyphs', () => {
    const name = 'W'.repeat(100);
    const result = drawImageTitle(`Weather in ${name} at 12:00`, { name, country: 'NL' }, { plainText: String, escapeXml: String });
    assert.equal(result.lines, 2);
    assert.ok(result.overflow);
    assert.match(result.svg, /data:image\/svg\+xml/);
    assert.doesNotMatch(result.svg, /textLength|lengthAdjust/);
    for (const match of result.svg.matchAll(/<text x="([\d.]+)"[^>]*>([^<]*)<\/text>/g)) {
        assert.ok(Number(match[1]) + measureText(match[2], 30, true) <= 688.01, match[2]);
    }
    const flag = result.svg.match(/<image x="([\d.]+)"/);
    assert.ok(Number(flag[1]) + 36 <= 688.01);
    for (const line of wrapText('WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 190)) assert.ok(measureText(line) <= 190);
});

test('forecast scales use tidy ticks and do not bridge missing calendar days', () => {
    const scale = temperatureScale([8, 20]);
    assert.deepEqual(scale.ticks, [5, 10, 15, 20]);
    const flat = temperatureScale([0, 0]);
    assert.ok(flat.maximum > flat.minimum);
    const chart = drawForecast({ daily: [{}, { dt: 86400, temp: { min: 0, max: 10 } }, { dt: NaN }, { dt: 86400 * 3, temp: { min: 1, max: 11 } }] }, 0, 800);
    const high = chart.svg.match(/data-series="max" d="([^"]*)"/)[1];
    assert.equal((high.match(/M/g) || []).length, 2);
});

test('irregular hourly samples keep time labels apart and percentage labels inside the panel', () => {
    const chart = drawHourly({ current: { dt: 0 }, timezone_offset: 0, hourly: [0, 1, 2, 11, 12].map(hour => ({ dt: hour * 3600, temp: 10, pop: 0.5 })) }, 0);
    const positions = Array.from(chart.svg.matchAll(/<text x="([\d.]+)" y="122"/g), match => Number(match[1]));
    for (let index = 1; index < positions.length; index++) assert.ok(positions[index] - positions[index - 1] >= 90);
    assert.match(chart.svg, /x="678"[^>]*text-anchor="end"[^>]*>100%/);
});

test('missing main readings have clean labels without dangling units or duplicate unavailable text', () => {
    const location = { name: 'Test', country: 'NL', lat: 52, lon: 5 };
    const weather = { current: {} };
    const result = buildWeatherSvg(getWeatherEmbed(location, weather), 'normal', { weather, location });
    assert.doesNotMatch(result.svg, /Unavailable°C|Unavailable°F|Unavailable%|Unavailable hPa|Unavailable \/ Unavailable|N\/A km/);
});

test('a main image with hourly data and alerts still fits the final lightning metric', () => {
    const now = Math.floor(Date.now() / 3600000) * 3600;
    const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
    const weather = {
        current: { dt: now, temp: 14, feels_like: 11, humidity: 87, clouds: 78, wind_speed: 14, wind_deg: 220, pressure: 995, visibility: 3000, weather: [{ description: 'Moderate rain' }] },
        timezone_offset: 3600, daily: [{ temp: { min: 8, max: 16 } }],
        hourly: Array.from({ length: 13 }, (_, index) => ({ dt: now + index * 3600, temp: 10 + index / 2 })),
        alerts: Array(2).fill({ event: 'Wind Warning', start: now, end: now + 7200 }),
    };
    const airQuality = { list: [{ main: { aqi: 4 } }] };
    const lightning = { strikes: [] };
    const image = buildWeatherSvg(getWeatherEmbed(location, weather, airQuality, lightning), 'normal', { location, weather, airQuality, lightning });
    for (const name of ['Conditions', 'Hourly temperature', 'Humidity', 'Wind', 'Air Quality', 'Pressure', 'Visibility', 'Closest Lightning', 'Nearby Lightning Strikes']) assert.ok(image.svg.includes(name), name);
    assert.ok(image.height <= 960);
});
