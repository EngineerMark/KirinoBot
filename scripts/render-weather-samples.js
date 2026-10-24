const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const { getWeatherEmbed } = require('../services/weather');
const { weatherResponse } = require('../services/weather-validation');
const { getWeatherImage } = require('../services/weather-image');

async function renderSamples(directory) {
    await fs.mkdir(directory, { recursive: true });
    const observedAt = Date.now();
    const now = Math.floor(observedAt / 3600000) * 3600;
    const midnight = Math.floor((now + 3600) / 86400) * 86400 - 3600;
    const location = { name: 'Amsterdam', country: 'NL', lat: 52, lon: 5 };
    const weather = weatherResponse({
        current: { dt: now, sunrise: midnight + 7.5 * 3600, sunset: midnight + 18 * 3600, temp: 14, feels_like: 11, humidity: 87, clouds: 78, wind_speed: 14, wind_deg: 220, pressure: 995, visibility: 3000, weather: [{ description: 'Moderate rain' }] },
        timezone_offset: 3600,
        hourly: Array.from({ length: 13 }, (_, index) => ({ dt: now + index * 3600, temp: 13 + Math.sin(index / 2) * 5, pop: (index % 5) / 4, rain: { '1h': [0, 0.15, 0.4, 1.2, 2.4][index % 5] }, wind_speed: 5 + Math.sin(index / 3) * 3, wind_gust: 8 + Math.sin(index / 3) * 4, wind_deg: (220 + index * 12) % 360 })),
        daily: Array.from({ length: 8 }, (_, index) => ({ dt: now + index * 86400, sunrise: midnight + index * 86400 + 7.5 * 3600, sunset: midnight + index * 86400 + 18 * 3600, temp: { min: 8 + index % 3, max: 16 + index % 5 }, pop: (index % 5) / 4, weather: [{ description: index % 2 ? 'Light rain' : 'Scattered clouds' }] })),
        alerts: [{ event: 'Orange warning of strong winds', sender_name: 'National weather service', start: now - 3600, end: now + 7200, description: 'Strong gusts expected along the coast. Travel disruption is possible. Follow the issuing agency for details.', tags: ['wind'] }, { event: 'Flood Watch', sender_name: 'Regional weather authority', start: now + 3600, end: now + 86400, description: 'Heavy rainfall may cause rivers to rise. Monitor official updates.', tags: ['flood'] }],
    });
    const airQuality = { list: [{ main: { aqi: 4 }, components: { pm2_5: 55, pm10: 110, no2: 45, o3: 110, so2: 12, co: 420, no: 2.3, nh3: 3.1 } }] };
    const airQualityForecast = { list: Array.from({ length: 49 }, (_, index) => ({ dt: now + index * 3600, main: { aqi: [4, 4, 3, 3, 2, 2, 1, 2, 3, 3, 4, 5][Math.floor(index / 2) % 12] } })) };
    const lightning = { strikes: Array.from({ length: 90 }, (_, index) => {
        const angle = index * 2.4;
        const spread = 0.1 + index % 8 * 0.08;
        return { time: new Date(observedAt - index * 60000), coord: { lat: 52 + Math.cos(angle) * spread, lon: 5 + Math.sin(angle) * spread / Math.cos(52 * Math.PI / 180) } };
    }) };
    const airStability = { hourly: { time: [new Date(now * 1000).toISOString().slice(0, 16)], cape: [1800] } };
    const samples = ['normal', 'forecast', 'alerts', 'airquality', 'lightning'].map(mode => ({ name: mode, mode }));
    samples.push(
        { name: 'long-location', mode: 'normal', location: { ...location, name: 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW' } },
        { name: 'missing-readings', mode: 'normal', weather: weatherResponse({ current: {}, hourly: weather.hourly }), airQuality: null, lightning: null },
        { name: 'missing-forecast', mode: 'forecast', weather: { ...weather, daily: weather.daily.map(day => ({ ...day, temp: {} })) } },
        { name: 'long-alerts', mode: 'alerts', weather: { ...weather, alerts: Array(10).fill({ ...weather.alerts[0], event: 'Very long warning title '.repeat(12), description: 'Detailed alert description '.repeat(100) }) } },
        { name: 'missing-airquality', mode: 'airquality', airQuality: { list: [{ main: { aqi: 3 }, components: { co: 0 } }] } },
    );
    const tiles = [];
    const metrics = [];
    for (const sample of samples) {
        const context = { location, weather, airQuality, airQualityForecast, lightning, airStability, ...sample };
        const embed = getWeatherEmbed(context.location, context.weather, context.airQuality, context.lightning, context.airStability, sample.mode);
        const reply = await getWeatherImage(embed, sample.mode, context);
        const buffer = reply.files[0].attachment;
        const metadata = await sharp(buffer).metadata();
        await fs.writeFile(path.join(directory, `${sample.name}.png`), buffer);
        metrics.push({ name: sample.name, width: metadata.width, height: metadata.height, bytes: buffer.length });
        const thumbnail = await sharp(buffer).resize({ width: 360 }).toBuffer();
        tiles.push({ input: thumbnail, left: tiles.length % 3 * 380 + 10, top: Math.floor(tiles.length / 3) * 500 + 24 });
    }
    await sharp({ create: { width: 1140, height: Math.ceil(samples.length / 3) * 500, channels: 4, background: '#0b1220' } }).composite(tiles).png().toFile(path.join(directory, 'overview.png'));
    console.log(JSON.stringify(metrics, null, 2));
}

if (require.main === module) {
    renderSamples(path.resolve(process.argv[2] || 'weather-previews')).catch(error => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { renderSamples };
