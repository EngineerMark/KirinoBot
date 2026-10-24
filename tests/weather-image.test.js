const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { getWeatherEmbed } = require('../services/weather');
const { getWeatherImage, buildWeatherSvg } = require('../services/weather-image');
const { weatherVisual, drawWindCompass } = require('../services/weather-visuals');

const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
const weather = {
    current: { dt: 1792861200, temp: 14.2, feels_like: 12.8, humidity: 78, clouds: 65, wind_speed: 4.2, wind_deg: 220, pressure: 1013, visibility: 10000, weather: [{ description: 'Scattered clouds', icon: '03d' }] },
    timezone_offset: 7200,
    daily: Array.from({ length: 8 }, (_, index) => ({ dt: 1792861200 + index * 86400, temp: { min: 8 + index, max: 16 + index }, pop: 0.2, weather: [{ description: 'Scattered clouds' }] })),
    alerts: [{ event: 'Strong winds', start: 1792861200, end: 1792947600, description: 'Strong gusts expected along the coast.', tags: ['wind'] }],
};

for (const mode of ['normal', 'forecast', 'alerts', 'airquality', 'lightning']) {
    test(`${mode} produces a bounded, compact PNG including unavailable notices`, async () => {
        const embed = getWeatherEmbed(location, weather, null, null, null, mode);
        const reply = await getWeatherImage(embed, mode, { weather });
        const buffer = reply.files[0].attachment;
        const metadata = await sharp(buffer).metadata();
        assert.equal(metadata.format, 'png');
        assert.equal(metadata.width, 720);
        assert.ok(metadata.height <= 960);
        assert.ok(buffer.length < 1024 * 1024);
        assert.ok(reply.files[0].description.length <= 1000);
        if (mode === 'lightning') assert.match(buildWeatherSvg(embed, mode).svg, /unavailable/);
    });
}

test('wind labels use unrounded measurements at Beaufort boundaries', () => {
    for (const [speed, label] of [[0, 'Calm'], [0.299, 'Calm'], [0.3, 'Light air'], [10.799, 'Fresh breeze'], [10.8, 'Strong breeze'], [17.2, 'Gale'], [32.7, 'Hurricane force']]) {
        const { badge, icon } = weatherVisual({ name: 'Wind' }, { weather: { current: { wind_speed: speed } } });
        assert.ok(badge.label.startsWith(label), `${speed}: ${badge.label}`);
        assert.equal(icon, 'wind');
        assert.ok(badge.fraction >= 0 && badge.fraction <= 1);
    }
    for (const speed of [undefined, null, NaN, -1, '20']) assert.equal(weatherVisual({ name: 'Wind' }, { weather: { current: { wind_speed: speed } } }).badge, null);
});

test('visual badges preserve zeros, missing values and the provider AQI scale', () => {
    assert.equal(weatherVisual({ name: 'Humidity' }, { weather: { current: { humidity: 0 } } }).badge.label, 'Low humidity');
    assert.equal(weatherVisual({ name: 'Visibility' }, { weather: { current: { visibility: 500 } } }).badge.label, 'Very low visibility');
    assert.equal(weatherVisual({ name: 'Air Quality' }, { airQuality: { list: [{ main: { aqi: 5 } }] } }).badge.label, 'Very poor · AQI 5');
    for (const name of ['Conditions', 'Wind', 'Humidity', 'Visibility', 'Air Quality', 'Air Stability']) assert.equal(weatherVisual({ name }).badge, null);
    const data = { title: 'Weather', fields: [{ name: 'Wind', value: '50 km/h' }] };
    const result = buildWeatherSvg(data, 'normal', { weather: { current: { wind_speed: 14 } } });
    assert.match(result.svg, /Near gale/);
    assert.match(result.fullText, /Near gale/);
    assert.match(result.svg, /viewBox="0 0 24 24"/);
});

test('dynamic SVG text is escaped and overflowing replies only attach an image', async () => {
    const data = { title: '<script>& Amsterdam', fields: Array.from({ length: 25 }, (_, index) => ({ name: `Alert ${index}`, value: 'Long alert description '.repeat(80) })) };
    const result = buildWeatherSvg(data, 'alerts');
    assert.doesNotMatch(result.svg, /<script>/);
    assert.match(result.svg, /&lt;script&gt;&amp;/);
    assert.ok(result.overflow);
    const reply = await getWeatherImage(data, 'alerts');
    assert.equal(reply.files.length, 1);
    assert.match(result.svg, /Some details omitted/);
    assert.doesNotMatch(result.svg, /weather-details\.txt/);
    assert.doesNotMatch(result.svg, /<t:/);
});

test('wind compass points toward the wind source and handles missing bearings', () => {
    for (const [degrees, direction] of [[0, 'N'], [90, 'E'], [180, 'S'], [270, 'W'], [220, 'SW'], [360, 'N']]) {
        const svg = drawWindCompass(degrees, 0, 0);
        assert.match(svg, new RegExp(`Wind from ${direction}"`));
        assert.ok(svg.includes(`rotate(${degrees % 360} 32 32)`));
    }
    for (const invalid of [null, undefined, NaN, -1, 361, '90']) {
        assert.match(drawWindCompass(invalid, 0, 0), /Unknown/);
        assert.doesNotMatch(drawWindCompass(invalid, 0, 0), /rotate\(/);
    }
});

test('slash command exposes independent output choices without a required default', () => {
    const command = require('../commands/weather/weather').data.toJSON();
    const output = command.options.find(option => option.name === 'output');
    assert.ok(!output.required);
    assert.deepEqual(output.choices.map(choice => choice.value), ['embed', 'image']);
});

for (const output of [null, 'image', 'failure']) {
    test(`command output routing: ${output || 'default embed'}`, async t => {
        const service = require('../services/weather');
        t.mock.method(service, 'getLocation', async () => location);
        t.mock.method(service, 'getWeather', async () => weather);
        t.mock.method(service, 'getAirQuality', async () => null);
        if (output === 'failure') {
            t.mock.method(require('../services/weather-image'), 'getWeatherImage', async () => { throw new Error('Render failed'); });
            t.mock.method(console, 'error', () => undefined);
        }
        delete require.cache[require.resolve('../commands/weather/weather')];
        const command = require('../commands/weather/weather');
        let reply;
        await command.execute({
            options: { getString: name => ({ location: 'Amsterdam', mode: 'airquality', output: output === 'failure' ? 'image' : output }[name]) },
            deferReply: async () => undefined,
            editReply: async value => { reply = value; },
        });
        if (output === 'image') {
            assert.ok(reply.files[0].attachment.length > 0);
            assert.equal(reply.embeds, undefined);
        }
        else {
            assert.ok(reply.embeds[0]);
            if (output === 'failure') assert.match(reply.content, /embed instead/);
        }
    });
}
