import { EmbedBuilder, Message } from "discord.js";
import type { Command } from "../types/Command.js";
import { parseArgs } from "../helpers.js";
import { getCurrentWeather, getLocation, getWeatherEmbed } from "../handlers/weatherHandler.js";
import type { Geo } from "../types/Geo.js";
import type { WeatherResponse } from "../types/Weather.js";

export const weatherCommand: Command = {
    name: "weather",

    async execute(message: Message, args: string[]) {
        const parsed = parseArgs(args);

        const location = parsed.positional[0] || null;
        const days = parsed.flags.days || null;

        if (!location) {
            await message.reply("Please provide a location.");
            return;
        }

        const locationData: Geo | null = await getLocation(location);

        if (!locationData) {
            await message.reply(`Could not find location: ${location}`);
            return;
        }

        let weatherData: WeatherResponse | null = null;
        if (days) {

        } else {
            weatherData = await getCurrentWeather(locationData.lat, locationData.lon);
        }

        if (weatherData) {
            const embed: EmbedBuilder = getWeatherEmbed(weatherData, locationData);
            await message.reply({ embeds: [embed] });
        } else {
            await message.reply(`Could not find weather information for '${location}'`);
        }

        // await message.reply(
        //     `Weather lookup\nLocation: ${locationData.name}, ${locationData.country}\nDays: ${days}`
        // );
    }
};