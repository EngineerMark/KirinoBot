const Coords = require('../types/Coords');

const INTERVAL = 10 * 60 * 1000;
const BUCKETS = 12;

function lightningBuckets(lightning, location, now = Date.now()) {
    if (!Array.isArray(lightning?.strikes) || !Number.isFinite(location?.lat) || !Number.isFinite(location?.lon)) return null;
    const start = now - BUCKETS * INTERVAL;
    const buckets = Array.from({ length: BUCKETS }, () => ({ count: 0, nearest: null }));
    for (const strike of lightning.strikes) {
        const time = strike.time instanceof Date ? strike.time.getTime() : NaN;
        if (!Number.isFinite(time) || time < start || time > now || !Number.isFinite(strike.coord?.lat) || !Number.isFinite(strike.coord?.lon)) continue;
        const distance = Coords.Distance(location, strike.coord);
        if (!Number.isFinite(distance) || distance > 100) continue;
        const index = Math.min(BUCKETS - 1, Math.floor((time - start) / INTERVAL));
        buckets[index].count++;
        buckets[index].nearest = Math.min(buckets[index].nearest ?? Infinity, distance);
    }
    return buckets;
}

function drawLightning(lightning, location, top, now = Date.now()) {
    const buckets = lightningBuckets(lightning, location, now);
    if (!buckets) return null;
    const height = 262;
    const maximum = Math.max(4, ...buckets.map(bucket => bucket.count));
    const step = Math.ceil(maximum / 4);
    const limit = step * 4;
    const x = index => 76 + (index + 0.5) * 570 / BUCKETS;
    const countY = value => 201 - value / limit * 128;
    const distanceY = value => 201 - value / 100 * 128;
    let svg = `<g transform="translate(0 ${top})"><rect x="24" width="672" height="${height - 8}" rx="14" fill="#202e46"/>
<text x="42" y="29" fill="#f0f4fc" font-size="18" font-weight="600">Nearby lightning · within 100 km</text>
<rect x="44" y="44" width="14" height="10" rx="2" fill="#ffad9b"/><text x="66" y="54" fill="#ffad9b" font-size="13">Strikes / 10 min</text>
<path d="M272 49h22" stroke="#8cd9ee" stroke-width="3"/><text x="302" y="54" fill="#8cd9ee" font-size="13">Nearest strike (km)</text>`;
    for (let tick = 0; tick <= 4; tick++) {
        const y = countY(tick * step);
        svg += `<path d="M76 ${y}H646" stroke="#40506a" stroke-dasharray="3 5"/><text x="65" y="${y + 5}" fill="#ffad9b" font-size="13" text-anchor="end">${tick * step}</text><text x="678" y="${y + 5}" text-anchor="end" fill="#8cd9ee" font-size="12">${tick * 25}</text>`;
    }
    let path = '';
    let previous = false;
    buckets.forEach((bucket, index) => {
        const barHeight = 201 - countY(bucket.count);
        svg += `<rect x="${x(index) - 13}" y="${countY(bucket.count)}" width="26" height="${barHeight}" rx="3" fill="#ffad9b" opacity="0.85"/>`;
        if (bucket.nearest !== null) {
            path += `${previous ? 'L' : 'M'}${x(index)} ${distanceY(bucket.nearest)} `;
            svg += `<circle cx="${x(index)}" cy="${distanceY(bucket.nearest)}" r="3" fill="#8cd9ee"/>`;
            previous = true;
        }
        else { previous = false; }
    });
    svg += `<path data-series="nearest" d="${path}" fill="none" stroke="#8cd9ee" stroke-width="2.5"/>`;
    for (const [position, label] of [[76, '2h ago'], [218.5, '90m'], [361, '60m'], [503.5, '30m'], [646, 'Now']]) {
        svg += `<text x="${position}" y="230" text-anchor="middle" fill="#a9bad1" font-size="13">${label}</text>`;
    }
    svg += '</g>';
    return { svg, height };
}

module.exports = { lightningBuckets, drawLightning };
