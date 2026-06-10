import { EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types/Command.js";
import { parseArgs } from "../helpers.js";
import { getWeather, getLocation, getWeatherEmbed, getAirQuality, getLightningData } from "../handlers/weatherHandler.js";
import type { Geo } from "../types/Geo.js";
import type { WeatherResponse } from "../types/Weather.js";
import type { AirQualityResponse } from "../types/AirQuality.js";
import type { LightningResponse } from "../types/Lightning.js";

export const weatherCommand: Command = {
    name: "weather",

    async execute(message: Message, args: string[]) {
        const parsed = parseArgs(args);

        const location = parsed.positional[0] || null;
        const showAlerts = parsed.flags.alerts || false;
        const showForecast = parsed.flags.forecast || false;
        const showAirQuality = parsed.flags.airquality || false;

        if (!location) {
            await message.reply("Please provide a location.");
            return;
        }

        const locationData: Geo | null = await getLocation(location);

        if (!locationData) {
            await message.reply(`Could not find location: ${location}`);
            return;
        }

        const weather: WeatherResponse | null = await getWeather(locationData.lat, locationData.lon);
        const airQuality: AirQualityResponse | null = await getAirQuality(locationData.lat, locationData.lon);
        const lightning: LightningResponse | null = await getLightningData();

        let responseMode = "normal";
        if (showAlerts) { responseMode = "alerts"; }
        else if (showForecast) { responseMode = "forecast"; }
        else if (showAirQuality) { responseMode = "airquality"; }

        if (weather) {
            const embed: EmbedBuilder = getWeatherEmbed(locationData, weather, airQuality, lightning, responseMode);
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`Could not find weather information for '${location}'`);
        }
    }
};