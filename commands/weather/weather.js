const { SlashCommandBuilder } = require('discord.js');
const { getLocation, getWeather, getAirQuality, getLightningData, getAirStability, getWeatherEmbed } = require('../../services/weather');
const { getWeatherImage } = require('../../services/weather-image');

module.exports = {
    data: new SlashCommandBuilder().setName('weather')
        .setDescription('Gets the current weather for a specified location')
        .addStringOption(option =>
            option.setName('location')
                .setDescription('The location to get the weather for')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('mode')
                .setDescription('The mode to display the weather in.')
                .addChoices(
                    { name: 'Normal', value: 'normal' },
                    { name: 'Alerts', value: 'alerts' },
                    { name: 'Forecast', value: 'forecast' },
                    { name: 'Air Quality', value: 'airquality' },
                    { name: 'Lightning', value: 'lightning' },
                ))
        .addStringOption(option =>
            option.setName('output')
                .setDescription('Response format (defaults to embed)')
                .addChoices(
                    { name: 'Embed', value: 'embed' },
                    { name: 'Image', value: 'image' },
                )),
    async execute(interaction) {
        await interaction.deferReply();

        const location = interaction.options.getString('location');
        const mode = interaction.options.getString('mode') || 'normal';
        // const locData = await getLocation(location);

        try {
            const locData = await getLocation(location);
            if (!locData) {
                await interaction.editReply(`Could not find location: ${location}`);
                return;
            }

            const weather = await getWeather(locData.lat, locData.lon);
            const optional = async (request) => {
                try { return await request(); }
                catch (error) { console.error('Optional weather feed failed:', error); return null; }
            };
            const [airQuality, lightning, airStability] = await Promise.all([
                ['normal', 'airquality'].includes(mode)
                    ? optional(() => getAirQuality(locData.lat, locData.lon)) : null,
                ['normal', 'lightning'].includes(mode) ? optional(getLightningData) : null,
                mode === 'lightning' ? optional(() => getAirStability(locData.lat, locData.lon)) : null,
            ]);

            if (weather) {
                const embed = getWeatherEmbed(locData, weather, airQuality, lightning, airStability, mode);
                if (interaction.options.getString('output') === 'image') {
                    try {
                        const image = await getWeatherImage(embed, mode, { weather, airQuality, airStability });
                        await interaction.editReply(image);
                        return;
                    }
                    catch (error) {
                        console.error('Weather image output failed:', error);
                        await interaction.editReply({ content: 'Image output is unavailable; showing an embed instead.', embeds: [embed], attachments: [] });
                        return;
                    }
                }
                await interaction.editReply({ embeds: [embed] });
            }
            else {
                await interaction.editReply(`Could not find weather information for '${location}'`);
            }
        }
        catch (error) {
            console.error(error);
            await interaction.editReply(`An error occurred while fetching the weather for ${location}.`);
        }
    },
};
