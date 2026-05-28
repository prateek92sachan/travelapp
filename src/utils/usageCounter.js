// Per-month localStorage call counter for free APIs (Wikipedia, OpenWeather).
// Paid services (Google, Mapbox) come from real billing via the backend.
//
// Storage shape (key: 'travelapp:usage:counters'):
//   { '2026-05': { wiki: 142, openweather: 38 }, '2026-04': {...} }
// Old months retained for trend lines but only current month is incremented.

const KEY = 'travelapp:usage:counters';

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch {
    // Quota or private mode — silently skip; counters are non-critical.
  }
}

export function increment(service, n = 1) {
  if (!service || typeof window === 'undefined') return;
  const all = readAll();
  const month = currentMonth();
  if (!all[month]) all[month] = {};
  all[month][service] = (all[month][service] || 0) + n;
  writeAll(all);
}

export function readCurrentMonth() {
  return readAll()[currentMonth()] || {};
}

export function readMonth(yyyyMm) {
  return readAll()[yyyyMm] || {};
}

export function readHistory() {
  return readAll();
}
