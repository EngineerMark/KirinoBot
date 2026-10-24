const { weatherVisual, drawIcon } = require('./weather-visuals');

const HIGH = '#ffad9b';
const LOW = '#8cd9ee';
const number = value => Number.isFinite(value) ? `${Number(value.toFixed(1))}°` : '—';

function forecastDays(weather) {
    const offset = Number.isFinite(weather?.timezone_offset) ? weather.timezone_offset : 0;
    return (weather?.daily || []).slice(1, 8).filter(day => Number.isFinite(day?.dt)).map(day => {
        const date = new Date((day.dt + offset) * 1000);
        return { ...day, date: date.toISOString().slice(0, 10), weekday: date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }), shortDate: `${date.getUTCDate()}/${date.getUTCMonth() + 1}` };
    });
}

function drawForecast(weather, top, availableHeight) {
    const days = forecastDays(weather);
    if (!days.length) return null;
    const chartHeight = 280;
    const values = days.flatMap(day => [day.temp?.min, day.temp?.max]).filter(Number.isFinite);
    const bottom = values.length ? Math.floor(Math.min(...values) / 5) * 5 - 5 : 0;
    const ceiling = values.length ? Math.ceil(Math.max(...values) / 5) * 5 + 5 : 10;
    const x = index => days.length === 1 ? 364 : 90 + index * 540 / (days.length - 1);
    const y = value => 210 - (value - bottom) / (ceiling - bottom) * 140;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="${chartHeight}" rx="14" fill="#202e46"/>
<text x="42" y="30" fill="#f0f4fc" font-size="18" font-weight="600">Daily temperature · °C</text>
<path d="M446 25h22" stroke="${HIGH}" stroke-width="3"/><text x="476" y="30" fill="${HIGH}" font-size="14">High</text>
<path d="M548 25h22" stroke="${LOW}" stroke-width="3"/><text x="578" y="30" fill="${LOW}" font-size="14">Low</text>`;
    for (let tick = 0; tick <= 4; tick++) {
        const value = bottom + (ceiling - bottom) * tick / 4;
        svg += `<path d="M76 ${y(value)}H660" stroke="#40506a" stroke-dasharray="3 5"/><text x="65" y="${y(value) + 5}" fill="#a9bad1" font-size="13" text-anchor="end">${Number(value.toFixed(1))}°</text>`;
    }
    for (let index = 1; index < days.length; index++) {
        const first = days[index - 1].temp;
        const second = days[index].temp;
        if ([first?.min, first?.max, second?.min, second?.max].every(Number.isFinite)) {
            svg += `<path d="M${x(index - 1)} ${y(first.max)}L${x(index)} ${y(second.max)}L${x(index)} ${y(second.min)}L${x(index - 1)} ${y(first.min)}Z" fill="#8cd9ee" opacity="0.07"/>`;
        }
    }
    for (const [key, color] of [['max', HIGH], ['min', LOW]]) {
        let path = '';
        let previous = false;
        for (let index = 0; index < days.length; index++) {
            const value = days[index].temp?.[key];
            if (!Number.isFinite(value)) {
                previous = false;
                continue;
            }
            path += `${previous ? 'L' : 'M'}${x(index)} ${y(value)} `;
            previous = true;
            svg += `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="${color}" stroke="#202e46" stroke-width="2"/>`;
        }
        svg += `<path data-series="${key}" d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    days.forEach((day, index) => {
        svg += `<text x="${x(index)}" y="238" fill="#f0f4fc" font-size="14" text-anchor="middle">${day.weekday}</text><text x="${x(index)}" y="258" fill="#a9bad1" font-size="12" text-anchor="middle">${day.shortDate}</text>`;
    });
    svg += '</g>';
    const rowHeight = 58;
    const rows = days.slice(0, Math.max(0, Math.floor((availableHeight - chartHeight - 10) / rowHeight)));
    rows.forEach((day, index) => {
        const rowTop = top + chartHeight + 10 + index * rowHeight;
        const icon = weatherVisual({ name: day.date }, { weather }, 'forecast').icon;
        const rain = Number.isFinite(day.pop) && day.pop >= 0 && day.pop <= 1 ? `${Math.round(day.pop * 100)}%` : '—';
        svg += `<g transform="translate(0 ${rowTop})"><rect x="24" width="672" height="52" rx="12" fill="#202e46"/>
${drawIcon(icon, 42, 15)}<text x="80" y="31" fill="#f0f4fc" font-size="17">${day.weekday} ${day.shortDate}</text>
<text x="254" y="31" fill="${LOW}" font-size="17">${number(day.temp?.min)}</text><text x="334" y="31" fill="${HIGH}" font-size="17">${number(day.temp?.max)}</text>
${drawIcon('drop', 438, 17, LOW, 18)}<text x="466" y="31" fill="#a9bad1" font-size="15">${rain} precip. chance</text></g>`;
    });
    if (!values.length) svg += `<text x="368" y="${top + 140}" text-anchor="middle" fill="#f9cc83" font-size="18">Temperature data unavailable</text>`;
    return { svg, height: chartHeight + 10 + rows.length * rowHeight, overflow: rows.length < days.length };
}

module.exports = { drawForecast, forecastDays };
