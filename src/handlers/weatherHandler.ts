import axios from "axios";
import { config } from "../../config.js";
import type { Geo } from "../types/Geo.js";
import type { WeatherResponse } from "../types/Weather.js";
import { EmbedBuilder } from "discord.js";

export async function getLocation(query: string): Promise<Geo | null> {
    const url = `http://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query)}&limit=1&appid=${config.openWeatherMapApiKey}`;
    try {
        const response = await axios.get(url);
        return response.data[0] as Geo || null;
    } catch (error) {
        console.error("Error fetching location:", error);
        return null;
    }
}

export async function getCurrentWeather(lat: number, lon: number): Promise<WeatherResponse | null> {
    const url = `https://api.openweathermap.org/data/4.0/onecall/current?lat=${lat}&lon=${lon}&units=metric&appid=${config.openWeatherMapApiKey}`;
    try {
        const response = await axios.get(url);
        return response.data as WeatherResponse || null;
    }
    catch (error) {
        console.error("Error fetching weather:", error);
        return null;
    }
}

export function getWeatherEmbed(weather: WeatherResponse, location: Geo): EmbedBuilder {
    if(!weather.data || weather.data.length === 0) {
        throw new Error("No weather data available");
    }
    //get local time as HH:MM
    const currentData = weather.data[0]!;
    const localTime: string = new Date((currentData.dt + weather.timezone_offset) * 1000).toISOString().substr(11, 5);

    const embed = new EmbedBuilder();

    embed.setColor(0x0099ff);
    embed.setTitle(`Weather in ${location.name} at ${localTime}`);

    return embed;
}