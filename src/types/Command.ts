import { Message } from "discord.js";

export interface Command {
    name: string;

    execute(
        message: Message,
        args: string[]
    ): Promise<void>;
}