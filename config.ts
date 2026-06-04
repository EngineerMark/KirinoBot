import dotenv from "dotenv";

dotenv.config();

export const config = {
    openWeatherMapApiKey: process.env.OPENWEATHERMAP_API_KEY!,
    token: process.env.DISCORD_TOKEN!,
    prefix: process.env.PREFIX ?? "?",
    botColor: process.env.BOT_COLOR ? parseInt(process.env.BOT_COLOR) : 0x0099ff
};