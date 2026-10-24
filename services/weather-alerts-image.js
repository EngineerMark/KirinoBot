const { drawIcon } = require('./weather-visuals');

function alertSeverity(event = '') {
    // Use only explicit labels in the event title, never infer danger from the hazard.
    for (const [word, color] of [['red', '#ff889c'], ['orange', '#ffad78'], ['yellow', '#f2cf7a']]) {
        const match = event.match(new RegExp(`\\b${word}\\s+(?:weather\\s+)?(warning|alert)\\b`, 'i'));
        if (match) return { label: `${word[0].toUpperCase() + word.slice(1)} ${match[1].toLowerCase()}`, color };
    }
    for (const [label, color] of [['Warning', '#ffad78'], ['Watch', '#f2cf7a'], ['Advisory', '#8cd9ee']]) {
        if (new RegExp(`\\b${label}\\b`, 'i').test(event)) return { label, color };
    }
    return { label: 'Unspecified', color: '#a9bad1' };
}

function alertIcon(alert) {
    const text = [alert.event, ...(Array.isArray(alert.tags) ? alert.tags : [])].join(' ');
    if (/tornado|waterspout/i.test(text)) return 'tornado';
    if (/thunder|lightning/i.test(text)) return 'lightning';
    if (/flood|coastal|surge/i.test(text)) return 'flood';
    if (/snow|ice|icing|blizzard|frost|freez/i.test(text)) return 'snow';
    if (/fire|smoke/i.test(text)) return 'fire';
    if (/wind|gale|hurricane|cyclone/i.test(text)) return 'wind';
    if (/rain/i.test(text)) return 'rain';
    if (/heat|cold|temperature/i.test(text)) return 'temperature';
    if (/fog|mist|dust/i.test(text)) return 'air';
    return 'alert';
}

function alertStatus(alert, now = Date.now()) {
    if (!Number.isFinite(alert.start) || !Number.isFinite(alert.end) || alert.end < alert.start) return 'Timing unknown';
    if (now > alert.end * 1000) return 'Expired';
    if (now < alert.start * 1000) return 'Upcoming';
    return 'Active';
}

function drawAlerts(weather, top, availableHeight, { wrap, textLines }, now = Date.now()) {
    if (!weather) return null;
    const alerts = Array.isArray(weather.alerts) ? weather.alerts : [];
    const limit = Math.max(1, Math.min(3, Math.floor((availableHeight - 44) / 280)));
    const shown = alerts.slice(0, limit);
    const summary = [];
    let svg = '';
    let height = 0;
    if (!alerts.length) {
        const missing = weather.alerts === null || weather.invalidAlerts > 0;
        const label = missing ? 'Alert status unavailable' : 'No weather alerts reported';
        svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="108" rx="14" fill="#202e46"/>${drawIcon(missing ? 'alert' : 'shield', 44, 30, missing ? '#f2cf7a' : '#85d8ca', 36)}${textLines([label], 100, 61, 22, '#f0f4fc', 600)}</g>`;
        return { svg, height: 120, summary: label };
    }
    svg += textLines([shown.length < alerts.length ? `Showing ${shown.length} of ${alerts.length} alerts` : `${alerts.length} weather ${alerts.length === 1 ? 'alert' : 'alerts'}`], 32, top + 23, 16, '#a9bad1');
    height = 42;
    const offset = Number.isFinite(weather.timezone_offset) ? weather.timezone_offset : 0;
    const time = value => Number.isFinite(value) ? new Date((value + offset) * 1000).toISOString().slice(5, 16).replace('T', ' ') : 'Unknown';
    const timezone = Number.isFinite(weather.timezone_offset) ? 'local' : 'UTC';
    const clipped = (value, columns, count) => {
        const lines = wrap(value, columns);
        const result = lines.slice(0, count);
        if (lines.length > count) result[count - 1] = result[count - 1].slice(0, columns - 3) + '...';
        return result;
    };
    shown.forEach(alert => {
        const severity = alertSeverity(alert.event);
        const status = alertStatus(alert, now);
        const title = clipped(alert.event, 43, 2);
        const description = clipped(alert.description, 60, 3);
        const source = clipped(alert.sender_name || 'Source unavailable', 65, 1);
        const cardHeight = 148 + title.length * 28 + description.length * 25;
        const y = top + height;
        svg += `<g transform="translate(0 ${y})"><rect x="24" width="672" height="${cardHeight - 10}" rx="14" fill="#202e46"/>
<rect x="24" y="16" width="4" height="${cardHeight - 42}" rx="2" fill="${severity.color}"/>
${drawIcon(alertIcon(alert), 43, 18, severity.color, 30)}
<rect x="88" y="18" width="180" height="28" rx="14" fill="#101e32"/>
${textLines([severity.label], 102, 38, 15, severity.color, 600)}${textLines([status], 528, 38, 14, '#a9bad1')}
${textLines(title, 44, 80, 21, '#f0f4fc', 600)}
${textLines([`${time(alert.start)} → ${time(alert.end)} (${timezone})`], 44, 80 + title.length * 28, 14, '#8cd9ee')}
${textLines(source, 44, 102 + title.length * 28, 13, '#a9bad1')}
${textLines(description, 44, 134 + title.length * 28, 17, '#f0f4fc')}</g>`;
        height += cardHeight;
        summary.push(`${alert.event}: ${severity.label}, ${status}`);
    });
    return { svg, height, summary: summary.join('\n') };
}

module.exports = { drawAlerts, alertSeverity, alertStatus, alertIcon };
