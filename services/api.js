const API_CACHE = new Map();
const MAX_CACHE_ENTRIES = 500;

async function fetchWithCache(url, cacheDuration = 300000) {
    const now = Date.now();
    const cached = API_CACHE.get(url);
    if (cached && now - cached.timestamp < cacheDuration) return cached.data;
    API_CACHE.delete(url);

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
        // Avoid logging URLs: they can contain API keys.
        throw new Error(`API request failed with HTTP ${response.status}`);
    }
    const data = await response.json();
    if (API_CACHE.size >= MAX_CACHE_ENTRIES) API_CACHE.delete(API_CACHE.keys().next().value);
    API_CACHE.set(url, { data, timestamp: Date.now() });
    return data;
}

module.exports = { fetchWithCache };
