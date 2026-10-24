const COLORS = ['#85d8ca', '#8cd9ee', '#f2cf7a', '#ffad78', '#ff889c'];

function drawAirQualityForecast(data, top, offset, height = 190, now = Date.now()) {
    const start = Math.floor(now / 3600000) * 3600;
    const end = start + 24 * 3600;
    const entries = new Map();
    for (const item of Array.isArray(data?.list) ? data.list : []) {
        if (!Number.isFinite(item?.dt) || item.dt < start || item.dt > end) continue;
        if (!entries.has(item.dt)) entries.set(item.dt, item);
    }
    const hours = Array.from(entries.values()).sort((a, b) => a.dt - b.dt);
    const valid = item => Number.isInteger(item?.main?.aqi) && item.main.aqi >= 1 && item.main.aqi <= 5;
    if (!hours.some(valid)) return null;
    const x = time => 88 + (time - start) / (end - start) * 544;
    const plotTop = 49;
    const plotBottom = height - 30;
    const y = value => plotBottom - (value - 0.5) / 5 * (plotBottom - plotTop);
    const timezone = Number.isFinite(offset) ? offset : 0;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="${height}" rx="14" fill="#202e46"/>
<text x="42" y="28" fill="#f0f4fc" font-size="16" font-weight="600">AQI forecast · next 24h</text>
<text x="678" y="28" text-anchor="end" fill="#a9bad1" font-size="12">1 good → 5 very poor${Number.isFinite(offset) ? '' : ' · UTC'}</text>`;
    for (let level = 1; level <= 5; level++) {
        svg += `<rect x="76" y="${y(level + 0.5)}" width="570" height="${(plotBottom - plotTop) / 5}" fill="${COLORS[level - 1]}" opacity="0.06"/>
<path d="M76 ${y(level)}H646" stroke="#40506a" stroke-dasharray="3 5"/>
<text x="65" y="${y(level) + 4}" fill="${COLORS[level - 1]}" font-size="12" text-anchor="end">${level}</text>`;
    }
    let path = '';
    let previous = null;
    for (const hour of hours) {
        if (!valid(hour)) {
            previous = null;
            continue;
        }
        path += previous && hour.dt - previous.dt <= 3600 ? `H${x(hour.dt)}V${y(hour.main.aqi)} ` : `M${x(hour.dt)} ${y(hour.main.aqi)} `;
        previous = hour;
    }
    svg += `<path data-series="aqi-forecast" d="${path}" fill="none" stroke="#d5e6f5" stroke-width="2" stroke-linejoin="round"/>`;
    for (const hour of hours.filter(valid)) {
        svg += `<circle cx="${x(hour.dt)}" cy="${y(hour.main.aqi)}" r="3" fill="${COLORS[hour.main.aqi - 1]}" stroke="#202e46" stroke-width="1"/>`;
    }
    for (const hour of [0, 6, 12, 18, 24]) {
        const time = start + hour * 3600;
        const date = new Date((time + timezone) * 1000);
        const nextDay = Math.floor((time + timezone) / 86400) > Math.floor((start + timezone) / 86400);
        const label = date.toISOString().slice(11, 16) + (nextDay ? ' +1d' : '');
        svg += `<text x="${x(time)}" y="${height - 10}" fill="#a9bad1" font-size="11" text-anchor="middle">${label}</text>`;
    }
    svg += '</g>';
    const values = hours.filter(valid).map(hour => hour.main.aqi);
    return { svg, height, summary: `Next 24h OpenWeather AQI forecast: ${Math.min(...values)}–${Math.max(...values)} on the 1–5 scale.` };
}

module.exports = { drawAirQualityForecast };
