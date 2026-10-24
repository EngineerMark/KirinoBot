const sharp = require('sharp');
const { AttachmentBuilder } = require('discord.js');
const { weatherVisual, drawIcon, drawWindCompass } = require('./weather-visuals');
const { drawForecast } = require('./weather-forecast-image');
const { drawLightning } = require('./weather-lightning-image');
const { drawAirQuality } = require('./weather-airquality-image');
const { drawAlerts, drawAlertSymbols } = require('./weather-alerts-image');
const { drawImageTitle } = require('./weather-image-title');

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
    const lines = [];
    for (const paragraph of plainText(value).split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/)) {
            for (let start = 0; start < word.length; start += columns) {
                const part = word.slice(start, start + columns);
                if (line && line.length + part.length + 1 > columns) {
                    lines.push(line);
                    line = '';
                }
                line += (line ? ' ' : '') + part;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

function textLines(lines, x, y, size, color, weight = 400) {
    return lines.map((line, index) => `<text x="${x}" y="${y + index * (size + 8)}" font-size="${size}" fill="${color}" font-weight="${weight}">${escapeXml(line)}</text>`).join('');
}

function buildWeatherSvg(embed, mode = 'normal', context = {}) {
    const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    let fullText = [plainText(data.title), plainText(data.description), ...(data.fields || []).map(field => `${plainText(field.name)}\n${plainText(field.value)}${weatherVisual(field, context, mode).badge ? '\n' + weatherVisual(field, context, mode).badge.label : ''}`), plainText(data.footer?.text), 'Display bands are descriptive, not official warnings. Wind labels use the Beaufort scale.'].filter(Boolean).join('\n\n');
    const title = drawImageTitle(data.title, context.location, { plainText, escapeXml });
    let overflow = title.overflow;
    let y = 76 + title.lines * 38;
    let body = title.svg;
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
    const lightning = mode === 'lightning' ? drawLightning(context.lightning, context.location, y) : null;
    if (lightning) {
        body += lightning.svg;
        y += lightning.height;
    }
    const airQuality = mode === 'airquality' ? drawAirQuality(context.airQuality, y) : null;
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
    const fields = (forecast || airQuality || alerts ? [] : data.fields || []).filter(field => mode !== 'normal' || field.name !== 'Weather Alerts').map(field => {
        if (mode === 'normal' && field.name === 'Wind') return { ...field, inline: true };
        if (mode === 'lightning' && field.name === 'Lightning Activity') return { ...field, value: field.value.replace(/\n/g, ' · ') };
        if (mode === 'lightning' && field.name === 'Recent Lightning Activity') return { ...field, value: field.value.replace(/In the last /g, '').replace(/ minutes:/g, ' min:').replace(/ strikes per minute/g, '/min').replace(/\n/g, ' · ') };
        return field;
    });
    for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        // Compact metrics share a row, while forecasts and alerts retain full width.
        const pair = field.inline && fields[index + 1]?.inline ? fields[++index] : null;
        const row = pair ? [field, pair] : [field];
        const columns = pair ? 25 : 59;
        const prepared = row.map(item => ({
            labels: wrap(item.name, pair ? 21 : 49),
            values: wrap(item.name === 'Wind' ? plainText(item.value).replace(/ from .*/, '') : item.value, item.name === 'Wind' && pair ? 19 : columns),
            compass: item.name === 'Wind',
            ...weatherVisual(item, context, mode),
        }));
        const labels = prepared.flatMap(item => item.labels);
        const values = prepared.flatMap(item => item.values);
        const labelCount = Math.min(Math.max(...prepared.map(item => item.labels.length)), 2);
        const valueCount = Math.min(Math.max(...prepared.map(item => Math.max(item.values.length, item.compass ? 3 : 0))), mode === 'alerts' ? 5 : 4);
        const hasBadge = prepared.some(item => item.badge);
        const height = 28 + labelCount * 26 + valueCount * 26 + (hasBadge ? 36 : 0);
        if (y + height > MAX_HEIGHT - 24) {
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
            body += drawIcon(item.icon, x + 16, y + 11, item.badge?.color);
            body += textLines(item.labels.slice(0, labelCount), x + 48, y + 28, 18, '#8cd9ee', 600);
            body += textLines(item.values.slice(0, valueCount), x + 18, y + 28 + labelCount * 26, 18, '#f0f4fc');
            if (item.compass) body += drawWindCompass(context.weather?.current?.wind_deg, x + width - 84, y + 10, item.badge?.color);
            if (item.badge) {
                const badgeY = y + height - 39;
                const badgeWidth = Math.min(width - 36, item.badge.label.length * 7.5 + 20);
                body += `<rect x="${x + 18}" y="${badgeY - 15}" width="${badgeWidth}" height="24" rx="12" fill="#101e32"/>`;
                body += textLines([item.badge.label], x + 28, badgeY + 2, 13, item.badge.color, 600);
                // A segmented meter expresses the measured level, not warning severity.
                for (let segment = 0; segment < 12; segment++) {
                    const segmentWidth = (width - 47) / 12;
                    const filled = segment < Math.round(item.badge.fraction * 12);
                    body += `<rect x="${x + 18 + segment * (segmentWidth + 1)}" y="${y + height - 17}" width="${segmentWidth}" height="3" rx="1" fill="${filled ? item.badge.color : '#3a4860'}"/>`;
                }
            }
        }
        y += height;
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
    // Bound native memory usage during bursts; the command falls back to embeds.
    if (activeRenders >= 2) throw new Error('Weather image renderer is busy');
    activeRenders++;
    try {
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

