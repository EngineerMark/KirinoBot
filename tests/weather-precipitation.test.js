const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { weatherResponse } = require('../services/weather-validation');
const { precipitationAmount, formatAmount } = require('../services/weather-precipitation');
const { drawHourly } = require('../services/weather-hourly-image');
const { getWeatherEmbed } = require('../services/weather');
const { getWeatherImage } = require('../services/weather-image');

const start = 1792886400;
function weatherWith(amounts) {
    return weatherResponse(weatherResponse({ current: { dt: start }, timezone_offset: 0, hourly: amounts.map((amount, index) => ({ dt: start + index * 3600, temp: 12, pop: 0.5, ...amount })) }));
}

test('rain and snow rates survive validation, combine when supplied, and preserve zeros and missing data', () => {
    const input = weatherWith([{ rain: { '1h': 1.5 }, snow: { '1h': 0.25 } }, { rain: { '1h': 0 } }, {}, { snow: { '1h': 2 } }, { rain: { '1h': '3' } }, { rain: null }, { rain: { '1h': -1 } }, { rain: { '1h': 1 }, snow: { '1h': null } }]);
    assert.equal(precipitationAmount(input.hourly[0]), 1.75);
    assert.equal(precipitationAmount(input.hourly[1]), 0);
    assert.ok(Number.isNaN(precipitationAmount(input.hourly[2])));
    assert.equal(precipitationAmount(input.hourly[3]), 2);
    assert.ok(input.hourly.slice(4).every(hour => Number.isNaN(precipitationAmount(hour))));
    assert.equal(formatAmount(0.001), '<0.01');
    assert.equal(formatAmount(10000), '1.0e+4');
    assert.equal(formatAmount(-1), '—');
});

test('hourly amounts coexist with chance bars without increasing graph height or hiding trace precipitation', () => {
    const weather = weatherWith([{ rain: { '1h': 0 } }, { rain: { '1h': 0.5 } }, {}, { rain: { '1h': 0.001 } }, { snow: { '1h': 2 } }]);
    const chart = drawHourly(weather, 0);
    const labels = Array.from(chart.svg.matchAll(/data-series="precipitation-amount"[^>]*>([^<]*)<\/text>/g), match => match[1]);
    assert.deepEqual(labels, ['0', '0.5', '—', '&lt;0.01', '2']);
    assert.match(chart.svg, /Precip\. chance/);
    assert.match(chart.svg, /100%/);
    assert.match(chart.svg, /mm\/h/);
    assert.equal(chart.height, 146);
    assert.doesNotMatch(chart.svg, /NaN|undefined/);
    assert.match(chart.summary, /0.5 mm\/h/);
    assert.match(chart.summary, /amount unavailable/);
    const noChance = drawHourly({ ...weather, hourly: weather.hourly.map(hour => ({ ...hour, pop: NaN })) }, 0);
    assert.match(noChance.svg, /Precip\. amount · mm\/h/);
    assert.doesNotMatch(noChance.svg, /100%/);
    const missing = drawHourly(weatherWith([{}, {}]), 0);
    assert.doesNotMatch(missing.svg, /precipitation-amount|mm\/h/);
    assert.equal(missing.height, chart.height);
});

test('precipitation amounts render in a single bounded weather image', async () => {
    const weather = weatherWith(Array.from({ length: 13 }, (_, index) => ({ rain: { '1h': index / 10 } })));
    const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
    const reply = await getWeatherImage(getWeatherEmbed(location, weather), 'normal', { weather, location });
    const metadata = await sharp(reply.files[0].attachment).metadata();
    assert.equal(reply.files.length, 1);
    assert.equal(metadata.width, 720);
    assert.ok(metadata.height <= 960);
    assert.ok(reply.files[0].attachment.length < 1024 * 1024);
    assert.match(reply.files[0].description, /mm\/h/);
});
