const { SlashCommandBuilder } = require('discord.js');
const { getLocation } = require('../../services/weather');
const { weatherNavigation } = require('../../services/weather-navigation');

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
        const output = interaction.options.getString('output') === 'image' ? 'image' : 'embed';

        try {
            const locData = await getLocation(location);
            if (!locData) {
                await interaction.editReply(`Could not find location: ${location}`);
                return;
            }

            await weatherNavigation.start(interaction, locData, mode, output);
        }
        catch (error) {
            console.error(error);
            await interaction.editReply({ content: `Could not load the weather ${output === 'image' ? 'image' : 'embed'} for ${location}. Please try again.`, embeds: [], attachments: [], components: [] });
        }
    },
};
