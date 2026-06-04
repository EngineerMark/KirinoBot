import {
    Client,
    Events,
    GatewayIntentBits,
    Partials
} from "discord.js";
import { config } from "../config.js";
import { commands } from "./handlers/commandHandler.js";

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [
        Partials.Channel,
        Partials.Message
    ]
});

client.once(Events.ClientReady, () => {
    console.log(`Logged in as ${client.user?.tag}`);
});

client.on(Events.MessageCreate, async message => {

    if (message.author.bot) {
        return;
    }

    if (!message.content.startsWith(config.prefix)) {
        return;
    }

    const withoutPrefix =
        message.content.slice(config.prefix.length);

    const parts = withoutPrefix.trim().split(/\s+/);

    const commandName =
        parts.shift()?.toLowerCase();

    if (!commandName) {
        return;
    }

    const command = commands.get(commandName);

    if (!command) {
        return;
    }

    try {
        await command.execute(message, parts);
    }
    catch (error) {
        console.error(error);

        await message.reply(
            "Something went wrong."
        );
    }
});

client.login(config.token);