function hourlyTemperatures(weather) {
    const anchor = Number.isFinite(weather?.current?.dt) ? weather.current.dt : Date.now() / 1000;
    const start = Math.floor(anchor / 3600) * 3600;
    const seen = new Set();
    return (Array.isArray(weather?.hourly) ? weather.hourly : []).filter(hour => {
        if (!Number.isFinite(hour?.dt) || hour.dt < start || hour.dt > start + 12 * 3600 || seen.has(hour.dt)) return false;
        seen.add(hour.dt);
        return true;
    }).sort((a, b) => a.dt - b.dt).slice(0, 13);
}

function drawHourly(weather, top) {
    const hours = hourlyTemperatures(weather);
    const values = hours.map(hour => hour.temp).filter(Number.isFinite);
    if (hours.length < 2 || !values.length) return null;
    const minimum = Math.floor(Math.min(...values)) - 1;
    const maximum = Math.ceil(Math.max(...values)) + 1;
    const start = hours[0].dt;
    const end = hours[hours.length - 1].dt;
    const x = time => 88 + (time - start) / (end - start) * 544;
    const y = value => 97 - (value - minimum) / (maximum - minimum) * 52;
    const validChance = value => Number.isFinite(value) && value >= 0 && value <= 1;
    const hasChance = hours.some(hour => validChance(hour.pop));
    const offset = Number.isFinite(weather.timezone_offset) ? weather.timezone_offset : 0;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="136" rx="14" fill="#202e46"/>
<text x="42" y="26" fill="#ffad9b" font-size="16" font-weight="600">Hourly temperature · °C${Number.isFinite(weather.timezone_offset) ? '' : ' · UTC'}</text>
${hasChance ? '<rect x="370" y="16" width="10" height="11" rx="2" fill="#8cd9ee" opacity="0.65"/><text x="388" y="26" fill="#8cd9ee" font-size="12">Precip. chance</text>' : ''}
<text x="650" y="26" text-anchor="end" fill="#ffad9b" font-size="13">${Number(Math.min(...values).toFixed(1))}° – ${Number(Math.max(...values).toFixed(1))}°</text>`;
    for (const value of [minimum, maximum]) {
        svg += `<path d="M76 ${y(value)}H646" stroke="#40506a" stroke-dasharray="3 5"/><text x="65" y="${y(value) + 4}" text-anchor="end" fill="#ffad9b" font-size="12">${value}°</text>`;
    }
    if (hasChance) {
        for (const [value, label] of [[0, '0%'], [0.5, '50%'], [1, '100%']]) {
            svg += `<text x="678" y="${101 - value * 52}" text-anchor="end" fill="#8cd9ee" font-size="10">${label}</text>`;
        }
        hours.forEach(hour => {
            if (validChance(hour.pop)) {
                const height = hour.pop * 52;
                svg += `<rect data-series="precipitation" data-probability="${hour.pop}" x="${x(hour.dt) - 9}" y="${97 - height}" width="18" height="${height}" rx="2" fill="#8cd9ee" opacity="0.4"/>`;
            }
            else {
                svg += `<text x="${x(hour.dt)}" y="96" text-anchor="middle" fill="#a9bad1" font-size="10">?</text>`;
            }
        });
    }
    let segment = [];
    const flush = () => {
        if (!segment.length) return;
        const path = segment.map((hour, index) => `${index ? 'L' : 'M'}${x(hour.dt)} ${y(hour.temp)}`).join(' ');
        svg += `<path d="${path}L${x(segment[segment.length - 1].dt)} 97L${x(segment[0].dt)} 97Z" fill="#8cd9ee" opacity="0.08"/><path data-series="hourly" d="${path}" fill="none" stroke="#ffad9b" stroke-width="2.5" stroke-linejoin="round"/>`;
        segment = [];
    };
    hours.forEach((hour, index) => {
        if (index && hour.dt - hours[index - 1].dt > 3600) flush();
        if (Number.isFinite(hour.temp)) {
            segment.push(hour);
            svg += `<circle cx="${x(hour.dt)}" cy="${y(hour.temp)}" r="2.5" fill="#ffad9b"/>`;
        }
        else { flush(); }
    });
    flush();
    const labelIndices = [0];
    for (let index = 1; index < hours.length - 1; index++) {
        if (x(hours[index].dt) - x(hours[labelIndices[labelIndices.length - 1]].dt) >= 90 && x(end) - x(hours[index].dt) >= 90) labelIndices.push(index);
    }
    labelIndices.push(hours.length - 1);
    labelIndices.forEach(index => {
        const hour = hours[index];
        const label = new Date((hour.dt + offset) * 1000).toISOString().slice(11, 16);
        svg += `<text x="${x(hour.dt)}" y="122" text-anchor="middle" fill="#a9bad1" font-size="12">${label}</text>`;
    });
    svg += '</g>';
    return { svg, height: 146, summary: `Hourly temperatures${hasChance ? ' and precipitation chance' : ''}: ${hours.map(hour => `${new Date((hour.dt + offset) * 1000).toISOString().slice(11, 16)} ${Number.isFinite(hour.temp) ? hour.temp + '°C' : 'unavailable'}${hasChance ? ` / ${validChance(hour.pop) ? Math.round(hour.pop * 100) + '%' : 'precipitation unavailable'}` : ''}`).join(', ')}` };
}

module.exports = { hourlyTemperatures, drawHourly };
