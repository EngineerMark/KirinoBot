const { EmbedBuilder } = require('discord.js');
const { fetchWithCache } = require('./api');
const { formatNumber } = require('./helpers');
const { countryCodeEmoji } = require('country-code-emoji');
const config = require('../config.json');
const Coords = require('../types/Coords');
const ENDPOINTS = {
    location: "http://api.openweathermap.org/geo/1.0/direct?q={query}&limit=1&appid={apiKey}",
    weather: "https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&units=metric&appid={apiKey}",
    airPollution: "http://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={apiKey}",
    lightning: "https://maps.blitzortung.org/en/GEOjson/strikes_{index}.json",
    airStability: "https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly=cape,convective_inhibition&forecast_days=1"
}

async function getLocation(location) {
    const url = ENDPOINTS.location
        .replace("{query}", encodeURIComponent(location))
        .replace("{apiKey}", process.env.OPENWEATHERMAP_API_KEY);
    const data = await fetchWithCache(url);
    return data.length > 0 ? data[0] : null;
}

async function getWeather(lat, lon) {
    const url = ENDPOINTS.weather
        .replace("{lat}", lat)
        .replace("{lon}", lon)
        .replace("{apiKey}", process.env.OPENWEATHERMAP_API_KEY);
    const data = await fetchWithCache(url);
    return data;
}

async function getLightningData() {
    const aggregatedResponse = [];

    for (let i = 0; i <= 23; i++) {
        const index = i < 10 ? `0${i}` : i;
        try {
            // const response = await axios.get(ENDPOINTS.lightning.replace("{index}", index));
            const response = await fetchWithCache(ENDPOINTS.lightning.replace("{index}", index), 60000 * 10); // cache for 10 minutes
            aggregatedResponse.push(...response);
        } catch (error) {
            console.error(`Error fetching lightning data for index ${index}:`, error);
            continue; //skip this index and continue with the next one
        }
    }

    //response is actually [{0:17,1:32,2:"2026-06-10 21:05:04.431810560"}]
    const lightningResponse = {
        strikes: []
    }

    for (const strike of aggregatedResponse) {
        lightningResponse.strikes.push({
            coord: {
                lat: strike[1],
                lon: strike[0]
            },
            time: new Date(strike[2] + " UTC")
        })
    }

    return lightningResponse;
}

async function getAirStability(lat, lon) {
    const url = ENDPOINTS.airStability
        .replace("{lat}", lat.toString())
        .replace("{lon}", lon.toString());
    const data = await fetchWithCache(url);
    return data;
}

async function getAirQuality(lat, lon) {
    const url = ENDPOINTS.airPollution
        .replace("{lat}", lat.toString())
        .replace("{lon}", lon.toString())
        .replace("{apiKey}", process.env.OPENWEATHERMAP_API_KEY);
    const data = await fetchWithCache(url);
    return data;
}

function getWeatherEmbed(location, weatherData, airQualityData, lightningData, airStabilityData, responseMode = "normal") {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    let embed = new EmbedBuilder();
    embed.setColor(config.botColor);

    switch (responseMode) {
        case "normal":
            embed = getWeatherEmbedNormal(embed, location, weatherData, airQualityData, lightningData);
            break;
        case "alerts":
            embed = getWeatherEmbedAlerts(embed, location, weatherData, airQualityData);
            break;
        case "forecast":
            embed = getWeatherEmbedForecast(embed, location, weatherData, airQualityData);
            break;
        case "airquality":
            embed = getWeatherEmbedAirQuality(embed, location, weatherData, airQualityData);
            break;
        case "lightning":
            embed = getWeatherEmbedLightning(embed, location, weatherData, airQualityData, lightningData, airStabilityData);
            break;
    }

    return embed;
}

function getWeatherEmbedNormal(embed, location, weatherData, airQualityData, lightningData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    const localTime = new Date((currentData.dt + weatherData.timezone_offset) * 1000).toISOString().substr(11, 5);
    embed.setTitle(`Weather in ${location.name} at ${localTime} ${countryCodeEmoji(location.country)}`);
    embed.setThumbnail(`http://openweathermap.org/img/wn/${currentData.weather[0].icon}@2x.png`);

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

    //visibility is capped at 10km, so convert to km and show as "10+ km" if it's at max
    //and the same for miles, capped at 6.2 miles

    const weather = currentData.weather[0];
    embed.addFields(
        {
            name: "Conditions",
            value: `__**${weather.description}** at **${formatNumber(currentData.temp || 0, 1)}°C / ${formatNumber((currentData.temp || 0) * 9 / 5 + 32, 1)}°F**__\nLow: **${today ? formatNumber((today.temp)?.min, 1) : "N/A"}°C** / **${today ? formatNumber(((today.temp)?.min || 0) * 9 / 5 + 32, 1) : "N/A"}°F**, High: **${today ? formatNumber((today.temp)?.max, 1) : "N/A"}°C** / **${today ? formatNumber(((today.temp)?.max || 0) * 9 / 5 + 32, 1) : "N/A"}°F**`,
            inline: false
        },
        {
            name: "Feels Like",
            value: `**${formatNumber(currentData.feels_like, 1)}°C / ${formatNumber(currentData.feels_like * 9 / 5 + 32, 1)}°F**`,
            inline: true
        },
        {
            name: "Humidity",
            value: `**${currentData.humidity}%**`,
            inline: true
        },
        {
            name: "Cloud Coverage",
            value: `**${currentData.clouds}%**`,
            inline: true
        },
        {
            name: "Wind", //show in km/h and mph
            value: `**${formatNumber(currentData.wind_speed * 3.6, 1)} km/h** / **${formatNumber(currentData.wind_speed * 2.237, 1)} mph** from **${getWindDirection(currentData.wind_deg)}**`,
            inline: false
        },
        {
            name: "Air Quality",
            value: `**${getAirQualityDescription(airQualityData ? airQualityData.list[0].main.aqi : 0)}** (AQI: **${airQualityData ? airQualityData.list[0].main.aqi : "N/A"}**)`,
            inline: true
        },
        {
            name: "Pressure",
            value: `**${formatNumber(currentData.pressure, 1)} hPa**`,
            inline: true
        },
        {
            name: "Visibility",
            value: `**${currentData.visibility >= 10000 ? "10+" : formatNumber(currentData.visibility / 1000, 1)} km** / **${currentData.visibility >= 10000 ? "6.2+" : formatNumber(currentData.visibility / 1609.344, 1)} miles**`,
            inline: true
        },
        {
            name: "Closest Lightning",//simply output the distance, even if its far away
            value: `**${closestStrike ? formatNumber(closestStrikeDistance, 1) : "N/A"} km** / **${closestStrike ? formatNumber(closestStrikeDistance / 1.609344, 1) : "N/A"} miles**`,
            inline: true
        },
        {
            name: "Nearby Lightning Strikes",
            value: `**${strikesInRadius}** recent strikes within **100km** / **62 miles**`,
            inline: true
        }
    )

    if (weatherData.alerts && weatherData.alerts.length > 0) {
        let alertText = "";
        for (const alert of weatherData.alerts) {
            // const startTime = new Date(alert.start * 1000).toLocaleString("en-US", { timeZone: weatherData.timezone });
            // const endTime = new Date(alert.end * 1000).toLocaleString("en-US", { timeZone: weatherData.timezone });
            const startTime = `<t:${alert.start}:R>`;
            const endTime = `<t:${alert.end}:R>`;
            alertText += `${getAlertEmoji(alert.tags[0] || "")} **${alert.event}** from ${startTime} to ${endTime}\n`;
        }
        embed.addFields({
            name: "Weather Alerts",
            value: alertText,
            inline: false
        });
    }

    return embed;
}

function getWeatherEmbedAlerts(embed, location, weatherData, airQualityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Weather Alerts for ${location.name} ${countryCodeEmoji(location.country)}`);

    if (weatherData.alerts && weatherData.alerts.length > 0) {
        for (const alert of weatherData.alerts) {
            const startTime = `<t:${alert.start}:R>`;
            const endTime = `<t:${alert.end}:R>`;
            const alertDescription = alert.description.length > 1024 ? alert.description.substring(0, 1021) + "..." : alert.description;
            embed.addFields({
                name: `${getAlertEmoji(alert.tags[0] || "")} **${alert.event}** from ${startTime} to ${endTime}`,
                value: alertDescription,
                inline: false
            })
        }
    } else {
        embed.setTitle(`No weather alerts for ${location.name} ${countryCodeEmoji(location.country)}`);
    }
    return embed;
}

function getWeatherEmbedForecast(embed, location, weatherData, airQualityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Weather Forecast for ${location.name} ${countryCodeEmoji(location.country)}`);

    if (weatherData.daily && weatherData.daily.length > 0) {
        for (let i = 1; i <= Math.min(weatherData.daily.length - 1, WEATHER_FORECAST_DAYS); i++) {
            const dayData = weatherData.daily[i];
            const dateObject = new Date((dayData.dt + weatherData.timezone_offset) * 1000);
            const date = dateObject.toISOString().substr(0, 10);
            const dayOfWeek = dateObject.toLocaleDateString("en-US", { weekday: "long" });
            const weather = dayData.weather[0];
            embed.addFields({
                name: `${dayOfWeek} (${date}) - ${weather.description}`,
                value: `Low: **${formatNumber((dayData.temp)?.min, 1)}°C** / **${formatNumber(((dayData.temp)?.min || 0) * 9 / 5 + 32, 1)}°F**, High: **${formatNumber((dayData.temp)?.max, 1)}°C** / **${formatNumber(((dayData.temp)?.max || 0) * 9 / 5 + 32, 1)}°F**\nPrecipitation Chance: **${formatNumber((dayData.pop || 0) * 100, 1)}%**`,
                inline: false
            })
        }
    }

    const chartUrl = getWeatherForecastChart(weatherData);
    embed.setImage(chartUrl);

    return embed;
}

function getWeatherEmbedAirQuality(embed, location, weatherData, airQualityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Air Quality in ${location.name} ${countryCodeEmoji(location.country)}`);

    if (airQualityData) {
        const aqi = airQualityData.list[0].main.aqi;
        embed.addFields({
            name: "Air Quality Index",
            value: `**${aqi} - ${getAirQualityDescription(aqi)}**`,
            inline: false
        });

        const components = airQualityData.list[0].components;
        for (const [component, value] of Object.entries(components)) {
            embed.addFields({
                name: component.toUpperCase(),
                value: `**${formatNumber(value, 1)} μg/m³**`,
                inline: true
            });
        }
    }

    return embed;
}

const LIGHTNING_RANGES = [5, 10, 25, 50, 100]; //km, also to be represented in a "circle" graph
const STRIKES_PER_MINUTE_BUCKETS = [15, 30, 60]; //buckets for strikes per minute in the last hour, also to be represented in a "bar" graph
function getWeatherEmbedLightning(embed, location, weatherData, airQualityData, lightningData, airStabilityData) {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Lightning Activity near ${location.name} ${countryCodeEmoji(location.country)}`);

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
                    break;
                }
            }
        }

        let lightningInfo = "";
        for (let i = 0; i < LIGHTNING_RANGES.length; i++) {
            lightningInfo += `Within ${LIGHTNING_RANGES[i]} km: **${strikeCounts[i]}** strikes\n`;
        }
        embed.addFields({
            name: "Lightning Activity",
            value: lightningInfo,
            inline: false
        });

        if (closestStrike) {
            const strikeTime = `<t:${Math.floor(closestStrike.time.getTime() / 1000)}:R>`;
            embed.addFields({
                name: "Closest Strike",
                value: `**${formatNumber(closestStrikeDistance, 1)} km** / **${formatNumber(closestStrikeDistance / 1.609344, 1)} miles** away, occurred ${strikeTime}`,
                inline: false
            });
        }

        const nearbyStrikes = lightningData.strikes.filter(strike => Coords.Distance(location, strike.coord) <= 100 && (Date.now() - strike.time.getTime()) < 60 * 60 * 1000);
        // strikes per minute per bucket
        const now = Date.now(); //maybe based on most recent strike (due to caching), but that could be incorrect as well
        const strikesPerBuckets = new Array(STRIKES_PER_MINUTE_BUCKETS.length).fill(0);
        for (const strike of nearbyStrikes) {
            const minutesAgo = (now - strike.time.getTime()) / (60 * 1000);
            for (let i = 0; i < STRIKES_PER_MINUTE_BUCKETS.length; i++) {
                if (minutesAgo <= STRIKES_PER_MINUTE_BUCKETS[i]) {
                    strikesPerBuckets[i]++;
                    break;
                }
            }
        }

        let strikesPerMinuteInfo = "";
        for (let i = 0; i < STRIKES_PER_MINUTE_BUCKETS.length; i++) {
            const totalStrikes = strikesPerBuckets[i];
            const strikesPerMinute = totalStrikes / STRIKES_PER_MINUTE_BUCKETS[i];
            strikesPerMinuteInfo += `In the last ${STRIKES_PER_MINUTE_BUCKETS[i]} minutes: **${formatNumber(strikesPerMinute, 0)}** strikes per minute\n`;
        }
        embed.addFields({
            name: "Recent Lightning Activity",
            value: strikesPerMinuteInfo,
            inline: false
        });

        const stabilityIndex = getCurrentAirstabilityIndex(airStabilityData) || -1;
        const cape = airStabilityData?.hourly.cape?.[stabilityIndex] || -1;
        
        let peakCape = -1;
        let peakCapeTime = "N/A";

        if (airStabilityData?.hourly.cape) {
            for (let i = 0; i < airStabilityData.hourly.cape.length; i++) {
                const currentCape = airStabilityData.hourly.cape[i];
                if (currentCape > peakCape) {
                    peakCape = currentCape;
                    peakCapeTime = `<t:${Math.floor((new Date().setHours(0, 0, 0, 0) + i * 60 * 60 * 1000) / 1000)}:R>`;
                }
            }
        }

        const peakCapeStr = `Peak: ${peakCape >= 0 ? formatNumber(peakCape, 0) : "N/A"} J/kg (**${getCapeInstabilityLabel(peakCape >= 0 ? peakCape : null)}**) at ${peakCapeTime}`;
        
        embed.addFields({
            name: "Air Stability",
            value: `**${cape >= 0 ? formatNumber(cape, 0) : "N/A"} J/kg** - **${getCapeInstabilityLabel(cape >= 0 ? cape : null)}**\n${peakCapeStr}`,
            inline: false
        });

        const chartUrl = getWeatherNearbyStrikesChart(lightningData, location);
        embed.setImage(chartUrl);
    } else {
        embed.setDescription("No lightning data available.");
    }

    return embed;
}

function getWindDirection(degrees) {
    //Return compass direction based on degrees (to NNW detail)
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index] || "N/A";
}

function getAirQualityDescription(aqi) {
    switch (aqi) {
        case 1:
            return "Good";
        case 2:
            return "Fair";
        case 3:
            return "Moderate";
        case 4:
            return "Poor";
        case 5:
            return "Very Poor";
        default:
            return "Unknown";
    }
}

function getAlertEmoji(tag) {
    switch (tag.toLowerCase()) {
        case "wind":
            return "💨";
        case "rain":
            return "🌧️";
        case "snow":
            return "❄️";
        case "thunderstorm":
            return "⛈️";
        case "tornado":
            return "🌪️";
        case "flood":
            return "🌊";
        default:
            return "⚠️";
    }
}

function getCurrentAirstabilityIndex(airStabilityData) {
    //get closest index of current time in airStabilityData.hourly.time and return the corresponding cape value
    if (!airStabilityData) {
        return null;
    }

    const timezone = airStabilityData.timezone;
    const now = new Date();
    const nowInTimezone = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const nowTimestamp = Math.floor(nowInTimezone.getTime() / 1000);

    let closestIndex = 0;
    let closestDiff = Infinity;

    for (let i = 0; i < airStabilityData.hourly.time.length; i++) {
        const time = new Date(airStabilityData.hourly.time[i]);
        const timeInTimezone = new Date(time.toLocaleString("en-US", { timeZone: timezone }));
        const timestamp = Math.floor(timeInTimezone.getTime() / 1000);
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
        return "N/A";
    } else if (cape < 500) {
        return "Stable";
    } else if (cape < 1000) {
        return "Slightly Unstable";
    } else if (cape < 2500) {
        return "Moderately Unstable";
    } else if (cape < 4000) {
        return "Unstable";
    } else {
        return "Extremely Unstable";
    }
}

const ROUND_TO_MINUTES = 10;
const HOURS_TO_DISPLAY = 2;
function getWeatherNearbyStrikesChart(lightningData, location) {
    //a line graph showing the number of strikes per 5 minutes in the last hour
    //current time should be rounded up (so all should be rounded up to nearest xx:05, xx:10, xx:15, etc)
    //(config using Chart.js, using quickchart.io)
    const now = Date.now();
    const strikesPerInterval = {};
    const closestStrikeDistancePerInterval = {};

    for (const strike of lightningData.strikes) {
        const distance = Coords.Distance(location, strike.coord);
        if (distance <= 100 && (now - strike.time.getTime()) < HOURS_TO_DISPLAY * 60 * 60 * 1000) { //within 100km and last 2 hours
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
        //infinity should also be null, as it means no strikes in that interval
        dataClosestStrikeDistancePerInterval.push(closestStrikeDistancePerInterval[roundedIntervalTime] === Infinity ? null : closestStrikeDistancePerInterval[roundedIntervalTime]);
    }

    const chartData = {
        type: "line",
        data: {
            labels,
            datasets: [
                {
                    label: "Strikes/5min",
                    data: dataStrikesPerInterval,
                    borderColor: "rgba(255, 99, 132, 1)",
                    fill: false,
                    yAxisID: "y"
                },
                {
                    label: "Nearest (km)",
                    data: dataClosestStrikeDistancePerInterval,
                    borderColor: "rgba(54, 162, 235, 1)",
                    fill: false,
                    yAxisID: "y1"
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            spanGaps: true,
            plugins: {
                filler: {
                    propagate: false
                },
            },
            stacked: false,
            scales: {
                yAxes: [{
                    id: "y",
                    type: "linear",
                    display: true,
                    position: "left",
                    ticks: {
                        beginAtZero: true
                    },
                },
                {
                    id: "y1",
                    type: "linear",
                    display: true,
                    position: "right",
                    ticks: {
                        beginAtZero: true,
                        callback: '__CALLBACK_PLACEHOLDER__'
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                }]
            }
        }
    };

    //has to be done like this according to quickchart docs
    const distanceCallback = (value) => {
        return `${value}km`;
    }

    const chartDataString = JSON.stringify(chartData).replace('"__CALLBACK_PLACEHOLDER__"', distanceCallback.toString());

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(chartDataString)}&height=150&backgroundColor=white`;
    return chartUrl;
}

function getWeatherForecastChart(weatherResponse) {
    const WEATHER_FORECAST_DAYS_EXTENDED = WEATHER_FORECAST_DAYS * 2;
    const forecastEntries = weatherResponse.daily.slice(0, WEATHER_FORECAST_DAYS_EXTENDED);

    const chartData = {
        type: "line",
        data: {
            //use MM-DD format
            labels: forecastEntries.map((entry) => `${new Date(entry.dt * 1000).getMonth() + 1}-${new Date(entry.dt * 1000).getDate()}`),
            datasets: [
                //min temp
                {
                    label: "Min",
                    data: forecastEntries.map((entry) => entry.temp?.min),
                    borderColor: "rgba(75, 192, 192, 1)",
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    fill: false
                },
                //max temp
                {
                    label: "Max",
                    data: forecastEntries.map((entry) => entry.temp?.max),
                    borderColor: "rgba(255, 99, 132, 1)",
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    fill: '-1' //fill area between min and max
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            spanGaps: false,
            elements: {
                line: {
                    tension: 0.000001
                }
            },
            plugins: {
                filler: {
                    propagate: false
                },
                legend: { labels: { color: "white" } }
            }
        }
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
    getWeatherEmbed
};