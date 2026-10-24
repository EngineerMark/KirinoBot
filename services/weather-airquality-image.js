// OpenWeather concentration bands (µg/m³), inclusive lower boundaries:
// https://openweathermap.org/api/air-pollution
const BANDS = {
    pm2_5: [10, 25, 50, 75], pm10: [20, 50, 100, 200],
    no2: [40, 70, 150, 200], o3: [60, 100, 140, 180],
    so2: [20, 80, 250, 350], co: [4400, 9400, 12400, 15400],
};
const LABELS = ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor'];
const COLORS = ['#85d8ca', '#8cd9ee', '#f2cf7a', '#ffad78', '#ff889c'];
const NAMES = { pm2_5: 'PM2.5', pm10: 'PM10', no2: 'NO₂', o3: 'O₃', so2: 'SO₂', co: 'CO' };
const valid = value => Number.isFinite(value) && value >= 0;
const concentration = value => valid(value) ? `${Number(value.toFixed(1))} µg/m³` : 'Unavailable';

function pollutantRating(key, value) {
    return BANDS[key] && valid(value) ? BANDS[key].filter(limit => value >= limit).length + 1 : null;
}

function drawAirQuality(data, top) {
    const entry = data?.list?.[0];
    const aqi = entry?.main?.aqi;
    if (!Number.isInteger(aqi) || aqi < 1 || aqi > 5) return null;
    const components = entry.components || {};
    const color = COLORS[aqi - 1];
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="142" rx="14" fill="#202e46"/>
<text x="42" y="31" fill="#a9bad1" font-size="16">Overall air quality · OpenWeather 1–5</text>
<text x="42" y="70" fill="${color}" font-size="30" font-weight="700">${LABELS[aqi - 1]} · ${aqi}/5</text>`;
    LABELS.forEach((label, index) => {
        const x = 42 + index * 128;
        svg += `<rect x="${x}" y="88" width="116" height="36" rx="9" fill="${index === aqi - 1 ? COLORS[index] : '#101e32'}" stroke="${COLORS[index]}" stroke-opacity="${index === aqi - 1 ? 1 : 0.3}"/>
<text x="${x + 58}" y="111" text-anchor="middle" font-size="13" font-weight="600" fill="${index === aqi - 1 ? '#101e32' : COLORS[index]}">${index + 1} ${label}</text>`;
    });
    svg += `<rect x="24" y="154" width="672" height="448" rx="14" fill="#202e46"/>
<text x="42" y="184" fill="#f0f4fc" font-size="18" font-weight="600">Pollutant severity</text>
<text x="42" y="209" fill="#a9bad1" font-size="13">Each pollutant uses its own concentration bands.</text>
<g text-anchor="middle"><text x="332" y="235" fill="#a9bad1" font-size="12">1</text><text x="382" y="235" fill="#a9bad1" font-size="12">2</text><text x="432" y="235" fill="#a9bad1" font-size="12">3</text><text x="482" y="235" fill="#a9bad1" font-size="12">4</text><text x="532" y="235" fill="#a9bad1" font-size="12">5</text></g>`;
    const summary = [`OpenWeather AQI: ${aqi}/5, ${LABELS[aqi - 1]}`];
    Object.keys(BANDS).forEach((key, index) => {
        const value = components[key];
        const rating = pollutantRating(key, value);
        const y = 265 + index * 48;
        const label = rating ? LABELS[rating - 1] : 'Unavailable';
        const rowColor = rating ? COLORS[rating - 1] : '#a9bad1';
        svg += `<text x="42" y="${y}" fill="#f0f4fc" font-size="17" font-weight="600">${NAMES[key]}</text>
<text x="126" y="${y}" fill="#a9bad1" font-size="14">${concentration(value)}</text>`;
        for (let segment = 0; segment < 5; segment++) {
            svg += `<rect x="${310 + segment * 50}" y="${y - 15}" width="44" height="20" rx="5" fill="${rating && segment < rating ? rowColor : '#101e32'}"/>`;
        }
        svg += `<text x="570" y="${y}" fill="${rowColor}" font-size="14">${label}</text>`;
        summary.push(`${NAMES[key]}: ${concentration(value)}, ${rating ? `${rating}/5 ${label}` : label}`);
    });
    svg += `<path d="M42 534H678" stroke="#40506a"/>
<text x="42" y="559" fill="#a9bad1" font-size="13">Additional readings · not rated on this scale</text>
<text x="42" y="584" fill="#f0f4fc" font-size="15">NO: ${concentration(components.no)}</text>
<text x="350" y="584" fill="#f0f4fc" font-size="15">NH₃: ${concentration(components.nh3)}</text></g>`;
    return { svg, height: 612, summary: summary.join('\n') };
}

module.exports = { drawAirQuality, pollutantRating, BANDS };
