// Tmap data layer — pure Mapbox. Produces the SAME place-object shape as
// googleMaps.js (shapePlace) so the existing UI (detail cards, tabs, save,
// markers) consumes it unchanged, but every byte comes from Mapbox APIs.
//
// POIs come from the Mapbox Search Box **category** endpoint:
//   https://api.mapbox.com/search/searchbox/v1/category/{canonical_id}
// It is a one-call browse (no session token), proximity-biased and bbox-
// filterable — the closest Mapbox analogue to Google's category Text Search.
//
// Mapbox has no ratings / review counts / place photos. Those fields are
// returned null/0; photoUrl is filled later by the free Wikipedia enrichment
// (enrichWithWiki), exactly like the Google path for landmark places.

import { MAPBOX_TOKEN } from './config';
import { loadCache, makeSaver, clearCache } from '../utils/persistentCache';

const CATEGORY_BASE = 'https://api.mapbox.com/search/searchbox/v1/category';
const TIMEOUT_MS = 10000;

// Our 5 tabs → Mapbox canonical category ids. Mapbox has no "hidden gems"
// concept; museum is used as a reasonable proxy for lesser-known cultural
// spots so the tab still returns something distinct from Activities.
const CATEGORY_CANONICAL = {
  activities: 'tourist_attraction',
  restaurants: 'restaurant',
  nature: 'park',
  gems: 'museum',
  hotels: 'hotel'
};

// ---- Viewport cache (mirrors googleMaps.js: bbox/category key, 60min TTL) ---
const VIEWPORT_TTL_MS = 60 * 60 * 1000;
const VIEWPORT_CACHE = loadCache('tmap-viewport', VIEWPORT_TTL_MS);
const persistViewport = makeSaver('tmap-viewport', { max: 100, getTime: (v) => v.time });
const inFlight = new Map();

function assertToken() {
  if (!MAPBOX_TOKEN) throw new Error('Missing VITE_MAPBOX_TOKEN');
}

function timeoutSignal() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// Convert a center + radius into a bbox [minLng, minLat, maxLng, maxLat].
function radiusToBbox(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

function summaryFromCategories(cats = []) {
  const friendly = cats
    .filter((c) => c && !['point_of_interest', 'establishment'].includes(c))
    .slice(0, 3)
    .map((c) => c.replace(/_/g, ' '))
    .join(' / ');
  return friendly || 'Point of interest';
}

function estimateCost(cats = []) {
  const t = new Set(cats);
  if (t.has('park') || t.has('nature_reserve') || t.has('viewpoint') || t.has('beach')) return 'Free';
  if (t.has('museum') || t.has('art_gallery') || t.has('zoo') || t.has('aquarium')) return '₹₹';
  if (t.has('restaurant') || t.has('cafe') || t.has('bar')) return '₹₹';
  return '₹₹';
}

function estimateDuration(cats = []) {
  const t = new Set(cats);
  if (t.has('zoo') || t.has('aquarium') || t.has('theme_park')) return 'Half day';
  if (t.has('museum') || t.has('art_gallery')) return '2-3 hrs';
  if (t.has('park') || t.has('nature_reserve') || t.has('beach')) return '1-3 hrs';
  if (t.has('restaurant') || t.has('cafe') || t.has('bar')) return '1-2 hrs';
  return '2 hrs';
}

// Map a Mapbox Search Box feature → our app's place shape (matches
// googleMaps.shapePlace fields 1:1; Mapbox-unavailable fields are null/0).
function shapeFeature(f) {
  const props = f.properties || {};
  const coords = props.coordinates || {};
  const lng = coords.longitude ?? f.geometry?.coordinates?.[0];
  const lat = coords.latitude ?? f.geometry?.coordinates?.[1];
  const cats = props.poi_category || [];
  return {
    placeId: props.mapbox_id || `${lat},${lng}`,
    name: props.name || 'Unnamed place',
    address: props.full_address || props.place_formatted || props.address || '',
    lat,
    lng,
    rating: null,
    reviewCount: 0,
    types: cats,
    summary: summaryFromCategories(cats),
    estCost: estimateCost(cats),
    estDuration: estimateDuration(cats),
    photoUrl: null
  };
}

// Core category browse. Returns shaped, deduped places (Mapbox already ranks
// by proximity/relevance, so no client re-sort).
async function fetchCategory({ category, lat, lng, radiusMeters = 20000, limit = 10, bounds = null }) {
  assertToken();
  const canonical = CATEGORY_CANONICAL[category] || CATEGORY_CANONICAL.activities;
  const bbox = bounds
    ? [bounds.low.lng, bounds.low.lat, bounds.high.lng, bounds.high.lat]
    : radiusToBbox(lat, lng, radiusMeters);

  const url =
    `${CATEGORY_BASE}/${canonical}` +
    `?access_token=${MAPBOX_TOKEN}` +
    `&proximity=${lng},${lat}` +
    `&bbox=${bbox.map((n) => n.toFixed(6)).join(',')}` +
    `&limit=${Math.min(25, limit)}` +
    `&language=en`;

  const { signal, clear } = timeoutSignal();
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Mapbox category ${canonical} failed: ${res.status}`);
    const data = await res.json();
    const seen = new Set();
    const out = [];
    for (const f of data.features || []) {
      const place = shapeFeature(f);
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) continue;
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      out.push(place);
    }
    return out.slice(0, limit);
  } finally {
    clear();
  }
}

// ---- Public: tab fetchers (signatures match googleMaps.js) ------------------
// `destination` is accepted for signature parity but unused — Mapbox browse is
// driven by proximity + bbox, not a text query.

export function fetchTopActivities({ lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchCategory({ category: 'activities', lat, lng, radiusMeters, limit });
}

export function fetchTopRestaurants({ lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchCategory({ category: 'restaurants', lat, lng, radiusMeters, limit });
}

export function fetchTopNatureUnique({ lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchCategory({ category: 'nature', lat, lng, radiusMeters, limit });
}

export function fetchHiddenGems({ lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchCategory({ category: 'gems', lat, lng, radiusMeters, limit });
}

export function fetchTopHotels({ lat, lng, radiusMeters = 20000, limit = 15 }) {
  return fetchCategory({ category: 'hotels', lat, lng, radiusMeters, limit });
}

// ---- Public: viewport + nearby (cached, deduped — mirrors googleMaps.js) ----

function viewportCacheKey({ lat, lng, radiusMeters, category, bounds }) {
  if (bounds) {
    const q = (n) => (Math.round(n / 0.005) * 0.005).toFixed(3);
    return `rect:${q(bounds.low.lat)},${q(bounds.low.lng)}:${q(bounds.high.lat)},${q(bounds.high.lng)}:${category}`;
  }
  const q = (n) => (Math.round(n / 0.01) * 0.01).toFixed(2);
  return `${q(lat)}:${q(lng)}:${radiusMeters}:${category}`;
}

export function fetchPlacesInViewport({
  lat,
  lng,
  radiusMeters = 5000,
  category = 'activities',
  limit = 10,
  bounds = null
}) {
  const key = viewportCacheKey({ lat, lng, radiusMeters, category, bounds });
  const now = Date.now();

  const cached = VIEWPORT_CACHE.get(key);
  if (cached && now - cached.time < VIEWPORT_TTL_MS) return Promise.resolve(cached.data);
  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const data = await fetchCategory({ category, lat, lng, radiusMeters, limit, bounds });
      VIEWPORT_CACHE.set(key, { data, time: Date.now() });
      if (VIEWPORT_CACHE.size > 100) {
        VIEWPORT_CACHE.delete(VIEWPORT_CACHE.keys().next().value);
      }
      persistViewport(VIEWPORT_CACHE);
      return data;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function fetchPlacesNearPoint({ lat, lng, radiusKm = 2, category = 'activities', limit = 10 }) {
  return fetchPlacesInViewport({
    lat,
    lng,
    radiusMeters: Math.round(radiusKm * 1000),
    category,
    limit
  });
}

export function clearViewportCache() {
  VIEWPORT_CACHE.clear();
  inFlight.clear();
  clearCache('tmap-viewport');
}
