// Mapbox Geocoding + Search Box wrappers. Mirrors googleMaps.js public shape
// so locationService.js can swap providers transparently.
//
// Contract:
//   - HTTP errors, timeouts, parse failures THROW (locationService falls back to Google)
//   - Valid response with no result returns `null` (geocode) or `[]` (autocomplete)
//   - AbortError re-thrown so autocomplete callers can ignore stale requests

import { MAPBOX_TOKEN } from './config';
import { increment as usageInc } from '../utils/usageCounter';
import { makeRevGeoCache } from '../utils/persistentCache';

const GEOCODE_BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';
const SEARCH_BOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';
const TIMEOUT_MS = 10000;

// Mirrors googleMaps.js reverse-geocode cache (own namespace) so reloads don't
// re-bill. Namespace -en: old localized (e.g. Japanese) entries are ignored
// rather than served stale. Shared machinery: makeRevGeoCache.
const { get: revGeoGet, set: revGeoSet } = makeRevGeoCache('mb-revgeo-en', { ttlMs: 30 * 24 * 60 * 60 * 1000 });

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
    // Country: a country-type result is its own country; otherwise pull it from
    // the feature's context array (id like "country.123").
    const country = types.includes('country')
      ? firstSegment(f.place_name)
      : (f.context || []).find((c) => /^country\./.test(c.id))?.text || null;
    // Parent place when the match is a sub-locality (arrondissement/ward) — lets
    // callers roll a sub-area up to its city.
    const parentPlace =
      types.includes('locality') && !types.includes('place')
        ? (f.context || []).find((c) => /^place\./.test(c.id))?.text || null
        : null;
    return {
      lat,
      lng,
      formattedAddress: firstSegment(f.place_name),
      country,
      parentPlace,
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

// Old cache entries stored a bare city string; new ones store
// { name, country }. Normalize so consumers always get the object shape.
function asCityInfo(v) {
  if (v == null) return null;
  if (typeof v === 'string') return { name: v, country: null };
  return v;
}

export async function reverseGeocodeCityMapbox({ lat, lng } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  assertToken();
  const cached = revGeoGet('city', lat, lng);
  if (cached !== undefined) return asCityInfo(cached);
  const url =
    `${GEOCODE_BASE}/${lng},${lat}.json` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&language=en` +
    `&types=place,locality` +
    `&limit=1`;
  const { signal, clear } = timeoutSignal();
  try {
    usageInc('mapbox');
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox reverse-geocode failed: ${res.status}`);
    const data = await res.json();
    const f = data.features?.[0];
    if (!f) {
      revGeoSet('city', lat, lng, null);
      return null;
    }
    // Country lives in the feature's context array (id like "country.123").
    const ctx = f.context || [];
    const country = ctx.find((c) => /^country\./.test(c.id))?.text || null;
    // City label = the `place` (e.g. Paris). When the most-specific feature is
    // a sub-locality (Paris arrondissement, Tokyo ward), climb to the parent
    // `place` in context so the chip shows the city, not the sub-area.
    const ptypes = f.place_type || [];
    let name = firstSegment(f.text || f.place_name);
    if (ptypes.includes('locality') && !ptypes.includes('place')) {
      const parentPlace = ctx.find((c) => /^place\./.test(c.id))?.text;
      if (parentPlace) name = parentPlace;
    }
    const value = { name, country };
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
    `&language=en` +
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
    // Append parent city when primary is smaller than a city — neighborhood,
    // locality, or district (e.g. "Upli Bari, Udaipur"). Mapbox returns the
    // bare sub-area with the city only in context, so the summary's city line
    // was blank for these. Skip when primary is itself a place/city so we don't
    // append the region ("Udaipur, Rajasthan").
    if (!types.includes('place')) {
      const context = feature.context || [];
      const parent = context.find((c) => /^place\./.test(c.id))?.text;
      if (parent && parent.toLowerCase() !== primary.toLowerCase()) {
        value = `${primary}, ${parent}`;
      }
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
