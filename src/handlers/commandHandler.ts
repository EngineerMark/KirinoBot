import { weatherCommand } from "../commands/weather.js";
import type { Command } from "../types/Command.js";

export const commands = new Map<string, Command>();

commands.set(weatherCommand.name, weatherCommand);