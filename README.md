# KirinoBot

A Discord bot with `/ping`, `/server`, and `/weather`. Weather modes include current conditions, alerts, forecast, air quality, and lightning.

## Requirements

- Node.js 22.13 or newer on the Node 22 line, or Node 24+, with npm. Development and tests have been checked with Node 22.16.0. The installed ESLint version requires at least 22.13 on Node 22.
- A Discord application with a bot token and access to a server where you can install it.
- An OpenWeather API key with access to the endpoints this project uses: Geocoding, Air Pollution, and **One Call 3.0** (`/data/3.0/onecall`). A key alone does not establish access to every product. Confirm your account's subscribed products in the [OpenWeather API overview](https://openweathermap.org/api) and [pricing](https://openweathermap.org/price). The provider currently labels One Call 3.0 deprecated; this project still uses its response format. If your account cannot access it, weather requests will fail; migration to One Call 4.0 is separate work.

## Install and configure

Run commands from the repository root. PowerShell example:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` locally:

| Variable | Used by | Meaning |
| --- | --- | --- |
| `DISCORD_TOKEN` | Bot and command deployment | Bot token from the Discord application's Bot page. |
| `OPENWEATHERMAP_API_KEY` | Bot | Your OpenWeather API key. |
| `CLIENT_ID` | Command deployment | Discord application ID, not the token. |
| `GUILD_ID` | Command deployment | ID of the server where commands are registered. |

The bot validates its two required variables before connecting. Deployment validates the token and both IDs before issuing its registration request. Missing or blank values produce a message naming the variables and a nonzero exit status. Existing process environment variables take precedence over `.env`. Do not commit the populated `.env`; it is ignored by Git.

Set the embed color using `botColor` in `config.json`, for example `"#fa7ade"`.

## Install the bot and register commands

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications), add/configure its bot, and copy the bot token and application ID into `.env`.
2. Configure a **Guild Install** with the `bot` and `applications.commands` scopes. Install it in your target server. See the [official installation guide](https://github.com/discord/discord-api-docs/blob/main/developers/quick-start/getting-started.mdx). Allow it to view the intended channel, send messages, and embed links. This bot uses only the Guilds gateway intent; privileged intents are not required by its code.
3. Enable Discord Developer Mode, copy the target server ID, and set `GUILD_ID`.
4. Register commands:

```powershell
node deploy-commands.js
```

This replaces this application's guild command list in `GUILD_ID` with the command definitions in the repository. Run it when command names, descriptions, options, or choices change. This script does not register global commands. A failed registration exits unsuccessfully.

## Run and check

```powershell
npm start
```

Wait for `Ready! Logged in as ...`, then try `/ping`, `/server`, and `/weather location:Amsterdam`. Select a weather mode using the optional `mode` argument. `/server` requires a server context.

For development with automatic restart:

```powershell
npm run dev
```

Run local checks:

```powershell
npm run lint
npm test
```

Tests mock HTTP and Discord operations; they do not log in, publish commands, validate your subscription, or establish live provider availability. Manually check each weather mode in Discord after configuring credentials.

## Weather data and missing values

- Location lookup and the primary One Call weather response are required. An unusable response produces a command error; a valid empty location lookup reports that the location was not found.
- Missing or invalid measurements display as **Unavailable** rather than being converted to zero. Valid zeros remain zero. Invalid forecast dates and alert records are skipped with a visible notice; missing forecasts or air quality get explicit unavailable messages. Alert text is shortened and omitted alerts are summarized to fit Discord's embed limits.
- Normal mode requests air quality and lightning as supplementary feeds. Lightning mode also requests CAPE from Open-Meteo. Feed failures preserve the usable weather reply. CAPE can still be displayed when lightning is unavailable.
- Lightning aggregates 24 feeds from `maps.blitzortung.org`. If some fail or contain rejected records, both normal and lightning modes show an **incomplete data** notice with feed coverage. Counts and charts then represent available records only. If every feed fails, counts are unknown, not zero. Zero counts are possible when successfully fetched feeds contain no matching strikes; feed success does not guarantee complete real-world detection coverage.
- Responses are held in memory for five minutes, or ten minutes for lightning, with a maximum of 500 URL entries and a 15-second timeout per HTTP request. HTTP errors and responses rejected by validation are not cached. Accepted partial responses can remain cached until their normal expiry. Restarting clears the cache.
- External services used: OpenWeather (location, weather, air quality, condition icons), Open-Meteo (CAPE), Blitzortung maps (lightning), and QuickChart (chart images). QuickChart URLs contain derived forecast or nearby-strike chart data. This is not an offline service.

## Troubleshooting

- **Startup or deployment fails:** check the required variable names and values, token validity, network connectivity, and whether the bot/application belongs to the intended server. Startup/deployment diagnostics deliberately avoid printing tokens or raw upstream payloads.
- **Commands do not appear:** verify `CLIENT_ID`, `GUILD_ID`, installation scopes, channel command access, and successful execution of `node deploy-commands.js`.
- **Weather fails but `/ping` works:** check OpenWeather endpoint access, account limits, API key activation/access, and network availability. A working Geocoding key does not prove One Call access. The current endpoint is One Call 3.0; consult the provider's linked documentation for availability and account access.
- **Incomplete or unavailable supplemental data:** the reply identifies missing feeds or measurements. Retry after cache expiry; a zero-strike result is different from an unavailable feed. Provider coverage and service availability are external to the bot.
