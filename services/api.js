//API systems, to handle caching and other things

const API_CACHE = new Map(); // [url, { data, timestamp }]

async function fetchWithCache(url, cacheDuration = 300000) { // default cache duration: 5 minutes
    const now = Date.now();
    const cached = API_CACHE.get(url);
    if (cached && (now - cached.timestamp < cacheDuration)) {
        return cached.data;
    }
    const response = await fetch(url);
    const data = await response.json();
    API_CACHE.set(url, { data, timestamp: now });
    return data;
}

module.exports = {
    fetchWithCache,
};