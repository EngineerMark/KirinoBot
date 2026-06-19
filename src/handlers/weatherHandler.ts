import axios from "axios";
import { config } from "../../config.js";
import { Coords, type Geo } from "../types/Geo.js";
import type { Weather, WeatherData, WeatherResponse, WeatherTemperature } from "../types/Weather.js";
import { EmbedBuilder } from "discord.js";
import flag from 'country-code-emoji';
import { formatNumber } from "../helpers.js";
import type { AirQualityResponse } from "../types/AirQuality.js";
import type { LightningResponse, Strike } from "../types/Lightning.js";

const WEATHER_FORECAST_DAYS = 7;

const ENDPOINTS = {
    location: "http://api.openweathermap.org/geo/1.0/direct?q={query}&limit=1&appid={apiKey}",
    weather: "https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&units=metric&appid={apiKey}",
    airPollution: "http://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={apiKey}",
    lightning: "https://maps.blitzortung.org/en/GEOjson/strikes_{index}.json"
}

//store for 10 minutes (url, timestamp, data)
const apiCache: Record<string, { timestamp: number, data: any }> = {};
const apiCacheDuration = 10 * 60 * 1000; // 10 minutes in milliseconds

export async function getLightningData(): Promise<LightningResponse | null> {
    try {
        if (apiCache['lightning'] && (Date.now() - apiCache['lightning'].timestamp < apiCacheDuration)) {
            return apiCache['lightning'].data as LightningResponse || null;
        }

        const aggregatedResponse: any[] = [];

        for (let i = 0; i <= 23; i++) {
            const index = i < 10 ? `0${i}` : i;
            try {
                const response = await axios.get(ENDPOINTS.lightning.replace("{index}", index));
                aggregatedResponse.push(...response.data);
            } catch (error) {
                console.error(`Error fetching lightning data for index ${index}:`, error);
                continue; //skip this index and continue with the next one
            }
        }

        //response is actually [{0:17,1:32,2:"2026-06-10 21:05:04.431810560"}]
        const lightningResponse: LightningResponse = {
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

        apiCache['lightning'] = { timestamp: Date.now(), data: lightningResponse };
        return lightningResponse;
    } catch (error) {
        console.error("Error fetching lightning data:", error);
        return null;
    }
}

export async function getLocation(query: string): Promise<Geo | null> {
    const url = ENDPOINTS.location
        .replace("{query}", encodeURIComponent(query))
        .replace("{apiKey}", config.openWeatherMapApiKey);
    try {
        if (apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
            return apiCache[url].data as Geo || null;
        }

        const response = await axios.get(url);
        const data = response.data[0] as Geo || null;
        apiCache[url] = { timestamp: Date.now(), data };
        return data;
    } catch (error) {
        console.error("Error fetching location:", error);
        return null;
    }
}

export async function getWeather(lat: number, lon: number): Promise<WeatherResponse | null> {
    const url = ENDPOINTS.weather
        .replace("{lat}", lat.toString())
        .replace("{lon}", lon.toString())
        .replace("{apiKey}", config.openWeatherMapApiKey);
    try {
        if (apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
            return apiCache[url].data as WeatherResponse || null;
        }

        const response = await axios.get(url);
        const data = response.data as WeatherResponse || null;
        apiCache[url] = { timestamp: Date.now(), data };
        return data;
    }
    catch (error) {
        console.error("Error fetching weather:", error);
        return null;
    }
}

export async function getAirQuality(lat: number, lon: number): Promise<AirQualityResponse | null> {
    const url = ENDPOINTS.airPollution
        .replace("{lat}", lat.toString())
        .replace("{lon}", lon.toString())
        .replace("{apiKey}", config.openWeatherMapApiKey);
    try {
        if (apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
            return apiCache[url].data as AirQualityResponse || null;
        }
        const response = await axios.get(url);
        const data = response.data as AirQualityResponse || null;
        apiCache[url] = { timestamp: Date.now(), data };
        return data;
    }
    catch (error) {
        console.error("Error fetching air quality:", error);
        return null;
    }
}

export function getWeatherEmbed(location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null, lightningData: LightningResponse | null, responseMode?: string = "normal"): EmbedBuilder {
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
            embed = getWeatherEmbedLightning(embed, location, weatherData, airQualityData, lightningData);
            break;
    }

    return embed;
}

function getWeatherEmbedNormal(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null, lightningData: LightningResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    const localTime: string = new Date((currentData.dt + weatherData.timezone_offset) * 1000).toISOString().substr(11, 5);
    embed.setTitle(`Weather in ${location.name} at ${localTime} ${flag(location.country)}`);
    embed.setThumbnail(`http://openweathermap.org/img/wn/${currentData.weather[0]!.icon}@2x.png`);

    const today = weatherData.daily ? weatherData.daily[0] : null;

    let closestStrike: Strike | null = null;
    let strikesInRadius: number = 0;
    let closestStrikeDistance: number = Number.MAX_SAFE_INTEGER;
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

    const weather: Weather = currentData.weather[0]!;
    embed.addFields(
        {
            name: "Conditions",
            value: `__**${weather.description}** at **${formatNumber(currentData.temp as number || 0, 1)}°C / ${formatNumber((currentData.temp as number || 0) * 9 / 5 + 32, 1)}°F**__\nLow: **${today ? formatNumber((today.temp as WeatherTemperature)?.min, 1) : "N/A"}°C** / **${today ? formatNumber(((today.temp as WeatherTemperature)?.min || 0) * 9 / 5 + 32, 1) : "N/A"}°F**, High: **${today ? formatNumber((today.temp as WeatherTemperature)?.max, 1) : "N/A"}°C** / **${today ? formatNumber(((today.temp as WeatherTemperature)?.max || 0) * 9 / 5 + 32, 1) : "N/A"}°F**`,
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
            value: `**${getAirQualityDescription(airQualityData ? airQualityData.list[0]!.main.aqi : 0)}** (AQI: **${airQualityData ? airQualityData.list[0]!.main.aqi : "N/A"}**)`,
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

function getWeatherEmbedAlerts(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Weather Alerts for ${location.name} ${flag(location.country)}`);

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
        embed.setTitle(`No weather alerts for ${location.name} ${flag(location.country)}`);
    }
    return embed;
}

function getWeatherEmbedForecast(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Weather Forecast for ${location.name} ${flag(location.country)}`);

    if (weatherData.daily && weatherData.daily.length > 0) {
        for (let i = 1; i <= Math.min(weatherData.daily.length - 1, WEATHER_FORECAST_DAYS); i++) {
            const dayData = weatherData.daily[i]!;
            const dateObject = new Date((dayData.dt + weatherData.timezone_offset) * 1000);
            const date = dateObject.toISOString().substr(0, 10);
            const dayOfWeek = dateObject.toLocaleDateString("en-US", { weekday: "long" });
            const weather = dayData.weather[0]!;
            embed.addFields({
                name: `${dayOfWeek} (${date}) - ${weather.description}`,
                value: `Low: **${formatNumber((dayData.temp as WeatherTemperature)?.min, 1)}°C** / **${formatNumber(((dayData.temp as WeatherTemperature)?.min || 0) * 9 / 5 + 32, 1)}°F**, High: **${formatNumber((dayData.temp as WeatherTemperature)?.max, 1)}°C** / **${formatNumber(((dayData.temp as WeatherTemperature)?.max || 0) * 9 / 5 + 32, 1)}°F**\nPrecipitation Chance: **${formatNumber((dayData.pop || 0) * 100, 1)}%**`,
                inline: false
            })
        }
    }

    const chartUrl = getWeatherForecastChart(weatherData);
    embed.setImage(chartUrl);

    return embed;
}

function getWeatherEmbedAirQuality(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Air Quality in ${location.name} ${flag(location.country)}`);

    if (airQualityData) {
        const aqi = airQualityData.list[0]!.main.aqi;
        embed.addFields({
            name: "Air Quality Index",
            value: `**${aqi} - ${getAirQualityDescription(aqi)}**`,
            inline: false
        });

        const components = airQualityData.list[0]!.components;
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
function getWeatherEmbedLightning(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null, lightningData: LightningResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    embed.setTitle(`Lightning Activity near ${location.name} ${flag(location.country)}`);

    if (lightningData) {
        const strikeCounts = new Array(LIGHTNING_RANGES.length).fill(0);
        let closestStrike: Strike | null = null;
        let closestStrikeDistance: number = Number.MAX_SAFE_INTEGER;

        for (const strike of lightningData.strikes) {
            const distance = Coords.Distance(location, strike.coord);
            if (distance < closestStrikeDistance || !closestStrike) {
                closestStrikeDistance = distance;
                closestStrike = strike;
            }

            for (let i = 0; i < LIGHTNING_RANGES.length; i++) {
                if (distance <= LIGHTNING_RANGES[i]!) {
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
                if (minutesAgo <= STRIKES_PER_MINUTE_BUCKETS[i]!) {
                    strikesPerBuckets[i]++;
                    break;
                }
            }
        }

        let strikesPerMinuteInfo = "";
        for (let i = 0; i < STRIKES_PER_MINUTE_BUCKETS.length; i++) {
            const totalStrikes = strikesPerBuckets[i];
            const strikesPerMinute = totalStrikes / STRIKES_PER_MINUTE_BUCKETS[i]!;
            strikesPerMinuteInfo += `In the last ${STRIKES_PER_MINUTE_BUCKETS[i]} minutes: **${formatNumber(strikesPerMinute, 0)}** strikes per minute\n`;
        }
        embed.addFields({
            name: "Recent Lightning Activity",
            value: strikesPerMinuteInfo,
            inline: false
        });

        const chartUrl = getWeatherNearbyStrikesChart(lightningData, location);
        embed.setImage(chartUrl);
    } else {
        embed.setDescription("No lightning data available.");
    }

    return embed;
}

export function getWindDirection(degrees: number): string {
    //Return compass direction based on degrees (to NNW detail)
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index] || "N/A";
}

export function getAirQualityDescription(aqi: number): string {
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

export function getAlertEmoji(tag: string): string {
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

const ROUND_TO_MINUTES = 10;
const HOURS_TO_DISPLAY = 2;
export function getWeatherNearbyStrikesChart(lightningData: LightningResponse, location: Geo): string {
    //a line graph showing the number of strikes per 5 minutes in the last hour
    //current time should be rounded up (so all should be rounded up to nearest xx:05, xx:10, xx:15, etc)
    //(config using Chart.js, using quickchart.io)
    const now = Date.now();
    const strikesPerInterval: Record<number, number> = {};
    const closestStrikeDistancePerInterval: Record<number, number> = {};

    for (const strike of lightningData.strikes) {
        const distance = Coords.Distance(location, strike.coord);
        if (distance <= 100 && (now - strike.time.getTime()) < HOURS_TO_DISPLAY * 60 * 60 * 1000) { //within 100km and last 2 hours
            const roundedTime = Math.ceil(strike.time.getTime() / (ROUND_TO_MINUTES * 60 * 1000)) * (ROUND_TO_MINUTES * 60 * 1000);
            strikesPerInterval[roundedTime] = (strikesPerInterval[roundedTime] || 0) + 1;

            closestStrikeDistancePerInterval[roundedTime] = Math.min(closestStrikeDistancePerInterval[roundedTime] || Infinity, distance);
        }
    }

    const labels: string[] = [];
    const dataStrikesPerInterval: number[] = [];
    const dataClosestStrikeDistancePerInterval: (number | null)[] = [];

    for (let i = HOURS_TO_DISPLAY * 60 / ROUND_TO_MINUTES; i >= 0; i--) {
        const intervalTime = now - i * ROUND_TO_MINUTES * 60 * 1000;
        const roundedIntervalTime = Math.ceil(intervalTime / (ROUND_TO_MINUTES * 60 * 1000)) * (ROUND_TO_MINUTES * 60 * 1000);
        labels.push(new Date(roundedIntervalTime).toISOString().substr(11, 5));
        dataStrikesPerInterval.push(strikesPerInterval[roundedIntervalTime] || 0);
        //infinity should also be null, as it means no strikes in that interval
        dataClosestStrikeDistancePerInterval.push(closestStrikeDistancePerInterval[roundedIntervalTime]! === Infinity ? null : closestStrikeDistancePerInterval[roundedIntervalTime]!);
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
    const distanceCallback = (value: number) => {
        return `${value}km`;
    }

    const chartDataString = JSON.stringify(chartData).replace('"__CALLBACK_PLACEHOLDER__"', distanceCallback.toString());

    const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(chartDataString)}&height=150&backgroundColor=white`;
    return chartUrl;
}

export function getWeatherForecastChart(weatherResponse: WeatherResponse): string {
    const WEATHER_FORECAST_DAYS_EXTENDED = WEATHER_FORECAST_DAYS * 2;
    const forecastEntries: WeatherData[] = weatherResponse!.daily!.slice(0, WEATHER_FORECAST_DAYS_EXTENDED);

    const chartData = {
        type: "line",
        data: {
            //use MM-DD format
            labels: forecastEntries.map((entry) => `${new Date(entry.dt * 1000).getMonth() + 1}-${new Date(entry.dt * 1000).getDate()}`),
            datasets: [
                //min temp
                {
                    label: "Min",
                    data: forecastEntries.map((entry) => (entry.temp as WeatherTemperature)?.min),
                    borderColor: "rgba(75, 192, 192, 1)",
                    backgroundColor: "rgba(0, 0, 0, 0.3)",
                    fill: false
                },
                //max temp
                {
                    label: "Max",
                    data: forecastEntries.map((entry) => (entry.temp as WeatherTemperature)?.max),
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