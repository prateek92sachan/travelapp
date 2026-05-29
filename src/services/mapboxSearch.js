// Mapbox Geocoding + Search Box wrappers. Mirrors googleMaps.js public shape
// so locationService.js can swap providers transparently.
//
// Contract:
//   - HTTP errors, timeouts, parse failures THROW (locationService falls back to Google)
//   - Valid response with no result returns `null` (geocode) or `[]` (autocomplete)
//   - AbortError re-thrown so autocomplete callers can ignore stale requests

import { MAPBOX_TOKEN } from './config';
import { increment as usageInc } from '../utils/usageCounter';
import { loadCache, makeSaver } from '../utils/persistentCache';

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';
const TIMEOUT_MS = 10000;

// Persist mirrors googleMaps.js reverse-geocode cache so reloads don't re-bill.
// Bucket coords to ~110m, 30min TTL, 200 cap.
const REV_GEO_TTL_MS = 30 * 60 * 1000;
const REV_GEO_BUCKET = 0.001;
const REV_GEO_MAX = 200;
const REV_GEO_CACHE = loadCache('mb-revgeo', REV_GEO_TTL_MS);
const persistRevGeo = makeSaver('mb-revgeo', { max: REV_GEO_MAX, getTime: (v) => v.time });

function revGeoKey(kind, lat, lng) {
  const q = (n) => (Math.round(n / REV_GEO_BUCKET) * REV_GEO_BUCKET).toFixed(3);
  return `${kind}:${q(lat)}:${q(lng)}`;
}
function revGeoGet(kind, lat, lng) {
  const key = revGeoKey(kind, lat, lng);
  const hit = REV_GEO_CACHE.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.time > REV_GEO_TTL_MS) {
    REV_GEO_CACHE.delete(key);
    return undefined;
  }
  return hit.value;
}
function revGeoSet(kind, lat, lng, value) {
  const key = revGeoKey(kind, lat, lng);
  REV_GEO_CACHE.set(key, { value, time: Date.now() });
  if (REV_GEO_CACHE.size > REV_GEO_MAX) {
    REV_GEO_CACHE.delete(REV_GEO_CACHE.keys().next().value);
  }
  persistRevGeo(REV_GEO_CACHE);
}

function firstSegment(s) {
  return (s || '').split(',')[0].trim();
}

function timeoutSignal(externalSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function assertToken() {
  if (!MAPBOX_TOKEN) throw new Error('Missing VITE_MAPBOX_TOKEN');
}

// ---- Forward geocode --------------------------------------------------------

// Restricted to city-level place_types (place, locality, region, country,
// district) to mirror Google's locality bias. POI queries ("Eiffel Tower")
// return null so locationService can fall back to Google Places.
export async function geocodeDestinationMapbox(destination) {
  if (!destination?.trim()) return null;
  assertToken();
  const q = encodeURIComponent(destination.trim());
  const url =
    `${GEOCODE_BASE}/${q}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&types=place,locality,region,country,district` +
    `&limit=1`;
  const { signal, clear } = timeoutSignal();
  try {
    usageInc('mapbox');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox geocode failed: ${res.status}`);
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) return null;
    const types = f.place_type || [];
    const [lng, lat] = f.center || [];
    const bbox = f.bbox || null;
    return {
      lat,
      lng,
      formattedAddress: firstSegment(f.place_name),
      name: destination,
      placeId: f.id,
      types,
      isCountry: types.includes('country'),
      isAdminRegion: types.includes('region') && !types.includes('place'),
      viewportNE: bbox ? { lat: bbox[3], lng: bbox[2] } : null,
      viewportSW: bbox ? { lat: bbox[1], lng: bbox[0] } : null
    };
  } finally {
    clear();
  }
}

// ---- Reverse geocode --------------------------------------------------------

export async function reverseGeocodeCityMapbox({ lat, lng } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  assertToken();
  const cached = revGeoGet('city', lat, lng);
  if (cached !== undefined) return cached;
  const url =
    `${GEOCODE_BASE}/${lng},${lat}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&types=place,locality` +
    `&limit=1`;
  const { signal, clear } = timeoutSignal();
  try {
    usageInc('mapbox');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox reverse-geocode failed: ${res.status}`);
    const data = await res.json();
    const f = data.features?.[0];
    const value = f ? firstSegment(f.text || f.place_name) : null;
    revGeoSet('city', lat, lng, value);
    return value;
  } finally {
    clear();
  }
}

export async function reverseGeocodePlaceNameMapbox({ lat, lng } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  assertToken();
  const cached = revGeoGet('placeName', lat, lng);
  if (cached !== undefined) return cached;
  // Mapbox rule: limit>1 requires a single type. Use default limit=1 with
  // multi-type request — Mapbox returns the most-specific feature.
  const url =
    `${GEOCODE_BASE}/${lng},${lat}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&types=neighborhood,locality,place,district`;
  const { signal, clear } = timeoutSignal();
  try {
    usageInc('mapbox');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox reverse-place failed: ${res.status}`);
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) {
      revGeoSet('placeName', lat, lng, null);
      return null;
    }
    const types = feature.place_type || [];
    const primary = feature.text;
    let value = primary;
    // Append parent locality when primary is a neighborhood (Shibuya, Tokyo).
    if (types.includes('neighborhood')) {
      const context = feature.context || [];
      const parent = context.find((c) => /^(place|locality)\./.test(c.id))?.text;
      if (parent && parent !== primary) value = `${primary}, ${parent}`;
    }
    revGeoSet('placeName', lat, lng, value);
    return value;
  } finally {
    clear();
  }
}

// ---- Autocomplete -----------------------------------------------------------

export function newSessionTokenMapbox() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Mapbox Search Box /suggest. Shape mirrors googleMaps.fetchPlacePredictions.
// AbortError is re-thrown — caller (locationService) ignores aborts.
export async function fetchPlacePredictionsMapbox(input, { sessionToken, signal } = {}) {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.length < 2) return [];
  if (!sessionToken) throw new Error('Mapbox autocomplete requires sessionToken');
  assertToken();

  const url =
    `${SEARCH_BOX_BASE}/suggest` +
    `?q=${encodeURIComponent(trimmed)}` +
    `&access_token=${MAPBOX_TOKEN}` +
    `&session_token=${sessionToken}` +
    `&language=en` +
    // Destination search = cities/regions only. Dropping address+poi stops
    // businesses ("Dehradun Public School") from burying the actual city.
    `&types=place,locality,region,country,district` +
    `&limit=8`;
  const { signal: combined, clear } = timeoutSignal(signal);
  try {
    usageInc('mapbox');
    const res = await fetch(url, { signal: combined });
    if (!res.ok) throw new Error(`Mapbox suggest failed: ${res.status}`);
    const data = await res.json();
    return (data.suggestions || []).map((s) => ({
      placeId: s.mapbox_id,
      mainText: s.name || '',
      secondaryText: s.place_formatted || '',
      fullText: s.place_formatted ? `${s.name}, ${s.place_formatted}` : (s.name || ''),
      types: s.feature_type ? [s.feature_type] : []
    }));
  } finally {
    clear();
  }
}
