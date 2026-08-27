const { SlashCommandBuilder } = require('discord.js');
const { getLocation, getWeather, getAirQuality, getLightningData, getAirStability, getWeatherEmbed } = require('../../services/weather');

module.exports = {
    data: new SlashCommandBuilder().setName('weather')
        .setDescription('Gets the current weather for a specified location')
        .addStringOption(option =>
            option.setName('location')
                .setDescription('The location to get the weather for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName("mode")
                .setDescription("The mode to display the weather in.")
                .addChoices(
                    { name: "Normal", value: "normal" },
                    { name: "Alerts", value: "alerts" },
                    { name: "Forecast", value: "forecast" },
                    { name: "Air Quality", value: "airquality" },
                    { name: "Lightning", value: "lightning" }
                )),
    async execute(interaction) {
        await interaction.deferReply();

        const location = interaction.options.getString('location');
        const mode = interaction.options.getString('mode') || "normal";
        // const locData = await getLocation(location);

        try {
            const locData = await getLocation(location);
            if (!locData) {
                await interaction.editReply(`Could not find location: ${location}`);
                return;
            }

            const weather = await getWeather(locData.lat, locData.lon);
            const airQuality = await getAirQuality(locData.lat, locData.lon);
            const lightning = await getLightningData();
            const airStability = await getAirStability(locData.lat, locData.lon);

            if (weather) {
                const embed = getWeatherEmbed(locData, weather, airQuality, lightning, airStability, mode);
                await interaction.editReply({ embeds: [embed] });
            } else {
                await interaction.editReply(`Could not find weather information for '${location}'`);
            }
        } catch (error) {
            console.error(error);
            await interaction.editReply(`An error occurred while fetching the weather for ${location}.`);
        }
    },
};