const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
const { validateEnvironment } = require('./services/config');
const { handleInteraction } = require('./services/interactions');

async function start(env = process.env, createClient = options => new Client(options)) {
    validateEnvironment(env);
    const client = createClient({ intents: [GatewayIntentBits.Guilds] });

    client.once(Events.ClientReady, (readyClient) => {
        console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    });

    client.commands = new Collection();

    const foldersPath = path.join(__dirname, 'commands');
    const commandFolders = fs.readdirSync(foldersPath);

    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            // Set a new item in the Collection with the key as the command name and the value as the exported module
            if ('data' in command && 'execute' in command) {
                console.log(`Loading command: ${command.data.name}`);
                client.commands.set(command.data.name, command);
            }
            else {
                console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
            }
        }
    }

    client.on(Events.InteractionCreate, handleInteraction);
    try {
        await client.login(env.DISCORD_TOKEN);
    }
    catch (error) {
        try {
            await client.destroy();
        }
        catch {
            console.error('Failed to close the Discord client after login failure.');
        }
        throw error;
    }
    return client;
}

if (require.main === module) {
    require('dotenv').config();
    start().catch(error => {
        console.error(error.message.startsWith('Missing required environment variables:') ? error.message : 'Bot startup failed. Check configuration and Discord connectivity.');
        process.exitCode = 1;
    });
}

module.exports = { start };
