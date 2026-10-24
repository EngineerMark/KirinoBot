const { daylightData, duration } = require('./weather-outlook-data');

function drawDaylight(weather, x, y, width = 292) {
    const day = daylightData(weather);
    if (!day) return `<text x="${x}" y="${y + 26}" font-size="12" fill="#a9bad1">Daylight unavailable</text>`;
    const position = time => Math.max(0, Math.min(width, (time - day.start) / 86400 * width));
    const rise = position(day.sunrise);
    const set = position(day.sunset);
    return `<g transform="translate(${x} ${y})">
<rect width="${width}" height="6" rx="3" fill="#101e32"/>
<rect data-series="daylight" x="${rise}" width="${set - rise}" height="6" rx="3" fill="#f2cf7a"/>
<path d="M${position(day.at)} -3v12" stroke="#f0f4fc" stroke-width="2"/>
<text y="23" fill="#f2cf7a" font-size="12">↑ ${day.sunriseLabel}${day.timezone === 'UTC' ? ' UTC' : ''}</text>
<text x="${width}" y="23" text-anchor="end" fill="#f2cf7a" font-size="12">↓ ${day.sunsetLabel}</text>
<text x="${width / 2}" y="43" text-anchor="middle" fill="#a9bad1" font-size="11">${duration(day.length)} daylight · ${day.status}</text></g>`;
}

module.exports = { drawDaylight };
