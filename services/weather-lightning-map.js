const Coords = require('../types/Coords');

const RADIUS_KM = 100;
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
const AGE_BANDS = [
    { minutes: 15, label: '0–15 min', color: '#ffad9b' },
    { minutes: 30, label: '15–30 min', color: '#f2cf7a' },
    { minutes: 60, label: '30–60 min', color: '#8cd9ee' },
    { minutes: 120, label: '60–120 min', color: '#738bb5' },
];
const coordinates = value => Number.isFinite(value?.lat) && Math.abs(value.lat) <= 90 && Number.isFinite(value?.lon) && Math.abs(value.lon) <= 180;

function projectStrikes(lightning, location, now = Date.now()) {
    if (!Array.isArray(lightning?.strikes) || !coordinates(location)) return null;
    const points = [];
    for (const strike of lightning.strikes) {
        const age = now - (strike.time instanceof Date ? strike.time.getTime() : NaN);
        if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS || !coordinates(strike.coord)) continue;
        const distance = Coords.Distance(location, strike.coord);
        if (!Number.isFinite(distance) || distance > RADIUS_KM) continue;
        const bearing = Coords.Bearing(location, strike.coord) * Math.PI / 180;
        const band = AGE_BANDS.findIndex(item => age <= item.minutes * 60000);
        points.push({ distance, age, band, x: Math.sin(bearing) * distance / RADIUS_KM, y: -Math.cos(bearing) * distance / RADIUS_KM });
    }
    // Older dots first so a recent strike remains visible in a dense cluster.
    return points.sort((a, b) => b.age - a.age);
}

function drawLightningMap(lightning, location, top, now = Date.now()) {
    const points = projectStrikes(lightning, location, now);
    if (!points) return null;
    const cx = 202;
    const cy = 176;
    const radius = 112;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="320" rx="14" fill="#202e46"/>
<text x="42" y="29" fill="#f0f4fc" font-size="18" font-weight="600">Strike positions · last 2 hours</text>
<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#101e32"/>
<path d="M${cx - radius} ${cy}H${cx + radius}M${cx} ${cy - radius}V${cy + radius}" stroke="#35445e" stroke-dasharray="3 5"/>`;
    for (const distance of [25, 50, 100]) {
        svg += `<circle cx="${cx}" cy="${cy}" r="${radius * distance / RADIUS_KM}" fill="none" stroke="#53647d" stroke-opacity="0.8"/>`;
    }
    // Group vector dots by age to keep large feeds compact without sampling points.
    for (let band = AGE_BANDS.length - 1; band >= 0; band--) {
        const commands = points.filter(point => point.band === band).map(point => {
            const x = (cx + point.x * radius).toFixed(2);
            const y = (cy + point.y * radius).toFixed(2);
            return `M${x} ${y}h0.01`;
        }).join(' ');
        svg += `<path data-age-band="${band}" d="${commands}" fill="none" stroke="${AGE_BANDS[band].color}" stroke-width="4" stroke-linecap="round"/>`;
    }
    svg += `<g fill="#a9bad1" font-size="13" text-anchor="middle"><text x="${cx}" y="53">N</text><text x="${cx}" y="308">S</text><text x="73" y="181">W</text><text x="331" y="181">E</text></g>
<path d="M${cx - 7} ${cy}h14M${cx} ${cy - 7}v14" stroke="#f0f4fc" stroke-width="2"/>
<circle cx="${cx}" cy="${cy}" r="3" fill="#f0f4fc" stroke="#101e32" stroke-width="1"/>
<text x="380" y="61" fill="#a9bad1" font-size="14">Strike age</text>`;
    AGE_BANDS.forEach((band, index) => {
        const y = 87 + index * 27;
        svg += `<circle cx="387" cy="${y - 4}" r="4" fill="${band.color}"/><text x="404" y="${y}" fill="${band.color}" font-size="14">${band.label}</text>`;
    });
    const nearest = points.reduce((closest, point) => !closest || point.distance <= closest.distance ? point : closest, null);
    svg += `<text x="380" y="207" fill="#f0f4fc" font-size="16" font-weight="600">${points.length} strikes plotted</text>
<text x="380" y="231" fill="#a9bad1" font-size="14">Nearest: ${nearest === null ? '—' : nearest.distance.toFixed(1) + ' km · ' + Math.floor(nearest.age / 60000) + 'm ago'}</text>`;
    [[5, 10], [25, 50], [100]].forEach((ranges, index) => {
        const counts = ranges.map(distance => `≤${distance} km: ${points.filter(point => point.distance <= distance).length}`).join('   ·   ');
        svg += `<text x="380" y="${256 + index * 22}" fill="#a9bad1" font-size="13">${counts}</text>`;
    });
    [25, 50, 100].forEach(distance => {
        // Labels sit on the northwest diagonal to avoid cardinal labels and center marker.
        const r = radius * distance / RADIUS_KM;
        svg += `<text x="${cx - r * 0.7 - 4}" y="${cy - r * 0.7 - 4}" text-anchor="end" fill="#a9bad1" font-size="10" stroke="#101e32" stroke-width="3" paint-order="stroke">${distance} km</text>`;
    });
    svg += '</g>';
    return { svg, height: 328, summary: `Strike map: ${points.length} strikes within 100 km in the last two hours; north up; age colors 0–15, 15–30, 30–60, 60–120 minutes.` };
}

module.exports = { projectStrikes, drawLightningMap, AGE_BANDS, RADIUS_KM };
