const KEY = 'travel-app:place-cache';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX = 5;

function cacheKey(dest, date) {
  return `${dest.toLowerCase().trim()}::${date}`;
}

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}

function write(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {}
}

export function getCachedPlaces(dest, date) {
  const cache = read();
  const entry = cache[cacheKey(dest, date)];
  if (!entry || Date.now() - entry.cachedAt > TTL_MS) return null;
  return entry; // { coords, tabData, weather, cachedAt }
}

export function setCachedPlaces(dest, date, data) {
  const cache = read();
  const key = cacheKey(dest, date);
  cache[key] = { ...data, cachedAt: Date.now() };
  const trimmed = Object.fromEntries(
    Object.entries(cache)
      .sort((a, b) => b[1].cachedAt - a[1].cachedAt)
      .slice(0, MAX)
  );
  write(trimmed);
}
