const { MessageFlags } = require('discord.js');

async function handleInteraction(interaction, logger = console) {
    if (!interaction.isChatInputCommand()) return;
    try {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) throw new Error('Unknown command: ' + interaction.commandName);
        await command.execute(interaction);
    }
    catch (error) {
        logger.error(error);
        try {
            const content = 'There was an error while executing this command!';
            if (interaction.deferred && !interaction.replied) await interaction.editReply({ content });
            else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
            else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
        }
        catch (replyError) {
            logger.error('Failed to send command error response:', replyError);
        }
    }
}

module.exports = { handleInteraction };
