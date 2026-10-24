const { test } = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { projectStrikes, drawLightningMap, AGE_BANDS } = require('../services/weather-lightning-map');
const { getWeatherImage, buildWeatherSvg } = require('../services/weather-image');
const { getWeatherEmbed } = require('../services/weather');

const now = Date.parse('2026-10-25T12:00:00Z');
const location = { name: 'Test', lat: 0, lon: 0, country: 'NL' };
const strike = (lat, lon, minutes = 5) => ({ coord: { lat, lon }, time: new Date(now - minutes * 60000) });

test('strike positions use distance and bearing with north up and east right', () => {
    const points = projectStrikes({ strikes: [strike(0.45, 0), strike(0, 0.45), strike(-0.45, 0), strike(0, -0.45), strike(0, 0)] }, location, now);
    assert.ok(Math.abs(points[0].x) < 1e-9 && points[0].y < -0.49);
    assert.ok(points[1].x > 0.49 && Math.abs(points[1].y) < 1e-9);
    assert.ok(points[2].y > 0.49 && Math.abs(points[2].x) < 1e-9);
    assert.ok(points[3].x < -0.49 && Math.abs(points[3].y) < 1e-9);
    assert.equal(Math.hypot(points[4].x, points[4].y), 0);
    assert.ok(points.every(point => Math.hypot(point.x, point.y) <= 1));
    const dateline = projectStrikes({ strikes: [strike(0, -179.9)] }, { lat: 0, lon: 179.9 }, now);
    assert.ok(dateline[0].x > 0 && dateline[0].distance < 23);
    const polar = projectStrikes({ strikes: [strike(89, 1)] }, { lat: 89, lon: 0 }, now);
    assert.ok(Number.isFinite(polar[0].x) && Number.isFinite(polar[0].y));
});

test('strike map filters to 100 km and two hours, assigns ages and paints older strikes first', () => {
    const data = { strikes: [strike(0, 0, 0), strike(0, 0, 15), strike(0, 0, 15.01), strike(0, 0, 30), strike(0, 0, 30.01), strike(0, 0, 60), strike(0, 0, 60.01), strike(0, 0, 120), strike(0, 0, 121), strike(0, 0, -1), strike(1, 0), strike(999, 0), { coord: location, time: new Date('invalid') }] };
    const points = projectStrikes(data, location, now);
    assert.equal(points.length, 8);
    assert.deepEqual(points.map(point => point.band), [3, 3, 2, 2, 1, 1, 0, 0]);
    assert.equal(drawLightningMap(null, location, 0, now), null);
    assert.equal(drawLightningMap(data, { lat: 999, lon: 0 }, 0, now), null);
    const empty = drawLightningMap({ strikes: [] }, location, 0, now);
    assert.match(empty.svg, /0 strikes plotted/);
    assert.match(empty.svg, /Nearest: —/);
    assert.doesNotMatch(empty.svg, /NaN|undefined|https?:/);
    assert.equal(projectStrikes({ strikes: Array(5000).fill(strike(0, 0)) }, location, now).length, 5000);
});

test('themed lightning map preserves the timeline and air stability in one bounded PNG', async t => {
    t.mock.method(Date, 'now', () => now);
    const lightning = { strikes: [strike(0.2, 0.3, 10), strike(-0.2, -0.3, 80)] };
    const weather = { current: {} };
    const embed = getWeatherEmbed(location, weather, null, lightning, null, 'lightning');
    const context = { weather, lightning, location };
    const svg = buildWeatherSvg(embed, 'lightning', context).svg;
    for (const text of ['Strike positions', 'Strikes / 10 min', 'Air Stability', '25 km', '50 km', '100 km']) assert.ok(svg.includes(text), text);
    for (const band of AGE_BANDS) assert.ok(svg.includes(band.color));
    const reply = await getWeatherImage(embed, 'lightning', context);
    const metadata = await sharp(reply.files[0].attachment).metadata();
    assert.equal(reply.files.length, 1);
    assert.equal(metadata.width, 720);
    assert.ok(metadata.height <= 960);
    assert.ok(reply.files[0].attachment.length < 1024 * 1024);
    assert.match(reply.files[0].description, /Strike map: 2 strikes/);
});
