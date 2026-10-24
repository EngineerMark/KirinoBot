const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');
const { validateEnvironment } = require('./services/config');

async function deploy(env = process.env, createRest = () => new REST()) {
    validateEnvironment(env, true);
    const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = env;

    const commands = [];
    // Grab all the command folders from the commands directory you created earlier
    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
    // Grab all the command files from the commands directory you created earlier
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
        // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            }
            else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    // Construct and prepare an instance of the REST module
    const rest = createRest().setToken(DISCORD_TOKEN);


    console.log(`Started refreshing ${commands.length} application (/) commands.`);

    // The put method is used to fully refresh all commands in the guild with the current set
    const data = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });

    console.log(`Successfully reloaded ${data.length} application (/) commands.`);
}

if (require.main === module) {
    require('dotenv').config();
    deploy().catch(error => {
        console.error(error.message.startsWith('Missing required environment variables:') ? error.message : 'Command deployment failed. Check configuration and Discord connectivity.');
        process.exitCode = 1;
    });
}

module.exports = { deploy };
