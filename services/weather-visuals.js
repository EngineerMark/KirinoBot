// Descriptive display bands, not official weather alerts or health advice.
// Beaufort m/s boundaries: https://weather.metoffice.gov.uk/guides/coast-and-sea/beaufort-scale
const COLORS = ['#85d8ca', '#8cd9ee', '#f2cf7a', '#ffad78', '#ff889c'];
const WIND_LIMITS = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];
const WIND_LABELS = ['Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze', 'Strong breeze', 'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane force'];

function band(value, limits, labels, max, unit = '') {
    if (!Number.isFinite(value)) return null;
    const level = limits.filter(limit => value >= limit).length;
    return { label: labels[level] + unit, color: COLORS[Math.min(level, 4)], fraction: Math.max(0, Math.min(1, value / max)) };
}

function weatherVisual(field, context = {}, mode = 'normal') {
    const name = field.name.replace(/[*_]/g, '');
    const current = context.weather?.current || {};
    let icon = 'cloud';
    let badge = null;
    if (name === 'Wind') {
        icon = 'wind';
        if (Number.isFinite(current.wind_speed) && current.wind_speed >= 0) {
            const force = WIND_LIMITS.filter(limit => current.wind_speed >= limit).length;
            badge = { label: `${WIND_LABELS[force]} · Bft ${force}`, color: COLORS[Math.min(4, Math.floor(force / 2))], fraction: force / 12 };
        }
    }
    else if (['Conditions', 'Feels Like'].includes(name)) {
        icon = name === 'Conditions' ? conditionIcon(current.weather?.[0]?.description) : 'temperature';
        badge = band(name === 'Conditions' ? current.temp : current.feels_like, [0, 10, 20, 30], ['Below freezing', 'Cold', 'Cool', 'Warm', 'Hot'], 40);
    }
    else if (name === 'Humidity') {
        icon = 'drop';
        badge = band(current.humidity, [30, 70], ['Low humidity', 'Moderate humidity', 'High humidity'], 100);
    }
    else if (name === 'Cloud Coverage') {
        badge = band(current.clouds, [10, 30, 70, 90], ['Mostly clear', 'Few clouds', 'Partly cloudy', 'Mostly cloudy', 'Overcast'], 100);
    }
    else if (name === 'Visibility') {
        icon = 'eye';
        badge = band(current.visibility, [1000, 5000, 10000], ['Very low visibility', 'Reduced visibility', 'Good visibility', '10+ km visibility'], 10000);
        if (badge) badge.color = current.visibility < 1000 ? COLORS[4] : current.visibility < 5000 ? COLORS[2] : COLORS[0];
    }
    else if (name === 'Pressure') {
        icon = 'gauge';
        badge = band(current.pressure, [1000, 1020], ['Low pressure', 'Mid-range pressure', 'High pressure'], 1050);
        if (badge) badge.fraction = Math.max(0, Math.min(1, (current.pressure - 950) / 100));
    }
    else if (name.includes('Air Quality')) {
        icon = 'air';
        const aqi = context.airQuality?.list?.[0]?.main?.aqi;
        if (Number.isInteger(aqi) && aqi >= 1 && aqi <= 5) badge = { label: ['Good', 'Fair', 'Moderate', 'Poor', 'Very poor'][aqi - 1] + ' · AQI ' + aqi, color: COLORS[aqi - 1], fraction: aqi / 5 };
    }
    else if (name.includes('Lightning') || name.includes('Strike')) {icon = 'lightning';}
    else if (name === 'Air Stability') {
        icon = 'gauge';
        const hourly = context.airStability?.hourly;
        const times = hourly?.time || [];
        let nearest = -1;
        let distance = Infinity;
        for (let index = 0; index < times.length; index++) {
            const delta = Math.abs(Date.parse(times[index] + 'Z') - Date.now());
            if (delta < distance) {
                distance = delta;
                nearest = index;
            }
        }
        const cape = hourly?.cape?.[nearest];
        if (Number.isFinite(cape) && cape >= 0) badge = band(cape, [500, 1000, 2500, 4000], ['Stable', 'Slightly unstable', 'Moderately unstable', 'Unstable', 'Extremely unstable'], 5000);
    }
    else if (mode === 'alerts' || name.includes('Alert')) {icon = 'alert';}
    else if (mode === 'airquality') {icon = 'air';}
    else if (mode === 'forecast') {
        const date = name.match(/\d{4}-\d{2}-\d{2}/)?.[0];
        const offset = Number.isFinite(context.weather?.timezone_offset) ? context.weather.timezone_offset : 0;
        const day = context.weather?.daily?.find(item => Number.isFinite(item.dt) && new Date((item.dt + offset) * 1000).toISOString().startsWith(date || 'invalid'));
        icon = conditionIcon(day?.weather?.[0]?.description || name);
        if (Number.isFinite(day?.pop) && day.pop >= 0 && day.pop <= 1) badge = { label: `${Math.round(day.pop * 100)}% precipitation chance`, color: COLORS[1], fraction: day.pop };
    }
    return { icon, badge };
}

function conditionIcon(description = '') {
    if (/thunder/i.test(description)) return 'lightning';
    if (/snow|sleet/i.test(description)) return 'snow';
    if (/rain|drizzle/i.test(description)) return 'rain';
    if (/clear/i.test(description)) return 'sun';
    if (/fog|mist|haze/i.test(description)) return 'air';
    return 'cloud';
}

const PATHS = {
    cloud: '<path d="M6 18h12a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0-1 10Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
    wind: '<path d="M2 8h13a3 3 0 1 0-3-3M2 12h18a3 3 0 1 0-3-3M2 16h10a3 3 0 1 1-3 3"/>',
    temperature: '<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Z"/><path d="M12 7v11"/>',
    drop: '<path d="M12 2S4 11 4 16a8 8 0 0 0 16 0c0-5-8-14-8-14Z"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12Z"/><circle cx="12" cy="12" r="3"/>',
    gauge: '<path d="M3 19a11 11 0 1 1 18 0M5 19h14M12 14l5-7"/><circle cx="12" cy="14" r="2"/>',
    air: '<path d="M2 5h20M5 10h14M2 15h20M5 20h14"/>',
    lightning: '<path d="m14 1-10 13h7l-1 9L21 9h-8Z"/>',
    rain: '<path d="M5 13a4 4 0 0 1 0-8 6 6 0 0 1 11 1 4 4 0 0 1 2 7M6 17l-2 4m9-4-2 4m9-4-2 4"/>',
    snow: '<path d="M12 1v22M2 6l20 12M2 18 22 6M8 3l4 4 4-4M8 21l4-4 4 4"/>',
    alert: '<path d="m12 2 11 20H1Z"/><path d="M12 8v6m0 3v1"/>',
};

function drawIcon(kind, x, y, color = '#8cd9ee', size = 22) {
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[kind] || PATHS.cloud}</svg>`;
}

function drawWindCompass(degrees, x, y, color = '#8cd9ee') {
    const known = Number.isFinite(degrees) && degrees >= 0 && degrees <= 360;
    const bearing = known ? degrees % 360 : null;
    const direction = known ? ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'][Math.round(bearing / 22.5) % 16] : '?';
    // The highlighted needle points toward the source of the wind (meteorological convention).
    return `<g transform="translate(${x} ${y})" aria-label="Wind from ${direction}">
<circle cx="32" cy="32" r="22" fill="#101e32" stroke="#53647d"/>
<g fill="#a9bad1" font-size="10" text-anchor="middle"><text x="32" y="9">N</text><text x="60" y="36">E</text><text x="32" y="64">S</text><text x="4" y="36">W</text></g>
${known ? `<g transform="rotate(${bearing} 32 32)"><path d="M32 13 26 35 32 31 38 35Z" fill="${color}"/><path d="m32 51-4-17 4 3 4-3Z" fill="#60718b"/></g>` : '<text x="32" y="37" fill="#a9bad1" text-anchor="middle" font-size="16">?</text>'}
<circle cx="32" cy="32" r="2" fill="#f0f4fc"/>
<text x="32" y="80" text-anchor="middle" font-size="11" fill="#a9bad1">${known ? `From ${direction}` : 'Unknown'}</text></g>`;
}

module.exports = { weatherVisual, drawIcon, drawWindCompass };
