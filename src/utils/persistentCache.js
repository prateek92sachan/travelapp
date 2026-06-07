// localStorage-backed persistence for the in-memory API caches.
//
// Why: VIEWPORT/PLACE_DETAILS/WIKI/REV_GEO caches were plain in-memory Maps, so
// every page reload (incl. dev HMR) started cold and re-billed Google. Backing
// them with localStorage lets a fresh tab reuse a recent session's results.
//
// Storage shape per cache: { [key]: { v: <stored value>, t: <epoch ms> } }.
// `load` drops entries older than ttlMs. `makeSaver` throttles writes so a
// burst of cache.set() calls collapses into one serialization.

const PREFIX = 'travel-app:apicache:';

// Hydrate a Map from localStorage, dropping entries older than ttlMs.
export function loadCache(name, ttlMs) {
  const map = new Map();
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (!raw) return map;
    const obj = JSON.parse(raw);
    const now = Date.now();
    for (const k in obj) {
      const e = obj[k];
      if (e && typeof e.t === 'number' && now - e.t <= ttlMs) {
        map.set(k, e.v);
      }
    }
  } catch {
    /* corrupt/full storage — ignore, run with empty cache */
  }
  return map;
}

// Returns a throttled persist(map) function. `getTime(value)` lets callers whose
// stored values already carry their own timestamp preserve it across sessions;
// otherwise entries are stamped at save time.
export function makeSaver(name, { max = 200, throttleMs = 1000, getTime } = {}) {
  let timer = null;
  let pending = null;

  const flush = () => {
    timer = null;
    const map = pending;
    pending = null;
    if (!map) return;
    try {
      const entries = [...map.entries()];
      const start = max && entries.length > max ? entries.length - max : 0;
      const obj = {};
      const now = Date.now();
      for (let i = start; i < entries.length; i++) {
        const [k, v] = entries[i];
        const t = getTime ? getTime(v) ?? now : now;
        obj[k] = { v, t };
      }
      localStorage.setItem(PREFIX + name, JSON.stringify(obj));
    } catch {
      /* storage full/unavailable — keep running from memory */
    }
  };

  return (map) => {
    pending = map;
    if (timer) return;
    timer = setTimeout(flush, throttleMs);
  };
}

export function clearCache(name) {
  try {
    localStorage.removeItem(PREFIX + name);
  } catch {
    /* ignore */
  }
}

// Reverse-geocode result cache: coord-bucketed (~110m), TTL'd, localStorage-
// persisted. Both map providers (Google + Mapbox) cache reverse-geocode lookups
// identically — only the storage namespace differs — so the machinery lives
// here once. `get`/`set` are keyed by (kind, lat, lng); `get` returns the
// stored value or undefined (miss/expired).
export function makeRevGeoCache(namespace, { ttlMs = 30 * 60 * 1000, bucket = 0.001, max = 200 } = {}) {
  const cache = loadCache(namespace, ttlMs);
  const persist = makeSaver(namespace, { max, getTime: (v) => v.time });
  const keyFor = (kind, lat, lng) => {
    const q = (n) => (Math.round(n / bucket) * bucket).toFixed(3);
    return `${kind}:${q(lat)}:${q(lng)}`;
  };
  return {
    get(kind, lat, lng) {
      const key = keyFor(kind, lat, lng);
      const hit = cache.get(key);
      if (!hit) return undefined;
      if (Date.now() - hit.time > ttlMs) {
        cache.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(kind, lat, lng, value) {
      const key = keyFor(kind, lat, lng);
      cache.set(key, { value, time: Date.now() });
      if (cache.size > max) cache.delete(cache.keys().next().value);
      persist(cache);
    }
  };
}
