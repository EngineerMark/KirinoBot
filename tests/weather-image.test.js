const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { getWeatherEmbed } = require('../services/weather');
const { getWeatherImage, buildWeatherSvg } = require('../services/weather-image');
const { weatherVisual, drawWindCompass } = require('../services/weather-visuals');
const { drawForecast, forecastDays } = require('../services/weather-forecast-image');
const { lightningBuckets, drawLightning } = require('../services/weather-lightning-image');
const { drawAirQuality, pollutantRating, BANDS } = require('../services/weather-airquality-image');
const { alertSeverity, alertStatus, alertIcon } = require('../services/weather-alerts-image');
const { weatherResponse } = require('../services/weather-validation');
const { countryFlag } = require('../services/weather-country-flag');

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

test('location flags use local SVG assets and safely omit unknown countries in every mode', async () => {
    for (const code of ['NL', 'US', 'JP', 'GB']) assert.match(countryFlag(code), /data:image\/svg\+xml;base64,/);
    assert.equal(countryFlag('NL'), countryFlag('nl'));
    for (const invalid of [null, undefined, '', 'ZZ', '../nl', '<svg>', 'NLD']) assert.equal(countryFlag(invalid), '');
    for (const mode of ['normal', 'forecast', 'airquality', 'alerts', 'lightning']) {
        const embed = getWeatherEmbed(location, weather, null, null, null, mode);
        const result = buildWeatherSvg(embed, mode, { weather, location });
        assert.match(result.svg, /data:image\/svg\+xml;base64,/);
        assert.match(result.svg, /x="32" y="82"/);
        assert.ok(result.svg.indexOf('Amsterdam</text>') < result.svg.indexOf('data:image/svg+xml;base64,'));
    }
    const reply = await getWeatherImage({ title: 'Weather in Amsterdam' }, 'normal', { location });
    assert.equal((await sharp(reply.files[0].attachment).metadata()).width, 720);
});

test('alert badges reflect explicit title labels, without guessing severity from hazard text', () => {
    for (const [event, label] of [['Red warning of wind', 'Red warning'], ['Orange weather alert', 'Orange alert'], ['Yellow warning', 'Yellow warning'], ['Tornado Warning', 'Warning'], ['Flood Watch', 'Watch'], ['Wind Advisory', 'Advisory'], ['Severe thunderstorm', 'Unspecified'], ['Strong winds', 'Unspecified']]) {
        assert.equal(alertSeverity(event).label, label);
    }
    assert.equal(alertIcon({ event: 'Flood Watch' }), 'flood');
    assert.equal(alertIcon({ event: 'Weather event', tags: ['Snow'] }), 'snow');
    assert.equal(alertIcon({ event: 'Tornado Warning' }), 'tornado');
    assert.equal(alertStatus({ start: 10, end: 20 }, 15000), 'Active');
    assert.equal(alertStatus({ start: 10, end: 20 }, 5000), 'Upcoming');
    assert.equal(alertStatus({ start: 10, end: 20 }, 25000), 'Expired');
    assert.equal(alertStatus({ start: null, end: 20 }, 15000), 'Timing unknown');
});

test('main image shows compact alert symbols with timing instead of alert text panels', () => {
    const now = Math.floor(Date.now() / 1000);
    const input = { ...weather, alerts: [{ event: 'Red warning of wind', start: now - 60, end: now + 3600, description: 'Unique full alert description', tags: ['wind'] }, { event: 'Flood Watch', start: now + 7200, end: now + 14400 }] };
    const embed = getWeatherEmbed(location, input);
    const result = buildWeatherSvg(embed, 'normal', { weather: input });
    assert.match(result.svg, /left/);
    assert.match(result.svg, /In 2h/);
    assert.match(result.svg, /#ff889c/);
    assert.match(result.fullText, /Red warning of wind/);
    assert.doesNotMatch(result.svg, /Weather Alerts|Red warning of wind|Flood Watch|Unique full alert description/);
    const empty = buildWeatherSvg(embed, 'normal', { weather: { ...input, alerts: [] } });
    assert.doesNotMatch(empty.svg, /left|In 2h/);
    const many = buildWeatherSvg(embed, 'normal', { weather: { ...input, alerts: Array(20).fill(input.alerts[0]) } });
    assert.match(many.svg, />\+14</);
    assert.ok(many.height <= 960);
});

test('themed alert cards preserve sources, escape content, and stay bounded with many long alerts', async () => {
    const input = weatherResponse({ current: {}, timezone_offset: 3600, alerts: Array.from({ length: 20 }, () => ({ event: 'Flood Warning <test> '.repeat(20), sender_name: 'Agency & partners', start: 100, end: 200, description: 'Long description '.repeat(100) })) });
    assert.equal(weatherResponse(input).alerts[0].sender_name, 'Agency & partners');
    const embed = getWeatherEmbed(location, input, null, null, null, 'alerts');
    const result = buildWeatherSvg(embed, 'alerts', { weather: input });
    assert.match(result.svg, /Agency &amp; partners/);
    assert.match(result.svg, /Showing 2 of 20 alerts/);
    assert.doesNotMatch(result.svg, /<test>|weather-details|optional feeds/);
    assert.match(result.svg, /Warning/);
    const reply = await getWeatherImage(embed, 'alerts', { weather: input });
    assert.equal(reply.files.length, 1);
    assert.ok((await sharp(reply.files[0].attachment).metadata()).height <= 960);
    const empty = buildWeatherSvg({ title: 'Alerts' }, 'alerts', { weather: { alerts: [] } });
    assert.match(empty.svg, /No weather alerts reported/);
    const missing = buildWeatherSvg({ title: 'Alerts' }, 'alerts', { weather: { alerts: null } });
    assert.match(missing.svg, /Alert status unavailable/);
    assert.doesNotMatch(missing.svg, /No weather alerts reported/);
});

test('air pollutant ratings use inclusive provider boundaries and leave ungraded readings alone', () => {
    for (const [key, limits] of Object.entries(BANDS)) {
        assert.equal(pollutantRating(key, 0), 1);
        limits.forEach((limit, index) => {
            assert.equal(pollutantRating(key, limit - 0.001), index + 1);
            assert.equal(pollutantRating(key, limit), index + 2);
        });
        for (const invalid of [null, undefined, NaN, -1, '20']) assert.equal(pollutantRating(key, invalid), null);
    }
    assert.equal(pollutantRating('no', 100), null);
    assert.equal(pollutantRating('nh3', 100), null);
    assert.equal(drawAirQuality(null, 0), null);
});

test('air quality chart preserves missing readings and produces a single compact themed image', async () => {
    const airQuality = { list: [{ main: { aqi: 4 }, components: { pm2_5: 55, pm10: 110, co: 0, o3: 110, no2: null, so2: 5, no: 2, nh3: 3 } }] };
    const chart = drawAirQuality(airQuality, 0);
    assert.match(chart.svg, /Poor · 4\/5/);
    assert.match(chart.svg, /Unavailable/);
    assert.match(chart.svg, /not rated on this scale/);
    assert.match(chart.summary, /CO: 0 µg\/m³, 1\/5 Good/);
    assert.doesNotMatch(chart.svg, /NaN|undefined|https?:/);
    const embed = getWeatherEmbed(location, weather, airQuality, null, null, 'airquality');
    const reply = await getWeatherImage(embed, 'airquality', { weather, airQuality });
    assert.equal(reply.files.length, 1);
    const metadata = await sharp(reply.files[0].attachment).metadata();
    assert.equal(metadata.width, 720);
    assert.ok(metadata.height <= 960);
    assert.ok(reply.files[0].attachment.length < 1024 * 1024);
    assert.match(reply.files[0].description, /PM2.5: 55 µg\/m³, 4\/5 Poor/);
});

test('lightning graph buckets the last two hours and excludes distant, future and invalid strikes', async () => {
    const now = Date.parse('2026-10-25T12:00:00Z');
    const strike = (minutes, coord = location) => ({ time: new Date(now - minutes * 60000), coord });
    const lightning = { strikes: [strike(120), strike(110), strike(0), strike(121), strike(-1), strike(10, { lat: 0, lon: 0 }), { time: new Date('bad'), coord: location }] };
    const buckets = lightningBuckets(lightning, location, now);
    assert.equal(buckets[0].count, 1);
    assert.equal(buckets[1].count, 1);
    assert.equal(buckets[11].count, 1);
    assert.equal(buckets.reduce((sum, bucket) => sum + bucket.count, 0), 3);
    assert.equal(buckets[0].nearest, 0);
    assert.equal(buckets[2].nearest, null);
    assert.equal(drawLightning(null, location, 0, now), null);
    const empty = drawLightning({ strikes: [] }, location, 0, now);
    assert.ok(empty);
    assert.doesNotMatch(empty.svg, /NaN|undefined|https?:/);
    const image = await getWeatherImage({ title: 'Lightning', fields: [] }, 'lightning', { lightning: { strikes: [] }, location });
    assert.equal(image.files.length, 1);
    assert.equal((await sharp(image.files[0].attachment).metadata()).width, 720);
    const svg = buildWeatherSvg({ title: 'Lightning' }, 'lightning', { lightning: { strikes: [] }, location }).svg;
    assert.match(svg, /Strikes \/ 10 min/);
    assert.doesNotMatch(svg, /missing|incomplete|footer/i);
});

test('forecast graph uses local dates, all seven upcoming days and gaps for missing temperatures', () => {
    const input = { timezone_offset: 3600, daily: Array.from({ length: 8 }, (_, index) => ({ dt: Date.parse('2026-10-24T23:30Z') / 1000 + index * 86400, temp: { min: index === 3 ? null : -5, max: 0 }, pop: index === 1 ? 0 : null })) };
    const days = forecastDays(input);
    assert.equal(days.length, 7);
    assert.equal(days[0].date, '2026-10-26');
    const graph = drawForecast(input, 114, 820);
    assert.equal(graph.overflow, false);
    assert.match(graph.svg, /0% precip\. chance/);
    assert.match(graph.svg, /-5°/);
    assert.doesNotMatch(graph.svg, /NaN|undefined|null|https?:/);
    const lowPath = graph.svg.match(/data-series="min" d="([^"]*)"/)[1];
    assert.equal((lowPath.match(/M/g) || []).length, 2);
    assert.equal(drawForecast({ daily: [] }, 0, 800), null);
    const missing = drawForecast({ daily: [{}, { dt: 123, temp: {} }] }, 0, 800);
    assert.match(missing.svg, /Temperature data unavailable/);
    assert.doesNotMatch(missing.svg, /NaN|undefined/);
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
    assert.doesNotMatch(result.svg, /Some details omitted|Descriptive bands|optional feeds/);
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
