import axios from "axios";
import { config } from "../../config.js";
import type { Geo } from "../types/Geo.js";
import type { Weather, WeatherResponse, WeatherTemperature } from "../types/Weather.js";
import { EmbedBuilder } from "discord.js";
import flag from 'country-code-emoji';
import { formatNumber } from "../helpers.js";
import type { AirQualityResponse } from "../types/AirQuality.js";

const ENDPOINTS = {
    location: "http://api.openweathermap.org/geo/1.0/direct?q={query}&limit=1&appid={apiKey}",
    weather: "https://api.openweathermap.org/data/3.0/onecall?lat={lat}&lon={lon}&units=metric&appid={apiKey}",
    airPollution: "http://api.openweathermap.org/data/2.5/air_pollution?lat={lat}&lon={lon}&appid={apiKey}"
}

//store for 10 minutes (url, timestamp, data)
const apiCache: Record<string, { timestamp: number, data: any }> = {};
const apiCacheDuration = 10 * 60 * 1000; // 10 minutes in milliseconds

export async function getLocation(query: string): Promise<Geo | null> {
    const url = ENDPOINTS.location
        .replace("{query}", encodeURIComponent(query))
        .replace("{apiKey}", config.openWeatherMapApiKey);
    try {
        if(apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
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
        if(apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
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
        if(apiCache[url] && (Date.now() - apiCache[url].timestamp < apiCacheDuration)) {
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

export function getWeatherEmbed(location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null, responseMode?: string = "normal"): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    let embed = new EmbedBuilder();
    embed.setColor(config.botColor);

    switch (responseMode) {
        case "normal":
            embed = getWeatherEmbedNormal(embed, location, weatherData, airQualityData);
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
    }

    return embed;
}

function getWeatherEmbedNormal(embed: EmbedBuilder, location: Geo, weatherData: WeatherResponse, airQualityData: AirQualityResponse | null): EmbedBuilder {
    const currentData = weatherData.current;
    if (!currentData) {
        throw new Error("No weather data available");
    }

    const localTime: string = new Date((currentData.dt + weatherData.timezone_offset) * 1000).toISOString().substr(11, 5);
    embed.setTitle(`Weather in ${location.name} at ${localTime} ${flag(location.country)}`);
    embed.setThumbnail(`http://openweathermap.org/img/wn/${currentData.weather[0]!.icon}@2x.png`);

    const today = weatherData.daily ? weatherData.daily[0] : null;

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
        for (let i = 0; i < Math.min(weatherData.daily.length, 5); i++) {
            const dayData = weatherData.daily[i]!;
            const date = new Date((dayData.dt + weatherData.timezone_offset) * 1000).toISOString().substr(0, 10);
            const weather = dayData.weather[0]!;
            embed.addFields({
                name: `${date} - ${weather.description}`,
                value: `Low: **${formatNumber((dayData.temp as WeatherTemperature)?.min, 1)}°C** / **${formatNumber(((dayData.temp as WeatherTemperature)?.min || 0) * 9 / 5 + 32, 1)}°F**, High: **${formatNumber((dayData.temp as WeatherTemperature)?.max, 1)}°C** / **${formatNumber(((dayData.temp as WeatherTemperature)?.max || 0) * 9 / 5 + 32, 1)}°F**\nPrecipitation Chance: **${formatNumber((dayData.pop || 0) * 100, 1)}%**`,
                inline: false
            })
        }
    }

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
        default:
            return "⚠️";
    }
}