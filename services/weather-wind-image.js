const { upcomingHours, nightRanges } = require('./weather-outlook-data');

function drawWindForecast(weather, top) {
    const hours = upcomingHours(weather);
    const valid = value => Number.isFinite(value) && value >= 0;
    const values = hours.flatMap(hour => [hour.wind_speed, hour.wind_gust]).filter(valid).map(value => value * 3.6);
    if (hours.length < 2 || !values.length) return null;
    const maximum = Math.ceil(Math.max(5, ...values) / 15) * 15;
    const start = hours[0].dt;
    const end = hours[hours.length - 1].dt;
    const x = time => 88 + (time - start) / (end - start) * 544;
    const y = value => 108 - value * 3.6 / maximum * 60;
    const offset = Number.isFinite(weather.timezone_offset) ? weather.timezone_offset : 0;
    const hasWind = hours.some(hour => valid(hour.wind_speed));
    const hasGust = hours.some(hour => valid(hour.wind_gust));
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="172" rx="14" fill="#202e46"/>
<text x="42" y="27" fill="#f0f4fc" font-size="16" font-weight="600">Wind &amp; gusts · km/h${Number.isFinite(weather.timezone_offset) ? '' : ' · UTC'}</text>
<path d="M360 22h22" stroke="#8cd9ee" stroke-width="2.5"/><text x="390" y="27" fill="#8cd9ee" font-size="12">${hasWind ? 'Wind' : 'Wind —'}</text>
<path d="M480 22h22" stroke="#ffad9b" stroke-width="2.5" stroke-dasharray="4 3"/><text x="510" y="27" fill="#ffad9b" font-size="12">${hasGust ? 'Gusts' : 'Gusts unavailable'}</text>`;
    for (const [from, to] of nightRanges(weather, start, end)) {
        svg += `<rect data-series="night" x="${x(from)}" y="48" width="${x(to) - x(from)}" height="60" fill="#0a1320" opacity="0.55"/>`;
    }
    for (let tick = 0; tick <= 3; tick++) {
        const speed = maximum * tick / 3;
        const topY = 108 - tick * 20;
        svg += `<path d="M76 ${topY}H646" stroke="#40506a" stroke-dasharray="3 5"/><text x="65" y="${topY + 4}" fill="#a9bad1" font-size="12" text-anchor="end">${speed}</text>`;
    }
    for (const [key, color, dash] of [['wind_speed', '#8cd9ee', ''], ['wind_gust', '#ffad9b', '4 3']]) {
        let path = '';
        let previous = false;
        hours.forEach((hour, index) => {
            if (!valid(hour[key])) {
                previous = false;
                return;
            }
            const adjacent = !index || hour.dt - hours[index - 1].dt <= 3600;
            path += `${previous && adjacent ? 'L' : 'M'}${x(hour.dt)} ${y(hour[key])} `;
            svg += `<circle cx="${x(hour.dt)}" cy="${y(hour[key])}" r="2" fill="${color}"/>`;
            previous = true;
        });
        svg += `<path data-series="${key}" d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${dash}" stroke-linejoin="round"/>`;
    }
    const indices = [0];
    for (let index = 1; index < hours.length - 1; index++) {
        if (x(hours[index].dt) - x(hours[indices[indices.length - 1]].dt) >= 110 && x(end) - x(hours[index].dt) >= 110) indices.push(index);
    }
    indices.push(hours.length - 1);
    svg += '<text x="42" y="158" fill="#a9bad1" font-size="10">From</text>';
    indices.forEach(index => {
        const hour = hours[index];
        const label = new Date((hour.dt + offset) * 1000).toISOString().slice(11, 16);
        svg += `<text x="${x(hour.dt)}" y="132" fill="#a9bad1" font-size="12" text-anchor="middle">${label}</text>`;
        if (Number.isFinite(hour.wind_deg) && hour.wind_deg >= 0 && hour.wind_deg <= 360) {
            svg += `<g transform="translate(${x(hour.dt)} 153) rotate(${hour.wind_deg})"><path d="M0 7V-7m-4 4 4-4 4 4" fill="none" stroke="#8cd9ee" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></g>`;
        }
        else {
            svg += `<text x="${x(hour.dt)}" y="157" fill="#a9bad1" font-size="11" text-anchor="middle">?</text>`;
        }
    });
    svg += '</g>';
    return { svg, height: 180 };
}

module.exports = { drawWindForecast };
