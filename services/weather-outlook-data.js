const DAY = 86400;

function upcomingHours(weather) {
    const anchor = Number.isFinite(weather?.current?.dt) ? weather.current.dt : Date.now() / 1000;
    const start = Math.floor(anchor / 3600) * 3600;
    const seen = new Set();
    return (Array.isArray(weather?.hourly) ? weather.hourly : []).filter(hour => {
        if (!Number.isFinite(hour?.dt) || hour.dt < start || hour.dt > start + 12 * 3600 || seen.has(hour.dt)) return false;
        seen.add(hour.dt);
        return true;
    }).sort((a, b) => a.dt - b.dt).slice(0, 13);
}

function solarDays(weather) {
    const offset = Number.isFinite(weather?.timezone_offset) ? weather.timezone_offset : 0;
    const days = new Map();
    for (const item of [...(Array.isArray(weather?.daily) ? weather.daily : []), weather?.current]) {
        if (!Number.isFinite(item?.sunrise) || !Number.isFinite(item?.sunset) || item.sunset <= item.sunrise) continue;
        const anchor = Number.isFinite(item.dt) ? item.dt : item.sunrise;
        const start = Math.floor((anchor + offset) / DAY) * DAY - offset;
        if (item.sunrise < start || item.sunrise >= start + DAY || item.sunset > start + DAY) continue;
        days.set(start, { start, sunrise: item.sunrise, sunset: item.sunset });
    }
    return days;
}

function duration(seconds) {
    const minutes = Math.max(0, Math.floor(seconds / 60));
    return minutes >= 60 ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : `${minutes}m`;
}

function daylightData(weather) {
    const at = Number.isFinite(weather?.current?.dt) ? weather.current.dt : Date.now() / 1000;
    const offset = Number.isFinite(weather?.timezone_offset) ? weather.timezone_offset : 0;
    const start = Math.floor((at + offset) / DAY) * DAY - offset;
    const day = solarDays(weather).get(start);
    if (!day) return null;
    const local = value => new Date((value + offset) * 1000).toISOString().slice(11, 16);
    const length = day.sunset - day.sunrise;
    const status = at < day.sunrise ? `Sunrise in ${duration(day.sunrise - at)}` : at < day.sunset ? `${duration(day.sunset - at)} left` : 'Daylight ended';
    return { ...day, at, sunriseLabel: local(day.sunrise), sunsetLabel: local(day.sunset), length, remaining: Math.max(0, Math.min(length, day.sunset - at)), status, timezone: Number.isFinite(weather?.timezone_offset) ? 'local' : 'UTC' };
}

function nightRanges(weather, start, end) {
    const ranges = [];
    for (const day of solarDays(weather).values()) {
        for (const [from, to] of [[day.start, day.sunrise], [day.sunset, day.start + DAY]]) {
            const a = Math.max(start, from);
            const b = Math.min(end, to);
            if (b > a) ranges.push([a, b]);
        }
    }
    return ranges;
}

function daylightSummary(weather) {
    const day = daylightData(weather);
    return day ? `Sunrise ${day.sunriseLabel} · Sunset ${day.sunsetLabel} (${day.timezone})\n${duration(day.length)} daylight · ${day.status}` : 'Daylight unavailable';
}

function windSummary(weather) {
    const hours = upcomingHours(weather);
    const winds = hours.map(hour => hour.wind_speed).filter(value => Number.isFinite(value) && value >= 0);
    const gusts = hours.map(hour => hour.wind_gust).filter(value => Number.isFinite(value) && value >= 0);
    if (!winds.length && !gusts.length) return null;
    const peak = values => values.length ? `${(Math.max(...values) * 3.6).toFixed(1)} km/h / ${(Math.max(...values) * 2.23694).toFixed(1)} mph` : 'Unavailable';
    return `Next 12h peak wind: ${peak(winds)}\nPeak gusts: ${peak(gusts)}`;
}

module.exports = { upcomingHours, daylightData, nightRanges, daylightSummary, windSummary, duration };
