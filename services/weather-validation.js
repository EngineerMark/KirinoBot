const finite = value => Number.isFinite(value) ? value : NaN;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isInteger(value) && value >= 0 && value < 8e12;
const text = value => typeof value === 'string' && value.trim() ? value : 'Unavailable';

function coordinates(value) {
    return object(value) && Number.isFinite(value.lat) && Math.abs(value.lat) <= 90
        && Number.isFinite(value.lon) && Math.abs(value.lon) <= 180;
}

function locationResponse(data) {
    if (!Array.isArray(data)) throw new Error('Invalid location response');
    if (!data.length) return null;
    if (!coordinates(data[0]) || typeof data[0].name !== 'string') throw new Error('Invalid location response');
    return { ...data[0], country: /^[A-Z]{2}$/.test(data[0].country) ? data[0].country : null };
}

function conditions(data) {
    const condition = Array.isArray(data) ? data.find(object) : null;
    return [{ description: text(condition?.description), icon: /^\d{2}[dn]$/.test(condition?.icon) ? condition.icon : null }];
}

function weatherResponse(data) {
    if (!object(data) || !object(data.current)) throw new Error('Invalid weather response: current conditions unavailable');
    const current = { dt: timestamp(data.current.dt) ? data.current.dt : NaN, weather: conditions(data.current.weather) };
    for (const key of ['temp', 'feels_like', 'humidity', 'clouds', 'wind_speed', 'wind_deg', 'pressure', 'visibility']) current[key] = finite(data.current[key]);
    for (const key of ['humidity', 'clouds']) {
        if (current[key] < 0 || current[key] > 100) current[key] = NaN;
    }
    for (const key of ['wind_speed', 'pressure', 'visibility']) {
        if (current[key] < 0) current[key] = NaN;
    }
    if (current.wind_deg < 0 || current.wind_deg > 360) current.wind_deg = NaN;
    const daily = Array.isArray(data.daily) ? data.daily.map(day => ({
        dt: timestamp(day?.dt) ? day.dt : NaN, temp: { min: finite(day?.temp?.min), max: finite(day?.temp?.max) },
        pop: Number.isFinite(day?.pop) && day.pop >= 0 && day.pop <= 1 ? day.pop : NaN, weather: conditions(day?.weather),
    })) : [];
    const alerts = data.alerts === undefined ? [] : Array.isArray(data.alerts) ? data.alerts.filter(object).map(alert => ({
        event: text(alert.event), description: text(alert.description), sender_name: text(alert.sender_name),
        start: timestamp(alert.start) ? alert.start : null, end: timestamp(alert.end) ? alert.end : null,
        tags: Array.isArray(alert.tags) ? alert.tags.filter(tag => typeof tag === 'string') : [],
    })) : null;
    return {
        current, daily, alerts,
        invalidAlerts: (Number.isInteger(data.invalidAlerts) && data.invalidAlerts >= 0 ? data.invalidAlerts : 0) || (Array.isArray(data.alerts) ? data.alerts.filter(alert => !object(alert)).length : 0),
        timezone_offset: Number.isFinite(data.timezone_offset) && Math.abs(data.timezone_offset) <= 86400 ? data.timezone_offset : NaN,
    };
}

function airQualityResponse(data) {
    const entry = Array.isArray(data?.list) ? data.list[0] : null;
    const aqi = entry?.main?.aqi;
    if (!Number.isInteger(aqi) || aqi < 1 || aqi > 5) throw new Error('Invalid air quality response');
    const components = Object.fromEntries(['co', 'no', 'no2', 'o3', 'so2', 'pm2_5', 'pm10', 'nh3']
        .map(key => [key, Number.isFinite(entry.components?.[key]) && entry.components[key] >= 0 ? entry.components[key] : NaN]));
    return { list: [{ main: { aqi }, components }] };
}

function stabilityResponse(data) {
    const { time, cape } = data?.hourly || {};
    if (!Array.isArray(time) || !time.length || !Array.isArray(cape) || time.length !== cape.length
        || time.some(value => typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(value) || !Number.isFinite(Date.parse(value + 'Z')))) {
        throw new Error('Invalid air stability response');
    }
    return { hourly: { time, cape: cape.map(value => Number.isFinite(value) && value >= 0 ? value : NaN) } };
}

function lightningResponse(data) {
    if (!Array.isArray(data)) throw new Error('Invalid lightning response');
    const strikes = [];
    for (const row of data) {
        const coord = { lat: row?.[1], lon: row?.[0] };
        const rawTime = row?.[2];
        if (!coordinates(coord) || typeof rawTime !== 'string' || !/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(rawTime)) continue;
        const time = new Date(rawTime.replace(' ', 'T').replace(/(\.\d{3})\d+$/, '$1') + 'Z');
        if (Number.isFinite(time.getTime())) strikes.push({ coord, time });
    }
    if (data.length && !strikes.length) throw new Error('Invalid lightning response: no usable records');
    return { strikes, invalidRecords: data.length - strikes.length };
}

module.exports = { locationResponse, weatherResponse, airQualityResponse, stabilityResponse, lightningResponse };
