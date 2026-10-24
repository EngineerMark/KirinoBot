async function buildWeatherReply(location, mode, output) {
    // Resolve the service at call time so command and button requests share the same cache.
    const weatherService = require('./weather');
    const weather = await weatherService.getWeather(location.lat, location.lon);
    if (!weather) throw new Error('Weather information unavailable');
    const optional = async request => {
        try { return await request(); }
        catch (error) {
            console.error('Optional weather feed failed:', error);
            return null;
        }
    };
    const [airQuality, lightning, airStability, airQualityForecast] = await Promise.all([
        ['normal', 'airquality'].includes(mode) ? optional(() => weatherService.getAirQuality(location.lat, location.lon)) : null,
        ['normal', 'lightning'].includes(mode) ? optional(() => weatherService.getLightningData()) : null,
        mode === 'lightning' ? optional(() => weatherService.getAirStability(location.lat, location.lon)) : null,
        mode === 'airquality' && output === 'image' ? optional(() => weatherService.getAirQualityForecast(location.lat, location.lon)) : null,
    ]);
    const embed = weatherService.getWeatherEmbed(location, weather, airQuality, lightning, airStability, mode);
    if (output === 'image') {
        const image = await require('./weather-image').getWeatherImage(embed, mode, { weather, airQuality, lightning, airStability, airQualityForecast, location });
        return { content: '', embeds: [], attachments: [], ...image };
    }
    return { content: '', embeds: [embed], attachments: [], files: [] };
}

module.exports = { buildWeatherReply };
