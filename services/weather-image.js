const sharp = require('sharp');
const { AttachmentBuilder } = require('discord.js');
const { weatherVisual, drawIcon, drawWindCompass } = require('./weather-visuals');
const { drawForecast } = require('./weather-forecast-image');
const { drawLightning } = require('./weather-lightning-image');
const { drawLightningMap } = require('./weather-lightning-map');
const { drawAirQuality } = require('./weather-airquality-image');
const { drawAlerts, drawAlertSymbols } = require('./weather-alerts-image');
const { drawImageTitle } = require('./weather-image-title');
const { drawHourly } = require('./weather-hourly-image');
const { wrapText, measureText, ensureFonts } = require('./weather-image-layout');
const { drawDaylight } = require('./weather-daylight-image');
const { daylightSummary } = require('./weather-outlook-data');

// Render the same presentation data as embeds, without fetching remote assets.
const WIDTH = 720;
const MAX_HEIGHT = 960;
const MODES = { normal: 'CURRENT WEATHER', forecast: 'FORECAST', alerts: 'WEATHER ALERTS', airquality: 'AIR QUALITY', lightning: 'LIGHTNING ACTIVITY' };

function plainText(value) {
    return String(value ?? '').replace(/<t:(\d+):\w>/g, (_, seconds) => {
        const date = new Date(Number(seconds) * 1000);
        return Number.isNaN(date.getTime()) ? 'Unavailable' : date.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    }).replace(/[*_]/g, '').replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F/gu, '').replace(/\p{Cc}/gu, char => '\n\t\r'.includes(char) ? char : '').trim();
}

function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' }[char]));
}

function wrap(value, columns) {
    return wrapText(plainText(value), columns * 9.5);
}

function textLines(lines, x, y, size, color, weight = 400) {
    return lines.map((line, index) => `<text x="${x}" y="${y + index * (size + 8)}" font-size="${size}" fill="${color}" font-weight="${weight}">${escapeXml(line)}</text>`).join('');
}

function imageValue(field) {
    let value = plainText(field.value)
        .replace(/(?:Unavailable|N\/A)(?:°[CF]|%| (?:km\/h|mph|hPa|km|miles|J\/kg))?/g, 'Unavailable')
        .replace(/Unavailable\s*\/\s*Unavailable/g, 'Unavailable')
        .replace(/Unavailable \(AQI: Unavailable\)/g, 'Unavailable');
    if (field.name === 'Wind') value = value.replace(/ from .*/, '');
    if (field.name === 'Nearby Lightning Strikes' && value.startsWith('Unavailable')) value = 'Unavailable';
    if (field.name === 'Conditions') value = value.replace(/Unavailable at Unavailable/g, 'Unavailable');
    return value;
}

function buildWeatherSvg(embed, mode = 'normal', context = {}) {
    const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    let fullText = [plainText(data.title), plainText(data.description), ...(data.fields || []).map(field => `${plainText(field.name)}\n${plainText(field.value)}${weatherVisual(field, context, mode).badge ? '\n' + weatherVisual(field, context, mode).badge.label : ''}`), plainText(data.footer?.text), 'Display bands are descriptive, not official warnings. Wind labels use the Beaufort scale.'].filter(Boolean).join('\n\n');
    const title = drawImageTitle(data.title, context.location, { plainText, escapeXml });
    let overflow = title.overflow;
    let y = 76 + title.lines * 38;
    let body = title.svg;
    if (mode === 'normal') fullText = [plainText(data.title), daylightSummary(context.weather), fullText].join('\n\n');
    if (data.description) {
        const notices = wrap(data.description, 64);
        overflow ||= notices.length > 5;
        body += textLines(notices.slice(0, 5), 32, y + 10, 17, '#f9cc83');
        y += Math.min(notices.length, 5) * 25 + 24;
    }
    const alertSymbols = mode === 'normal' ? drawAlertSymbols(context.weather, y, { textLines }) : null;
    if (alertSymbols) {
        body += alertSymbols.svg;
        y += alertSymbols.height;
        fullText = [plainText(data.title), alertSymbols.summary, fullText].join('\n\n');
    }
    const forecast = mode === 'forecast' ? drawForecast(context.weather, y, MAX_HEIGHT - y - 24) : null;
    if (forecast) {
        body += forecast.svg;
        y += forecast.height;
        overflow ||= forecast.overflow;
    }
    const lightningMap = mode === 'lightning' ? drawLightningMap(context.lightning, context.location, y) : null;
    if (lightningMap) {
        body += lightningMap.svg;
        y += lightningMap.height;
        fullText = [plainText(data.title), lightningMap.summary, fullText].join('\n\n');
    }
    const lightning = mode === 'lightning' ? drawLightning(context.lightning, context.location, y) : null;
    if (lightning) {
        body += lightning.svg;
        y += lightning.height;
    }
    const airQuality = mode === 'airquality' ? drawAirQuality(context.airQuality, y, context.airQualityForecast, context.weather?.timezone_offset, MAX_HEIGHT - y - 16) : null;
    if (airQuality) {
        body += airQuality.svg;
        y += airQuality.height;
        fullText = [plainText(data.title), airQuality.summary, fullText].join('\n\n');
    }
    const alerts = mode === 'alerts' ? drawAlerts(context.weather, y, MAX_HEIGHT - y - 24, { wrap, textLines }) : null;
    if (alerts) {
        body += alerts.svg;
        y += alerts.height;
        fullText = [plainText(data.title), alerts.summary, fullText].join('\n\n');
    }
    const fields = (forecast || airQuality || alerts ? [] : data.fields || []).filter(field => {
        if (mode === 'normal' && field.name === 'Weather Alerts') return false;
        if (mode === 'normal' && field.name === 'Daylight') return false;
        if (lightningMap && ['Lightning Activity', 'Closest Strike', 'Recent Lightning Activity'].includes(field.name)) return false;
        return true;
    }).map(field => {
        if (mode === 'normal' && field.name === 'Wind') return { ...field, inline: true };
        if (mode === 'lightning' && field.name === 'Lightning Activity') return { ...field, value: field.value.replace(/\n/g, ' · ') };
        if (mode === 'lightning' && field.name === 'Recent Lightning Activity') return { ...field, value: field.value.replace(/In the last /g, '').replace(/ minutes:/g, ' min:').replace(/ strikes per minute/g, '/min').replace(/\n/g, ' · ') };
        return field;
    });
    const hourly = mode === 'normal' ? drawHourly(context.weather, 0) : null;
    for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        // Compact metrics share a row, while forecasts and alerts retain full width.
        const pair = field.inline && fields[index + 1]?.inline ? fields[++index] : null;
        const row = pair ? [field, pair] : [field];
        const columns = pair ? 25 : 59;
        const prepared = row.map(item => ({
            labels: wrap(item.name, pair ? 21 : 49),
            values: wrap(imageValue(item), item.name === 'Wind' && pair ? 19 : columns),
            compass: item.name === 'Wind',
            daylight: mode === 'normal' && item.name === 'Cloud Coverage',
            ...weatherVisual(item, context, mode),
        }));
        const labels = prepared.flatMap(item => item.labels);
        const values = prepared.flatMap(item => item.values);
        const labelCount = Math.min(Math.max(...prepared.map(item => item.labels.length)), 2);
        const valueCount = Math.min(Math.max(...prepared.map(item => Math.max(item.values.length, item.compass ? hourly ? 2 : 3 : 0))), mode === 'alerts' ? 5 : 4);
        const hasBadge = prepared.some(item => item.badge);
        const lineStep = hourly ? 24 : 26;
        const fontSize = hourly ? 16 : 18;
        const padding = hourly ? 22 : 28;
        const height = Math.max(prepared.some(item => item.daylight) ? 124 : 0, padding + labelCount * lineStep + valueCount * lineStep + (hasBadge ? hourly ? 26 : 36 : 0));
        if (y + height > MAX_HEIGHT - 16) {
            overflow = true;
            break;
        }
        overflow ||= labels.length > labelCount * row.length || values.length > valueCount * row.length;
        for (let column = 0; column < prepared.length; column++) {
            const item = prepared[column];
            overflow ||= item.labels.length > labelCount || item.values.length > valueCount;
            const x = 24 + column * 344;
            const width = pair ? 328 : 672;
            body += `<rect x="${x}" y="${y}" width="${width}" height="${height - 8}" rx="14" fill="#202e46"/>`;
            body += drawIcon(item.icon, x + 16, y + padding - 17, item.badge?.color);
            body += textLines(item.labels.slice(0, labelCount), x + 48, y + padding, fontSize, '#8cd9ee', 600);
            body += textLines(item.values.slice(0, valueCount), x + 18, y + padding + labelCount * lineStep, fontSize, '#f0f4fc');
            if (item.compass) {
                body += hourly
                    ? `<g transform="translate(${x + width - 74} ${y + 6}) scale(0.8)">${drawWindCompass(context.weather?.current?.wind_deg, 0, 0, item.badge?.color)}</g>`
                    : drawWindCompass(context.weather?.current?.wind_deg, x + width - 84, y + 10, item.badge?.color);
            }
            if (item.daylight) {
                body += drawDaylight(context.weather, x + 18, y + 58, width - 36);
                if (item.badge) {
                    const badgeWidth = measureText(item.badge.label, 12, true) + 20;
                    body += `<rect x="${x + 80}" y="${y + padding + lineStep - 15}" width="${badgeWidth}" height="22" rx="11" fill="#101e32"/>`;
                    body += textLines([item.badge.label], x + 90, y + padding + lineStep, 12, item.badge.color, 600);
                }
            }
            else if (item.badge) {
                const badgeY = y + height - (hourly ? 25 : 39);
                const badgeWidth = Math.min(width - 36, measureText(item.badge.label, 13, true) + 20);
                body += `<rect x="${x + 18}" y="${badgeY - 15}" width="${badgeWidth}" height="24" rx="12" fill="#101e32"/>`;
                body += textLines([item.badge.label], x + 28, badgeY + 2, 13, item.badge.color, 600);
                // A segmented meter expresses the measured level, not warning severity.
                for (let segment = 0; segment < (hourly ? 0 : 12); segment++) {
                    const segmentWidth = (width - 47) / 12;
                    const filled = segment < Math.round(item.badge.fraction * 12);
                    body += `<rect x="${x + 18 + segment * (segmentWidth + 1)}" y="${y + height - 17}" width="${segmentWidth}" height="3" rx="1" fill="${filled ? item.badge.color : '#3a4860'}"/>`;
                }
            }
        }
        y += height;
        if (hourly && field.name === 'Conditions') {
            body += `<g transform="translate(0 ${y})">${hourly.svg}</g>`;
            y += hourly.height;
            fullText = [plainText(data.title), hourly.summary, fullText].join('\n\n');
        }
    }
    if (data.footer?.text) overflow = true;
    const height = Math.min(MAX_HEIGHT, Math.max(240, y + 16));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#182b47"/><stop offset="1" stop-color="#101927"/></linearGradient></defs>
<rect width="720" height="${height}" rx="20" fill="url(#bg)"/>
<path d="M32 24h32" stroke="#73d9e9" stroke-width="4" stroke-linecap="round"/>
<g font-family="DejaVu Sans, Arial, sans-serif">${textLines([MODES[mode] || MODES.normal], 76, 30, 13, '#9bb1ce', 700)}${body}</g></svg>`;
    return { svg, fullText, overflow, height };
}

let activeRenders = 0;
async function getWeatherImage(embed, mode, context) {
    // Bound native memory usage during bursts; navigation preserves the current view on failure.
    if (activeRenders >= 2) throw new Error('Weather image renderer is busy');
    activeRenders++;
    try {
        await ensureFonts();
        const { svg, fullText } = buildWeatherSvg(embed, mode, context);
        const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
        if (buffer.length > 1024 * 1024) throw new Error('Weather image exceeded size budget');
        const files = [new AttachmentBuilder(buffer, { name: `weather-${mode || 'normal'}.png`, description: fullText.slice(0, 1000) })];
        return { files };
    }
    finally {
        activeRenders--;
    }
}

module.exports = { getWeatherImage, buildWeatherSvg };

