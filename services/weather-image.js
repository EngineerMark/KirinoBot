const sharp = require('sharp');
const { AttachmentBuilder } = require('discord.js');

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

function buildWeatherSvg(embed, mode = 'normal') {
    const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
    const fullText = [plainText(data.title), plainText(data.description), ...(data.fields || []).map(field => `${plainText(field.name)}\n${plainText(field.value)}`), plainText(data.footer?.text)].filter(Boolean).join('\n\n');
    const title = wrap(data.title, 36);
    let overflow = title.length > 2;
    let y = 76 + Math.min(title.length, 2) * 38;
    let body = textLines(title.slice(0, 2), 32, 82, 30, '#f5f8ff', 700);
    if (data.description) {
        const notices = wrap(data.description, 64);
        overflow ||= notices.length > 5;
        body += textLines(notices.slice(0, 5), 32, y + 10, 17, '#f9cc83');
        y += Math.min(notices.length, 5) * 25 + 24;
    }
    const fields = data.fields || [];
    for (let index = 0; index < fields.length; index++) {
        const field = fields[index];
        // Compact metrics share a row, while forecasts and alerts retain full width.
        const pair = field.inline && fields[index + 1]?.inline ? fields[++index] : null;
        const row = pair ? [field, pair] : [field];
        const columns = pair ? 28 : 62;
        const prepared = row.map(item => ({ labels: wrap(item.name, pair ? 25 : 53), values: wrap(item.value, columns) }));
        const labels = prepared.flatMap(item => item.labels);
        const values = prepared.flatMap(item => item.values);
        const labelCount = Math.min(Math.max(...prepared.map(item => item.labels.length)), 2);
        const valueCount = Math.min(Math.max(...prepared.map(item => item.values.length)), mode === 'alerts' ? 5 : 4);
        const height = 28 + labelCount * 26 + valueCount * 26;
        if (y + height > MAX_HEIGHT - 76) {
            overflow = true;
            break;
        }
        overflow ||= labels.length > labelCount * row.length || values.length > valueCount * row.length;
        for (let column = 0; column < prepared.length; column++) {
            const item = prepared[column];
            overflow ||= item.labels.length > labelCount || item.values.length > valueCount;
            const x = 24 + column * 344;
            body += `<rect x="${x}" y="${y}" width="${pair ? 328 : 672}" height="${height - 8}" rx="14" fill="#202e46"/>`;
            body += textLines(item.labels.slice(0, labelCount), x + 18, y + 28, 18, '#8cd9ee', 600);
            body += textLines(item.values.slice(0, valueCount), x + 18, y + 28 + labelCount * 26, 18, '#f0f4fc');
        }
        y += height;
    }
    if (data.footer?.text) overflow = true;
    const height = Math.min(MAX_HEIGHT, Math.max(240, y + 68));
    const footer = overflow ? 'Full details in weather-details.txt' : 'Weather data • OpenWeather / optional feeds';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}">
<defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#182b47"/><stop offset="1" stop-color="#101927"/></linearGradient></defs>
<rect width="720" height="${height}" rx="20" fill="url(#bg)"/>
<path d="M32 24h32" stroke="#73d9e9" stroke-width="4" stroke-linecap="round"/>
<g font-family="DejaVu Sans, Arial, sans-serif">${textLines([MODES[mode] || MODES.normal], 76, 30, 13, '#9bb1ce', 700)}${body}
${textLines([footer], 32, height - 24, 14, '#a9bad1')}</g></svg>`;
    return { svg, fullText, overflow, height };
}

let activeRenders = 0;
async function getWeatherImage(embed, mode) {
    // Bound native memory usage during bursts; the command falls back to embeds.
    if (activeRenders >= 2) throw new Error('Weather image renderer is busy');
    activeRenders++;
    try {
        const { svg, fullText, overflow } = buildWeatherSvg(embed, mode);
        const buffer = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
        if (buffer.length > 1024 * 1024) throw new Error('Weather image exceeded size budget');
        const files = [new AttachmentBuilder(buffer, { name: `weather-${mode || 'normal'}.png`, description: fullText.slice(0, 1000) })];
        if (overflow) files.push(new AttachmentBuilder(Buffer.from(fullText), { name: 'weather-details.txt' }));
        return { files };
    }
    finally {
        activeRenders--;
    }
}

module.exports = { getWeatherImage, buildWeatherSvg };

