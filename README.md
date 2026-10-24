# KirinoBot

A Discord bot with `/ping`, `/server`, and `/weather`. Weather modes include current conditions, alerts, forecast, air quality, and lightning.

Use `/weather location:Amsterdam output:image` for a compact PNG card, or combine it with any existing mode, such as `/weather location:Amsterdam mode:forecast output:image`. Omitting `output` keeps the default embed. Image cards are at most 720 × 960 pixels and 1 MiB; lengthy content is summarized on the card. Cards have no footer. Image replies attach only the PNG; use `output:embed` for additional detail. Images use Sharp locally and do not fetch QuickChart images or condition icons. The output format stays fixed; an image failure does not switch to an embed. Re-run `node deploy-commands.js` after installing dependencies when slash-command options change, and restart the bot to load code changes.

Successful weather replies include **Current**, **Forecast**, **Lightning**, **Air Quality**, and **Alerts** buttons. The original requester can switch modes on the same message, retaining the resolved location and original output format. The selected mode is highlighted and disabled; there is no output-format switch. Updates use the existing API cache and fetch only feeds needed for the selected mode. Old embeds and image attachments are replaced rather than accumulated. If an update fails, the current view remains available with a private error message; simultaneous switches are rejected while an update is in progress.

Navigation sessions expire after 30 minutes without a successful switch, on bot restart, or when the 500-view memory limit evicts an older inactive view. Clicking an expired control gives a private instruction to run `/weather` again. Other users are directed to open their own view. These buttons need only a bot restart to enable; no command re-registration is needed for this change.

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
2. Configure a **Guild Install** with the `bot` and `applications.commands` scopes. Install it in your target server. See the [official installation guide](https://github.com/discord/discord-api-docs/blob/main/developers/quick-start/getting-started.mdx). Allow it to view the intended channel, send messages, embed links, and attach files for image output. This bot uses only the Guilds gateway intent; privileged intents are not required by its code.
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

Lightning images also include a north-up circular strike-position chart centered on the requested location, with a fixed 100 km radius and rings at 25/50/100 km. Every valid strike within that radius from the last two hours is plotted using geodesic distance and bearing, with older points painted first. Colors indicate age: coral 0–15 minutes, gold 15–30, cyan 30–60, and muted blue 60–120. A center cross marks the location. Nearby counts and nearest-strike distance/age use the same two-hour window; the activity timeline and CAPE panel remain below. Empty feeds show an empty map; unavailable feeds omit it. No map tiles or extra API calls are needed.

Weather images use bundled DejaVu Sans fonts and measured text wrapping for consistent layout across hosts. To review all five modes plus long-title and missing-data cases without contacting providers, run `node scripts/render-weather-samples.js <output-directory>`. This writes ten synthetic PNG samples and an `overview.png` contact sheet. Each individual card remains within 720 × 960 pixels; previews do not establish live Discord rendering.

Main weather images include a compact hourly temperature graph below current conditions when hourly data is available: up to 13 readings across the next 12 hours, a coral temperature line, subtle cyan precipitation-chance bars on a separate 0–100% scale, and local-time labels (UTC when the offset is missing). Invalid temperatures and missing hours break the line. Precipitation probabilities are validated as 0–1 and displayed as percentages; missing values show a small question mark rather than a zero bar. If no probabilities are available, the graph stays temperature-only without changing its height. Metric panels use a denser layout while retaining their severity labels and wind compass, keeping the image within 720 × 960 pixels. No additional API call is needed; hourly data comes from the existing One Call response.

Weather image headings include a country flag directly after the location name, using local `flag-icons` SVG assets when the location has a supported two-letter country code. Flags do not depend on emoji fonts or remote image requests; missing or unsupported codes simply omit the flag.

The main weather image displays alerts as compact severity-colored hazard symbols with tiny relative timing labels (time remaining, upcoming start, ended, or unknown). It omits the full alert text panel; use `mode:alerts` for detailed cards. Up to seven symbols fit in one row; larger sets show six symbols and a remaining-count badge. No strip appears when no alerts are returned. Alert names and classifications remain in the image attachment description.

Alert images use hazard-specific vector icons and colored badges taken from explicit event-title labels (red/orange/yellow warning or alert, Warning, Watch, Advisory). Titles without a recognized label show Unspecified; hazard names and description text do not imply a severity rating. OpenWeather's alert schema has no separate severity field. Cards show the source agency, local start/end times (UTC if the offset is unavailable), and Active/Upcoming/Expired status. Long titles and descriptions end with an ellipsis, and an in-card count reports when only some alerts fit. Empty alerts and unavailable alert data have distinct states. Images retain the 720 × 960 limit and attach only the PNG.

Air-quality images include an overall OpenWeather 1–5 rating and a horizontal severity chart for PM2.5, PM10, NO₂, O₃, SO₂, and CO, alongside their concentrations in µg/m³. Chart lengths represent severity categories, not comparable raw concentrations. Ratings use [OpenWeather's pollutant-specific boundaries](https://openweathermap.org/api/air-pollution), including the lower boundary in each higher category. NO and NH₃ are displayed as ungraded additional readings; missing concentrations are unavailable rather than rated as good. These are OpenWeather categories, not US EPA AQI values.

Lightning image output includes a local chart of strikes within 100 km over the last two hours, with coral bars for 10-minute counts and a cyan line for the nearest strike in each interval. The axes use matching colors, and empty intervals break the distance line. Future, older, and distant strikes are excluded. When no lightning feed is available the chart is omitted; a successfully fetched empty feed produces a zero-activity chart.

Forecast image output includes a locally rendered temperature graph with coral highs, cyan lows, a shaded range, local dates, and seven compact daily rows with weather icons and precipitation probability. It uses the next seven daily entries (excluding today), leaves gaps for missing temperatures, and stays within the existing image size limits. No external chart image is fetched for image output.

Image output adds local vector icons, colored descriptive badges, and segmented meters for temperature/feels-like, Beaufort wind force, humidity, cloud coverage, pressure, visibility, OpenWeather's 1–5 AQI, forecast precipitation probability, and CAPE instability. Badges use numeric feed values rather than rounded display text; unavailable values have no badge. Wind follows [Beaufort thresholds](https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale). Other display bands are simple descriptive ranges, not official warnings or health assessments. CAPE describes instability, not a thunderstorm probability. Temperature bands use 0/10/20/30 °C, humidity 30/70%, clouds 10/30/70/90%, visibility 1/5/10 km, pressure 1000/1020 hPa, and CAPE 500/1000/2500/4000 J/kg. Meters show the measured level within each display scale; color is accompanied by text. Additional labels also appear in attachment descriptions. Wind direction uses a compass needle pointing toward the wind source, with cardinal markers and a From label; missing directions display Unknown.

- Location lookup and the primary One Call weather response are required. An unusable response produces a command error; a valid empty location lookup reports that the location was not found.
- Missing or invalid measurements display as **Unavailable** rather than being converted to zero. Valid zeros remain zero. Invalid forecast dates and alert records are skipped with a visible notice; missing forecasts or air quality get explicit unavailable messages. Alert text is shortened and omitted alerts are summarized to fit Discord's embed limits.
- Normal mode requests air quality and lightning as supplementary feeds. Lightning mode also requests CAPE from Open-Meteo. Feed failures preserve the usable weather reply. CAPE can still be displayed when lightning is unavailable.
- Lightning attempts 24 feed pages from `maps.blitzortung.org`; this is a request window, not a known total page count. Missing pages do not produce a feed-coverage or missing-data banner. Counts and charts then represent available records only. If every feed fails, counts are unknown, not zero. Zero counts are possible when successfully fetched feeds contain no matching strikes; feed success does not guarantee complete real-world detection coverage.
- Responses are held in memory for five minutes, or ten minutes for lightning, with a maximum of 500 URL entries and a 15-second timeout per HTTP request. HTTP errors and responses rejected by validation are not cached. Accepted partial responses can remain cached until their normal expiry. Restarting clears the cache.
- External services used: OpenWeather (location, weather, air quality, condition icons), Open-Meteo (CAPE), Blitzortung maps (lightning), and QuickChart (chart images). QuickChart URLs contain derived forecast or nearby-strike chart data. This is not an offline service.

## Troubleshooting

- **Startup or deployment fails:** check the required variable names and values, token validity, network connectivity, and whether the bot/application belongs to the intended server. Startup/deployment diagnostics deliberately avoid printing tokens or raw upstream payloads.
- **Commands do not appear:** verify `CLIENT_ID`, `GUILD_ID`, installation scopes, channel command access, and successful execution of `node deploy-commands.js`.
- **Weather fails but `/ping` works:** check OpenWeather endpoint access, account limits, API key activation/access, and network availability. A working Geocoding key does not prove One Call access. The current endpoint is One Call 3.0; consult the provider's linked documentation for availability and account access.
- **Incomplete or unavailable supplemental data:** the reply identifies missing feeds or measurements. Retry after cache expiry; a zero-strike result is different from an unavailable feed. Provider coverage and service availability are external to the bot.
