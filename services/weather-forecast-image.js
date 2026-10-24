const { weatherVisual, drawIcon } = require('./weather-visuals');
const { temperatureScale } = require('./weather-image-layout');
const { drawWindForecast } = require('./weather-wind-image');

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
    const wind = drawWindForecast(weather, 0);
    if (!days.length) return wind ? { ...wind, svg: `<g transform="translate(0 ${top})">${wind.svg}</g>`, overflow: false } : null;
    const chartHeight = wind ? Math.max(210, Math.min(238, availableHeight - wind.height - 16 - days.length * 52)) : 280;
    const plotBottom = chartHeight - 68;
    const plotHeight = plotBottom - 70;
    const values = days.flatMap(day => [day.temp?.min, day.temp?.max]).filter(Number.isFinite);
    const { minimum: bottom, maximum: ceiling, ticks } = temperatureScale(values);
    const x = index => days.length === 1 ? 364 : 90 + (days[index].dt - days[0].dt) * 540 / (days[days.length - 1].dt - days[0].dt);
    const y = value => plotBottom - (value - bottom) / (ceiling - bottom) * plotHeight;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="${chartHeight}" rx="14" fill="#202e46"/>
<text x="42" y="30" fill="#f0f4fc" font-size="18" font-weight="600">Daily temperature · °C</text>
<path d="M446 25h22" stroke="${HIGH}" stroke-width="3"/><text x="476" y="30" fill="${HIGH}" font-size="14">High</text>
<path d="M548 25h22" stroke="${LOW}" stroke-width="3"/><text x="578" y="30" fill="${LOW}" font-size="14">Low</text>`;
    for (const value of ticks) {
        svg += `<path d="M76 ${y(value)}H660" stroke="#40506a" stroke-dasharray="3 5"/><text x="65" y="${y(value) + 5}" fill="#a9bad1" font-size="13" text-anchor="end">${Number(value.toFixed(1))}°</text>`;
    }
    for (let index = 1; index < days.length; index++) {
        const first = days[index - 1].temp;
        const second = days[index].temp;
        if (days[index].dt - days[index - 1].dt <= 36 * 3600 && [first?.min, first?.max, second?.min, second?.max].every(Number.isFinite)) {
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
            const adjacent = !index || days[index].dt - days[index - 1].dt <= 36 * 3600;
            path += `${previous && adjacent ? 'L' : 'M'}${x(index)} ${y(value)} `;
            previous = true;
            svg += `<circle cx="${x(index)}" cy="${y(value)}" r="4" fill="${color}" stroke="#202e46" stroke-width="2"/>`;
        }
        svg += `<path data-series="${key}" d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>`;
    }
    days.forEach((day, index) => {
        svg += `<text x="${x(index)}" y="${plotBottom + 28}" fill="#f0f4fc" font-size="14" text-anchor="middle">${day.weekday}</text><text x="${x(index)}" y="${plotBottom + 48}" fill="#a9bad1" font-size="12" text-anchor="middle">${day.shortDate}</text>`;
    });
    svg += '</g>';
    if (wind) svg += `<g transform="translate(0 ${top + chartHeight + 8})">${wind.svg}</g>`;
    const graphsHeight = chartHeight + (wind ? wind.height + 8 : 0);
    const rowHeight = wind ? 52 : 58;
    const rows = days.slice(0, Math.max(0, Math.floor((availableHeight - graphsHeight - 8) / rowHeight)));
    rows.forEach((day, index) => {
        const rowTop = top + graphsHeight + 8 + index * rowHeight;
        const icon = weatherVisual({ name: day.date }, { weather }, 'forecast').icon;
        const rain = Number.isFinite(day.pop) && day.pop >= 0 && day.pop <= 1 ? `${Math.round(day.pop * 100)}%` : '—';
        svg += `<g transform="translate(0 ${rowTop})"><rect x="24" width="672" height="${rowHeight - 6}" rx="14" fill="#202e46"/>
${drawIcon(icon, 42, 15)}<text x="80" y="31" fill="#f0f4fc" font-size="17">${day.weekday} ${day.shortDate}</text>
<text x="254" y="31" fill="${LOW}" font-size="17">${number(day.temp?.min)}</text><text x="334" y="31" fill="${HIGH}" font-size="17">${number(day.temp?.max)}</text>
${drawIcon('drop', 438, 17, LOW, 18)}<text x="466" y="31" fill="#a9bad1" font-size="15">${rain} precip. chance</text></g>`;
    });
    if (!values.length) svg += `<text x="368" y="${top + (70 + plotBottom) / 2}" text-anchor="middle" fill="#f9cc83" font-size="18">Temperature data unavailable</text>`;
    return { svg, height: graphsHeight + 8 + rows.length * rowHeight, overflow: rows.length < days.length };
}

module.exports = { drawForecast, forecastDays };
