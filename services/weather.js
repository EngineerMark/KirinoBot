const { locationResponse, weatherResponse, airQualityResponse, stabilityResponse, lightningResponse } = require('./weather-validation');
const { WeatherEmbedBuilder, truncate } = require('./weather-embed');
const { daylightSummary, windSummary } = require('./weather-outlook-data');
const { fetchWithCache } = require('./api');
const { formatNumber } = require('./helpers');
const { countryCodeEmoji } = require('country-code-emoji');
const config = require('../config.json');
const Coords = require('../types/Coords');

const WEATHER_FORECAST_DAYS = 7;

const ENDPOINTS = {
    location: 'https://api.openweathermap.org/geo/1.0/direct?q={query}&limit=1&appid={apiKey}',
    weather: 'https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&units=metric&appid={apiKey}',
    airPollution: 'https://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={apiKey}',
    lightning: 'https://maps.blitzortung.org/en/GEOjson/strikes_{index}.json',
    airStability: 'https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=cape,convective_inhibition&forecast_days=1&timezone=GMT',
};

async function getLocation(location) {
    const url = ENDPOINTS.location
        .replace('{query}', encodeURIComponent(location))
        .replace('{apiKey}', process.env.OPENWEATHERMAP_API_KEY);
    return fetchWithCache(url, 300000, locationResponse);
}

async function getWeather(lat, lon) {
    const url = ENDPOINTS.weather
        .replace('{lat}', lat)
        .replace('{lon}', lon)
        .replace('{apiKey}', process.env.OPENWEATHERMAP_API_KEY);
    const data = await fetchWithCache(url, 300000, weatherResponse);
    return data;
}

async function getLightningData() {
    const results = await Promise.all(Array.from({ length: 24 }, async (_, i) => {
        try {
            return await fetchWithCache(ENDPOINTS.lightning.replace('{index}', String(i).padStart(2, '0')), 600000, lightningResponse);
        }
        catch {
            console.error(`Lightning feed ${i} unavailable.`);
            return null;
        }
    }));
    const available = results.filter(Boolean);
    if (!available.length) return null;
    return {
        strikes: available.flatMap(result => result.strikes),
        availableFeeds: available.length, totalFeeds: 24,
        invalidRecords: available.reduce((sum, result) => sum + result.invalidRecords, 0),
    };
}

async function getAirStability(lat, lon) {
    const url = ENDPOINTS.airStability
        .replace('{lat}', lat.toString())
        .replace('{lon}', lon.toString());
    const data = await fetchWithCache(url, 300000, stabilityResponse);
    return data;
}

async function getAirQuality(lat, lon) {
    const url = ENDPOINTS.airPollution
        .replace('{lat}', lat.toString())
        .replace('{lon}', lon.toString())
        .replace('{apiKey}', process.env.OPENWEATHERMAP_API_KEY);
    const data = await fetchWithCache(url, 300000, airQualityResponse);
    return data;
}

function getWeatherEmbed(location, weatherData, airQualityData, lightningData, airStabilityData, responseMode = 'normal') {
    const currentData = weatherData?.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    weatherData = weatherResponse(weatherData);
    try { airQualityData = airQualityResponse(airQualityData); }
    catch { airQualityData = null; }
    try { airStabilityData = stabilityResponse(airStabilityData); }
    catch { airStabilityData = null; }
    let embed = new WeatherEmbedBuilder();
    embed.setColor(config.botColor);
    if (['normal', 'alerts'].includes(responseMode) && weatherData.invalidAlerts) {
        embed.setDescription([embed.data.description, `Incomplete weather alerts: ${weatherData.invalidAlerts} invalid records omitted.`].filter(Boolean).join('\n'));
    }
    if (responseMode === 'normal' && weatherData.alerts === null) {
        embed.addFields({ name: 'Weather Alerts', value: 'Unavailable' });
    }

    switch (responseMode) {
    case 'normal':
        embed = getWeatherEmbedNormal(embed, location, weatherData, airQualityData, lightningData);
        break;
    case 'alerts':
        embed = getWeatherEmbedAlerts(embed, location, weatherData);
        break;
    case 'forecast':
        embed = getWeatherEmbedForecast(embed, location, weatherData);
        break;
    case 'airquality':
        embed = getWeatherEmbedAirQuality(embed, location, weatherData, airQualityData);
        break;
    case 'lightning':
        embed = getWeatherEmbedLightning(embed, location, weatherData, lightningData, airStabilityData);
        break;
    }

    return embed;
}

function getWeatherEmbedNormal(embed, location, weatherData, airQualityData, lightningData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    const localTime = Number.isFinite(currentData.dt + weatherData.timezone_offset) ? new Date((currentData.dt + weatherData.timezone_offset) * 1000).toISOString().slice(11, 16) : 'Unavailable';
    embed.setTitle(`Weather in ${location.name} at ${localTime} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);
    if (currentData.weather[0].icon) embed.setThumbnail(`https://openweathermap.org/img/wn/${currentData.weather[0].icon}@2x.png`);

    const today = weatherData.daily ? weatherData.daily[0] : null;

    let closestStrike = null;
    let strikesInRadius = 0;
    let closestStrikeDistance = Number.MAX_SAFE_INTEGER;
    if (lightningData) {
        for (const strike of lightningData.strikes) {
            const distance = Coords.Distance(location, strike.coord);
            if (distance < closestStrikeDistance || !closestStrike) {
                closestStrikeDistance = distance;
                closestStrike = strike;
            }
            if (distance < 100 && (Date.now() - strike.time.getTime()) < 60 * 60 * 1000) { // 100km radius and within last hour
                strikesInRadius++;
            }
        }
    }

    // visibility is capped at 10km, so convert to km and show as "10+ km" if it's at max
    // and the same for miles, capped at 6.2 miles

    const weather = currentData.weather[0];
    embed.addFields(
        {
            name: 'Conditions',
            value: `__**${weather.description}** at **${formatNumber(currentData.temp, 1)}°C / ${formatNumber((currentData.temp) * 9 / 5 + 32, 1)}°F**__\nLow: **${today ? formatNumber((today.temp)?.min, 1) : 'N/A'}°C** / **${today ? formatNumber(((today.temp)?.min) * 9 / 5 + 32, 1) : 'N/A'}°F**, High: **${today ? formatNumber((today.temp)?.max, 1) : 'N/A'}°C** / **${today ? formatNumber(((today.temp)?.max) * 9 / 5 + 32, 1) : 'N/A'}°F**`,
            inline: false,
        },
        {
            name: 'Feels Like',
            value: `**${formatNumber(currentData.feels_like, 1)}°C / ${formatNumber(currentData.feels_like * 9 / 5 + 32, 1)}°F**`,
            inline: true,
        },
        {
            name: 'Humidity',
            value: `**${formatNumber(currentData.humidity, 0)}%**`,
            inline: true,
        },
        {
            name: 'Cloud Coverage',
            value: `**${formatNumber(currentData.clouds, 0)}%**`,
            inline: true,
        },
        {
            name: 'Wind', // show in km/h and mph
            value: `**${formatNumber(currentData.wind_speed * 3.6, 1)} km/h** / **${formatNumber(currentData.wind_speed * 2.237, 1)} mph** from **${getWindDirection(currentData.wind_deg)}**`,
            inline: false,
        },
        {
            name: 'Air Quality',
            value: `**${airQualityData ? getAirQualityDescription(airQualityData.list[0].main.aqi) : 'Unavailable'}** (AQI: **${airQualityData ? airQualityData.list[0].main.aqi : 'N/A'}**)`,
            inline: true,
        },
        {
            name: 'Pressure',
            value: `**${formatNumber(currentData.pressure, 1)} hPa**`,
            inline: true,
        },
        {
            name: 'Visibility',
            value: `**${currentData.visibility >= 10000 ? '10+' : formatNumber(currentData.visibility / 1000, 1)} km** / **${currentData.visibility >= 10000 ? '6.2+' : formatNumber(currentData.visibility / 1609.344, 1)} miles**`,
            inline: true,
        },
        {
            name: 'Closest Lightning', // simply output the distance, even if its far away
            value: `**${closestStrike ? formatNumber(closestStrikeDistance, 1) : 'N/A'} km** / **${closestStrike ? formatNumber(closestStrikeDistance / 1.609344, 1) : 'N/A'} miles**`,
            inline: true,
        },
        {
            name: 'Nearby Lightning Strikes',
            value: `**${lightningData ? strikesInRadius : 'Unavailable'}** recent strikes within **100km** / **62 miles**`,
            inline: true,
        },
    );

    embed.addFields({ name: 'Daylight', value: daylightSummary(weatherData), inline: true });

    if (weatherData.alerts && weatherData.alerts.length > 0) {
        let alertText = '';
        let shown = 0;
        for (const alert of weatherData.alerts) {
            const line = truncate(`${getAlertEmoji(alert.tags?.[0] || '')} **${alert.event}** from ${alertTime(alert.start)} to ${alertTime(alert.end)}`, 900) + '\n';
            const omitted = weatherData.alerts.length - shown - 1;
            const notice = omitted > 0 ? `${omitted} additional alerts omitted.` : '';
            if (alertText.length + line.length + notice.length > 1024) break;
            alertText += line;
            shown++;
        }
        if (shown < weatherData.alerts.length) alertText += `${weatherData.alerts.length - shown} additional alerts omitted.`;
        embed.addFields({
            name: 'Weather Alerts',
            value: alertText,
            inline: false,
        });
    }

    return embed;
}

function getWeatherEmbedAlerts(embed, location, weatherData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    embed.setTitle(`Weather Alerts for ${location.name} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);

    if (weatherData.alerts && weatherData.alerts.length > 0) {
        for (const alert of weatherData.alerts) {
            const startTime = alertTime(alert.start);
            const endTime = alertTime(alert.end);
            const alertDescription = truncate(alert.description, 1024);
            embed.addFields({
                name: `${getAlertEmoji(alert.tags?.[0] || '')} **${alert.event}** from ${startTime} to ${endTime}`,
                value: alertDescription,
                inline: false,
            });
        }
    }
    else if (weatherData.alerts === null) {
        embed.setDescription('Weather alert data unavailable.');
    }
    else if (!weatherData.invalidAlerts) {
        embed.setTitle(`No weather alerts for ${location.name} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);
    }
    return embed;
}

function getWeatherEmbedForecast(embed, location, weatherData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    embed.setTitle(`Weather Forecast for ${location.name} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);

    if (weatherData.daily && weatherData.daily.length > 0) {
        for (let i = 1; i <= Math.min(weatherData.daily.length - 1, WEATHER_FORECAST_DAYS); i++) {
            const dayData = weatherData.daily[i];
            if (!Number.isFinite(dayData.dt)) continue;
            const dateObject = new Date((dayData.dt + (Number.isFinite(weatherData.timezone_offset) ? weatherData.timezone_offset : 0)) * 1000);
            const date = dateObject.toISOString().substr(0, 10);
            const dayOfWeek = dateObject.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
            const weather = dayData.weather[0];
            embed.addFields({
                name: `${dayOfWeek} (${date}) - ${weather.description}`,
                value: `Low: **${formatNumber((dayData.temp)?.min, 1)}°C** / **${formatNumber(((dayData.temp)?.min) * 9 / 5 + 32, 1)}°F**, High: **${formatNumber((dayData.temp)?.max, 1)}°C** / **${formatNumber(((dayData.temp)?.max) * 9 / 5 + 32, 1)}°F**\nPrecipitation Chance: **${formatNumber((dayData.pop) * 100, 1)}%**`,
                inline: false,
            });
        }
    }

    const wind = windSummary(weatherData);
    if (wind) embed.addFields({ name: 'Wind & Gusts Forecast', value: wind });
    if (weatherData.daily.some(day => Number.isFinite(day.dt))) embed.setImage(getWeatherForecastChart(weatherData));
    const notices = [];
    if (weatherData.daily.some(day => !Number.isFinite(day.dt))) notices.push('Incomplete forecast: invalid forecast dates omitted.');
    if (!Number.isFinite(weatherData.timezone_offset)) notices.push('Local timezone unavailable; forecast dates shown in UTC.');
    if (weatherData.daily.length < 2) notices.push(wind ? 'Daily forecast data unavailable.' : 'Forecast data unavailable.');
    if (notices.length) embed.setDescription(notices.join('\n'));

    return embed;
}

function getWeatherEmbedAirQuality(embed, location, weatherData, airQualityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    embed.setTitle(`Air Quality in ${location.name} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);

    if (airQualityData) {
        const aqi = airQualityData.list[0].main.aqi;
        embed.addFields({
            name: 'Air Quality Index',
            value: `**${aqi} - ${getAirQualityDescription(aqi)}**`,
            inline: false,
        });

        const components = airQualityData.list[0].components;
        for (const [component, value] of Object.entries(components)) {
            embed.addFields({
                name: component.toUpperCase(),
                value: `**${formatNumber(value, 1)} μg/m³**`,
                inline: true,
            });
        }
    }

    if (!airQualityData) embed.setDescription('Air quality data unavailable.');
    return embed;
}

const LIGHTNING_RANGES = [5, 10, 25, 50, 100]; // km, also to be represented in a "circle" graph
const STRIKES_PER_MINUTE_BUCKETS = [15, 30, 60]; // buckets for strikes per minute in the last hour, also to be represented in a "bar" graph
function getWeatherEmbedLightning(embed, location, weatherData, lightningData, airStabilityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error('No weather data available');
    }

    embed.setTitle(`Lightning Activity near ${location.name} ${(/^[A-Z]{2}$/.test(location.country) ? countryCodeEmoji(location.country) : '')}`);

    if (lightningData) {
        const strikeCounts = new Array(LIGHTNING_RANGES.length).fill(0);
        let closestStrike = null;
        let closestStrikeDistance = Number.MAX_SAFE_INTEGER;

        for (const strike of lightningData.strikes) {
            const distance = Coords.Distance(location, strike.coord);
            if (distance < closestStrikeDistance || !closestStrike) {
                closestStrikeDistance = distance;
                closestStrike = strike;
            }

            for (let i = 0; i < LIGHTNING_RANGES.length; i++) {
                if (distance <= LIGHTNING_RANGES[i]) {
                    strikeCounts[i]++;
                }
            }
        }

        let lightningInfo = '';
        for (let i = 0; i < LIGHTNING_RANGES.length; i++) {
            lightningInfo += `Within ${LIGHTNING_RANGES[i]} km: **${strikeCounts[i]}** strikes\n`;
        }
        embed.addFields({
            name: 'Lightning Activity',
            value: lightningInfo,
            inline: false,
        });

        if (closestStrike) {
            const strikeTime = `<t:${Math.floor(closestStrike.time.getTime() / 1000)}:R>`;
            embed.addFields({
                name: 'Closest Strike',
                value: `**${formatNumber(closestStrikeDistance, 1)} km** / **${formatNumber(closestStrikeDistance / 1.609344, 1)} miles** away, occurred ${strikeTime}`,
                inline: false,
            });
        }

        const nearbyStrikes = lightningData.strikes.filter(strike => Coords.Distance(location, strike.coord) <= 100 && (Date.now() - strike.time.getTime()) < 60 * 60 * 1000);
        // strikes per minute per bucket
        const now = Date.now(); // maybe based on most recent strike (due to caching), but that could be incorrect as well
        const strikesPerBuckets = new Array(STRIKES_PER_MINUTE_BUCKETS.length).fill(0);
        for (const strike of nearbyStrikes) {
            const minutesAgo = (now - strike.time.getTime()) / (60 * 1000);
            for (let i = 0; i < STRIKES_PER_MINUTE_BUCKETS.length; i++) {
                if (minutesAgo <= STRIKES_PER_MINUTE_BUCKETS[i]) {
                    strikesPerBuckets[i]++;
                }
            }
        }

        let strikesPerMinuteInfo = '';
        for (let i = 0; i < STRIKES_PER_MINUTE_BUCKETS.length; i++) {
            const totalStrikes = strikesPerBuckets[i];
            const strikesPerMinute = totalStrikes / STRIKES_PER_MINUTE_BUCKETS[i];
            strikesPerMinuteInfo += `In the last ${STRIKES_PER_MINUTE_BUCKETS[i]} minutes: **${formatNumber(strikesPerMinute, 0)}** strikes per minute\n`;
        }
        embed.addFields({
            name: 'Recent Lightning Activity',
            value: strikesPerMinuteInfo,
            inline: false,
        });

        const chartUrl = getWeatherNearbyStrikesChart(lightningData, location);
        embed.setImage(chartUrl);
    }

    const stabilityIndex = getCurrentAirstabilityIndex(airStabilityData) ?? -1;
    const cape = airStabilityData?.hourly?.cape?.[stabilityIndex] ?? -1;

    let peakCape = -1;
    let peakCapeTime = 'N/A';

    if (airStabilityData?.hourly?.cape) {
        for (let i = 0; i < airStabilityData.hourly.cape.length; i++) {
            const currentCape = airStabilityData.hourly.cape[i];
            if (Number.isFinite(currentCape) && currentCape > peakCape) {
                peakCape = currentCape;
                peakCapeTime = `<t:${Math.floor((Date.parse(airStabilityData.hourly.time[i] + 'Z')) / 1000)}:R>`;
            }
        }
    }

    const peakCapeStr = `Peak: ${peakCape >= 0 ? formatNumber(peakCape, 0) : 'N/A'} J/kg (**${getCapeInstabilityLabel(peakCape >= 0 ? peakCape : null)}**) at ${peakCapeTime}`;

    embed.addFields({
        name: 'Air Stability',
        value: !airStabilityData || !Number.isFinite(cape) ? `Current air stability unavailable.\n${peakCapeStr}` : `**${cape >= 0 ? formatNumber(cape, 0) : 'N/A'} J/kg** - **${getCapeInstabilityLabel(cape >= 0 ? cape : null)}**\n${peakCapeStr}`,
        inline: false,
    });

    return embed;
}

function getWindDirection(degrees) {
    // Return compass direction based on degrees (to NNW detail)
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index] || 'N/A';
}

function getAirQualityDescription(aqi) {
    switch (aqi) {
    case 1:
        return 'Good';
    case 2:
        return 'Fair';
    case 3:
        return 'Moderate';
    case 4:
        return 'Poor';
    case 5:
        return 'Very Poor';
    default:
        return 'Unknown';
    }
}

function alertTime(value) {
    return Number.isFinite(value) ? `<t:${value}:R>` : 'Unavailable';
}

function getAlertEmoji(tag) {
    switch (tag.toLowerCase()) {
    case 'wind':
        return '💨';
    case 'rain':
        return '🌧️';
    case 'snow':
        return '❄️';
    case 'thunderstorm':
        return '⛈️';
    case 'tornado':
        return '🌪️';
    case 'flood':
        return '🌊';
    default:
        return '⚠️';
    }
}

function getCurrentAirstabilityIndex(airStabilityData) {
    // get closest index of current time in airStabilityData.hourly.time and return the corresponding cape value
    if (!airStabilityData) {
        return null;
    }

    const nowTimestamp = Date.now();
    let closestIndex = null;
    let closestDiff = Infinity;
    for (let i = 0; i < (airStabilityData.hourly?.time?.length ?? 0); i++) {
        const timestamp = Date.parse(airStabilityData.hourly.time[i] + 'Z');
        const diff = Math.abs(timestamp - nowTimestamp);
        if (diff < closestDiff) {
            closestDiff = diff;
            closestIndex = i;
        }
    }

    return closestIndex;
}

function getCapeInstabilityLabel(cape) {
    if (cape === null) {
        return 'N/A';
    }
    else if (cape < 500) {
        return 'Stable';
    }
    else if (cape < 1000) {
        return 'Slightly Unstable';
    }
    else if (cape < 2500) {
        return 'Moderately Unstable';
    }
    else if (cape < 4000) {
        return 'Unstable';
    }
    else {
        return 'Extremely Unstable';
    }
}

const ROUND_TO_MINUTES = 10;
const HOURS_TO_DISPLAY = 2;
function getWeatherNearbyStrikesChart(lightningData, location) {
    // a line graph showing the number of strikes per 5 minutes in the last hour
    // current time should be rounded up (so all should be rounded up to nearest xx:05, xx:10, xx:15, etc)
    // (config using Chart.js, using quickchart.io)
    const now = Date.now();
    const strikesPerInterval = {};
    const closestStrikeDistancePerInterval = {};

    for (const strike of lightningData.strikes) {
        const distance = Coords.Distance(location, strike.coord);
        if (distance <= 100 && (now - strike.time.getTime()) < HOURS_TO_DISPLAY * 60 * 60 * 1000) { // within 100km and last 2 hours
            const roundedTime = Math.ceil(strike.time.getTime() / (ROUND_TO_MINUTES * 60 * 1000)) * (ROUND_TO_MINUTES * 60 * 1000);
            strikesPerInterval[roundedTime] = (strikesPerInterval[roundedTime] || 0) + 1;

            closestStrikeDistancePerInterval[roundedTime] = Math.min(closestStrikeDistancePerInterval[roundedTime] || Infinity, distance);
        }
    }

    const labels = [];
    const dataStrikesPerInterval = [];
    const dataClosestStrikeDistancePerInterval = [];

    for (let i = HOURS_TO_DISPLAY * 60 / ROUND_TO_MINUTES; i >= 0; i--) {
        const intervalTime = now - i * ROUND_TO_MINUTES * 60 * 1000;
        const roundedIntervalTime = Math.ceil(intervalTime / (ROUND_TO_MINUTES * 60 * 1000)) * (ROUND_TO_MINUTES * 60 * 1000);
        labels.push(new Date(roundedIntervalTime).toISOString().substr(11, 5));
        dataStrikesPerInterval.push(strikesPerInterval[roundedIntervalTime] || 0);
        // infinity should also be null, as it means no strikes in that interval
        dataClosestStrikeDistancePerInterval.push(closestStrikeDistancePerInterval[roundedIntervalTime] ?? null);
    }

    const chartData = {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: `Strikes/${ROUND_TO_MINUTES}min`,
                    data: dataStrikesPerInterval,
                    borderColor: 'rgba(255, 99, 132, 1)',
                    fill: false,
                    yAxisID: 'y',
                },
                {
                    label: 'Nearest (km)',
                    data: dataClosestStrikeDistancePerInterval,
                    borderColor: 'rgba(54, 162, 235, 1)',
                    fill: false,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            maintainAspectRatio: false,
            spanGaps: true,
            plugins: {
                filler: {
                    propagate: false,
                },
            },
            stacked: false,
            scales: {
                yAxes: [{
                    id: 'y',
                    type: 'linear',
                    display: true,
                    position: 'left',
                    ticks: {
                        beginAtZero: true,
                    },
                },
                {
                    id: 'y1',
                    type: 'linear',
                    display: true,
                    position: 'right',
                    ticks: {
                        beginAtZero: true,
                        callback: '__CALLBACK_PLACEHOLDER__',
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                }],
            },
        },
    };

    // has to be done like this according to quickchart docs
    const distanceCallback = (value) => {
        return `${value}km`;
    };

    const chartDataString = JSON.stringify(chartData).replace('"__CALLBACK_PLACEHOLDER__"', distanceCallback.toString());

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(chartDataString)}&height=150&backgroundColor=white`;
    return chartUrl;
}

function getWeatherForecastChart(forecast) {
    const WEATHER_FORECAST_DAYS_EXTENDED = WEATHER_FORECAST_DAYS * 2;
    const forecastEntries = forecast.daily.filter(day => Number.isFinite(day.dt)).slice(0, WEATHER_FORECAST_DAYS_EXTENDED);

    const chartData = {
        type: 'line',
        data: {
            // use MM-DD format
            labels: forecastEntries.map(entry => {
                const offset = Number.isFinite(forecast.timezone_offset) ? forecast.timezone_offset : 0;
                const date = new Date((entry.dt + offset) * 1000);
                return `${date.getUTCMonth() + 1}-${date.getUTCDate()}`;
            }),
            datasets: [
                // min temp
                {
                    label: 'Min',
                    data: forecastEntries.map((entry) => entry.temp?.min),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    fill: false,
                },
                // max temp
                {
                    label: 'Max',
                    data: forecastEntries.map((entry) => entry.temp?.max),
                    borderColor: 'rgba(255, 99, 132, 1)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    fill: '-1', // fill area between min and max
                },
            ],
        },
        options: {
            maintainAspectRatio: false,
            spanGaps: false,
            elements: {
                line: {
                    tension: 0.000001,
                },
            },
            plugins: {
                filler: {
                    propagate: false,
                },
                legend: { labels: { color: 'white' } },
            },
        },
    };

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartData))}&height=150&backgroundColor=white`;

    return chartUrl;
}

module.exports = {
    getLocation,
    getWeather,
    getLightningData,
    getAirStability,
    getAirQuality,
    getWeatherEmbed,
};
