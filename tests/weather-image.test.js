const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { getWeatherEmbed } = require('../services/weather');
const { getWeatherImage, buildWeatherSvg } = require('../services/weather-image');

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
        const reply = await getWeatherImage(embed, mode);
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

test('dynamic SVG text is escaped and excessive content has a complete text companion', async () => {
    const data = { title: '<script>& Amsterdam', fields: Array.from({ length: 25 }, (_, index) => ({ name: `Alert ${index}`, value: 'Long alert description '.repeat(80) })) };
    const result = buildWeatherSvg(data, 'alerts');
    assert.doesNotMatch(result.svg, /<script>/);
    assert.match(result.svg, /&lt;script&gt;&amp;/);
    assert.ok(result.overflow);
    const reply = await getWeatherImage(data, 'alerts');
    assert.equal(reply.files[1].name, 'weather-details.txt');
    assert.match(reply.files[1].attachment.toString(), /Alert 24/);
    assert.doesNotMatch(result.svg, /<t:/);
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
