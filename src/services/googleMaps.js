// Google Maps Platform service: geocoding + Places (New) Text Search.
// All calls go through the JS SDK once the map is loaded; geocoding uses REST.

import { GOOGLE_MAPS_KEY } from './config';
import { loadCache, makeSaver, clearCache } from '../utils/persistentCache';

/**
 * Geocode a destination string -> { lat, lng, formattedAddress, name, types, isCountry }.
 *
 * The `types` and `isCountry` fields let the UI warn the user when they've
 * searched too broad an area (e.g. an entire country) — that's why activity
 * results often look scattered and dull.
 */
export async function geocodeDestination(destination) {
  if (!destination?.trim()) throw new Error('Destination required');
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(destination)}` +
    `&key=${GOOGLE_MAPS_KEY}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    throw new Error(
      data.error_message ||
        `Could not find "${destination}". Try a more specific name.`
    );
  }

  const r = data.results[0];
  const types = r.types || [];
  const vp = r.geometry.viewport;
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    formattedAddress: r.formatted_address,
    name: destination,
    placeId: r.place_id,
    types,
    isCountry: types.includes('country'),
    isAdminRegion:
      types.includes('administrative_area_level_1') &&
      !types.includes('locality'),
    // Bounding box of the geocoded area — used to scale the places search
    // radius to match the actual size of the searched region.
    viewportNE: vp ? { lat: vp.northeast.lat, lng: vp.northeast.lng } : null,
    viewportSW: vp ? { lat: vp.southwest.lat, lng: vp.southwest.lng } : null
  };
}

// ---- Reverse-geocode result cache ----------------------------------------
//
// Map idle events fire reverseGeocodeCity + reverseGeocodePlaceName on every
// settled pan. With Fix 1's debounce + min-move guard, repeats are rare but
// still happen (e.g. user pans away and back, or tab refocus triggers idle).
// Quantize coords to ~110m buckets so near-identical calls hit the cache.
// TTL 30 min — these names don't change quickly. See milestone Fix 5.

const REV_GEO_TTL_MS = 30 * 60 * 1000;
const REV_GEO_BUCKET = 0.001; // ≈ 110 m at the equator
const REV_GEO_MAX = 200;
// Hydrated from localStorage so reverse-geocode labels survive a reload.
const REV_GEO_CACHE = loadCache('revgeo', REV_GEO_TTL_MS);
const persistRevGeo = makeSaver('revgeo', { max: REV_GEO_MAX, getTime: (v) => v.time });

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

// Reverse geocode a lat/lng to a city name (locality or admin level 2).
// Returns null on failure — always safe to ignore.
export async function reverseGeocodeCity({ lat, lng }) {
  const cached = revGeoGet('city', lat, lng);
  if (cached !== undefined) return cached;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${lat},${lng}` +
    `&result_type=locality|administrative_area_level_2` +
    `&key=${GOOGLE_MAPS_KEY}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;
    const components = data.results[0].address_components || [];
    const locality = components.find((c) => c.types.includes('locality'));
    const level2 = components.find((c) => c.types.includes('administrative_area_level_2'));
    const value = locality?.long_name || level2?.long_name || null;
    revGeoSet('city', lat, lng, value);
    return value;
  } catch {
    return null;
  }
}

// Reverse geocode a lat/lng to the most useful place name for a search input.
// Prefers neighborhood/sublocality, falls back to locality, then admin level 2.
// Returns a string like "Shibuya, Tokyo" when a neighborhood is found,
// otherwise just "Tokyo". Returns null on failure.
export async function reverseGeocodePlaceName({ lat, lng }) {
  const cached = revGeoGet('placeName', lat, lng);
  if (cached !== undefined) return cached;
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?latlng=${lat},${lng}` +
    `&result_type=neighborhood|sublocality|locality|administrative_area_level_2` +
    `&key=${GOOGLE_MAPS_KEY}`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'OK' || !data.results?.length) return null;

    // Walk results in preference order. Each result has its own address_components.
    const TYPE_PRIORITY = ['neighborhood', 'sublocality', 'locality', 'administrative_area_level_2'];
    let best = null;
    for (const t of TYPE_PRIORITY) {
      const hit = data.results.find((r) => (r.types || []).includes(t));
      if (hit) { best = { result: hit, type: t }; break; }
    }
    if (!best) return null;

    const components = best.result.address_components || [];
    const primary = components.find((c) => c.types.includes(best.type))?.long_name;
    if (!primary) return null;

    let value = primary;
    // Append locality as parent context when primary is a neighborhood/sublocality
    if (best.type === 'neighborhood' || best.type === 'sublocality') {
      const locality = components.find((c) => c.types.includes('locality'))?.long_name;
      if (locality && locality !== primary) value = `${primary}, ${locality}`;
    }
    revGeoSet('placeName', lat, lng, value);
    return value;
  } catch {
    return null;
  }
}

/**
 * Find the most prominent nearby city for display purposes.
 *
 * Uses Places Text Search with a "city" query biased to the given coords.
 * Google ranks by prominence so for a town like "Hulu Langat" near KL
 * this returns Kuala Lumpur (the famous metro it belongs to), not just
 * the destination itself. Returns null on failure.
 *
 * `excludeName` lets the caller skip results that match the destination
 * (case-insensitive), so a search for "Tokyo" doesn't return "Tokyo" as
 * the parent city.
 */
export async function fetchProminentNearbyCity({ lat, lng, excludeName = '' } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': 'places.displayName'
      },
      body: JSON.stringify({
        textQuery: 'city',
        locationBias: {
          circle: { center: { latitude: lat, longitude: lng }, radius: 50000 }
        },
        maxResultCount: 5
      })
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const data = await res.json();
    const places = data.places || [];
    const exclude = excludeName.trim().toLowerCase();
    for (const p of places) {
      const name = p.displayName?.text;
      if (!name) continue;
      if (exclude && name.toLowerCase() === exclude) continue;
      return name;
    }
    return null;
  } catch {
    return null;
  }
}

// ---- Places (New) Text Search ---------------------------------------------

const PLACES_FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount', // popularity signal
  'places.types',
  'places.id',
  'places.photos'
].join(',');

/**
 * Low-level call that the POI and activity helpers share.
 * Asks for `fetchCount` results so we have headroom to filter, then returns
 * the raw places array (filtered/ranked downstream).
 *
 * When `bounds` (rectangle: { low: {lat,lng}, high: {lat,lng} }) is supplied,
 * uses `locationRestriction` — strictly restricts results to that rectangle.
 * Otherwise falls back to `locationBias` circle (soft hint).
 */
async function placesTextSearch({ textQuery, lat, lng, radiusMeters, fetchCount, bounds }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const body = {
      textQuery,
      maxResultCount: fetchCount
    };
    if (bounds) {
      body.locationRestriction = {
        rectangle: {
          low:  { latitude: bounds.low.lat,  longitude: bounds.low.lng  },
          high: { latitude: bounds.high.lat, longitude: bounds.high.lng }
        }
      };
    } else {
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          // Google searchText caps circle.radius at 50000m.
          radius: Math.min(50000, Math.max(1, radiusMeters))
        }
      };
    }
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
        'X-Goog-FieldMask': PLACES_FIELD_MASK
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Places API error ${res.status}: ${errText}`);
    }
    const data = await res.json();
    return data.places || [];
  } finally {
    clearTimeout(timer);
  }
}

// ---- Ranking helpers ------------------------------------------------------

// Categories that indicate a "real attraction" — used to filter out noise
// like generic establishments, ATMs, and gas stations that occasionally
// slip into "things to do" results.
const ATTRACTION_TYPES = new Set([
  'tourist_attraction',
  'museum',
  'art_gallery',
  'park',
  'zoo',
  'aquarium',
  'amusement_park',
  'historical_landmark',
  'natural_feature',
  'place_of_worship',
  'hindu_temple',
  'church',
  'mosque',
  'shrine',
  'national_park',
  'monument',
  'observation_deck',
  'planetarium',
  'beach',
  'hiking_area',
  'scenic_spot'
]);

const NOISE_TYPES = new Set([
  'lodging',
  'real_estate_agency',
  'gas_station',
  'atm',
  'bank',
  'pharmacy',
  'convenience_store',
  'parking',
  'storage'
]);

/**
 * Score = rating × log10(reviewCount + 1).
 * This balances quality (a 4.9 rating is meaningful) with popularity
 * (a place with 50,000 reviews is more "real" than one with 12), without
 * letting either dominate.
 */
function popularityScore(p) {
  const rating = p.rating ?? 0;
  const count = p.userRatingCount ?? 0;
  return rating * Math.log10(count + 1);
}

/**
 * Returns true if the place looks like a legitimate attraction worth
 * surfacing. Filters out noise, low-rated, and under-reviewed entries.
 */
function isWorthShowing(p, { minRating = 4.0, minReviews = 50 } = {}) {
  const types = p.types || [];
  if (types.some((t) => NOISE_TYPES.has(t))) return false;
  if ((p.rating ?? 0) < minRating) return false;
  if ((p.userRatingCount ?? 0) < minReviews) return false;
  return true;
}

/**
 * Map a raw Places API response to our app's POI / activity shape.
 */
function shapePlace(p) {
  const types = p.types || [];
  return {
    placeId: p.id,
    name: p.displayName?.text || 'Unnamed place',
    address: p.formattedAddress,
    lat: p.location?.latitude,
    lng: p.location?.longitude,
    rating: p.rating,
    reviewCount: p.userRatingCount ?? 0,
    types,
    summary: deriveSummaryFromTypes(types, p.displayName?.text || ''),
    estCost: estimateCost(types),
    estDuration: estimateDuration(types),
    photoUrl: p.photos?.[0]?.name
      ? `https://places.googleapis.com/v1/${p.photos[0].name}/media?maxHeightPx=400&maxWidthPx=600&key=${GOOGLE_MAPS_KEY}`
      : null
  };
}

// ---- Public: generic helper used by category fetchers ---------------------

/**
 * Shared search-rank-filter pipeline. Each category fetcher calls this with
 * a category-specific query and filter shape; the heavy lifting lives here.
 */
async function fetchAndRank({
  textQuery,
  lat,
  lng,
  radiusMeters = 20000,
  limit = 10,
  fetchCount = 20,
  filterOpts,
  customFilter
}) {
  const raw = await placesTextSearch({
    textQuery,
    lat,
    lng,
    radiusMeters,
    fetchCount
  });

  const filterFn = customFilter
    ? customFilter
    : (p) => isWorthShowing(p, filterOpts);

  const filtered = raw
    .filter(filterFn)
    .sort((a, b) => popularityScore(b) - popularityScore(a))
    .slice(0, limit)
    .map(shapePlace);

  // Fallback: if filters eliminated everything, drop them and just rank
  if (filtered.length === 0) {
    return raw
      .sort((a, b) => popularityScore(b) - popularityScore(a))
      .slice(0, limit)
      .map(shapePlace);
  }
  return filtered;
}

// ---- Public: fetch top POIs (used by Map widget for markers) --------------

export async function fetchTopPOIs({ destination, lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchAndRank({
    textQuery: `top tourist attractions in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.0, minReviews: 50 }
  });
}

// ---- Public: tab-specific fetchers ----------------------------------------

export async function fetchTopActivities({ destination, lat, lng, radiusMeters = 20000, limit = 5 }) {
  return fetchAndRank({
    textQuery: `things to do and activities in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.0, minReviews: 30 }
  });
}

export async function fetchTopRestaurants({ destination, lat, lng, radiusMeters = 20000, limit = 5 }) {
  return fetchAndRank({
    textQuery: `best restaurants in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.2, minReviews: 100 }
  });
}

export async function fetchTopNatureUnique({ destination, lat, lng, radiusMeters = 20000, limit = 5 }) {
  return fetchAndRank({
    textQuery: `natural attractions parks scenic spots and unique places in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.0, minReviews: 50 }
  });
}

/**
 * Top-rated hotels in the destination. Used by the Map widget as a separate
 * layer (toggleable) — NOT a tab. Hotels live exclusively on the map so
 * users can spatially evaluate "where should I stay relative to attractions?"
 *
 */
export async function fetchTopHotels({ destination, lat, lng, radiusMeters = 20000, limit = 5 }) {
  return fetchAndRank({
    textQuery: `top hotels in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    fetchCount: 20,
    customFilter: (p) => {
      const types = p.types || [];
      // Must actually be lodging — query alone surfaces "hotel restaurants"
      // and similar non-hotel results.
      const isLodging = types.some((t) =>
        ['lodging', 'hotel', 'resort_hotel', 'extended_stay_hotel'].includes(t)
      );
      if (!isLodging) return false;
      const rating = p.rating ?? 0;
      const reviews = p.userRatingCount ?? 0;
      return rating >= 4.0 && reviews >= 50;
    }
  });
}

/**
 * Hidden gems: high-rated places with moderate review counts (between 100 and
 * 2000 reviews). The lower bound filters out unverified noise; the upper
 * bound filters out the obvious top-of-mind spots that would already be in
 * the Activities tab.
 */
export async function fetchHiddenGems({ destination, lat, lng, radiusMeters = 20000, limit = 5 }) {
  return fetchAndRank({
    textQuery: `hidden gems and lesser-known places in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    fetchCount: 20,
    customFilter: (p) => {
      const types = p.types || [];
      if (types.some((t) => NOISE_TYPES.has(t))) return false;
      const rating = p.rating ?? 0;
      const reviews = p.userRatingCount ?? 0;
      return rating >= 4.5 && reviews >= 100 && reviews <= 2000;
    }
  });
}

// ---- Heuristics for activity metadata -------------------------------------

function estimateCost(types = []) {
  const t = new Set(types);
  if (t.has('park') || t.has('natural_feature') || t.has('hiking_area') || t.has('beach'))
    return 'Free';
  if (t.has('museum') || t.has('art_gallery') || t.has('zoo') || t.has('aquarium'))
    return '₹₹';
  if (t.has('amusement_park') || t.has('observation_deck')) return '₹₹₹';
  if (t.has('restaurant') || t.has('cafe') || t.has('bar')) return '₹₹';
  return '₹₹';
}

function estimateDuration(types = []) {
  const t = new Set(types);
  if (t.has('amusement_park') || t.has('zoo') || t.has('aquarium'))
    return 'Half day';
  if (t.has('museum') || t.has('art_gallery')) return '2-3 hrs';
  if (t.has('park') || t.has('hiking_area') || t.has('beach')) return '1-3 hrs';
  if (t.has('restaurant') || t.has('cafe') || t.has('bar')) return '1-2 hrs';
  return '2 hrs';
}

function deriveSummaryFromTypes(types, name) {
  if (!types?.length) return `Visit ${name}.`;
  const friendly = types
    .filter((t) => !['point_of_interest', 'establishment'].includes(t))
    .slice(0, 3)
    .map((t) => t.replace(/_/g, ' '))
    .join(' / ');
  return friendly ? `${friendly}` : `Visit ${name}.`;
}

/**
 * Build a "Get directions" Google Maps URL — opens in a new tab.
 */
export function directionsUrl({ lat, lng, name }) {
  const dest = encodeURIComponent(`${name} @${lat},${lng}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

// ---- Viewport-aware fetching with cache -----------------------------------
//
// When the user pans/zooms the map, we fetch places for the new viewport.
// Without caching this would mean Google API calls every interaction. With
// it, identical-or-similar viewports hit the cache and cost nothing.
//
// Cache key strategy: quantize (round) coordinates to ~1km buckets so that
// tiny pan deltas all hit the same bucket. TTL 10 min — long enough that
// re-pans feel snappy, short enough that "data freshness" stays believable.

// 7 days: panned-area place lists barely change (name/coords/rating are slow),
// and we no longer fetch live hours/open-now, so staleness is low-risk. A long
// window maximises cross-session reuse — each cache hit is one billed Places
// Search call avoided.
const VIEWPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const VIEWPORT_CACHE = loadCache('viewport', VIEWPORT_TTL_MS);
const persistViewport = makeSaver('viewport', { max: 100, getTime: (v) => v.time });
const COORD_BUCKET = 0.01; // ≈ 1.1 km at the equator

function quantize(n) {
  return Math.round(n / COORD_BUCKET) * COORD_BUCKET;
}

function viewportCacheKey({ lat, lng, radiusMeters, category, bounds, limit }) {
  const lim = Number.isFinite(limit) ? limit : 10;
  if (bounds) {
    // Rectangle-keyed: quantize corners to ~0.5km buckets so micro-jitter
    // (idle re-fires while map is settling) still hits the cache, but real
    // pans/zooms get a fresh key.
    const q = (n) => (Math.round(n / 0.005) * 0.005).toFixed(3);
    return `rect:${q(bounds.low.lat)},${q(bounds.low.lng)}:${q(bounds.high.lat)},${q(bounds.high.lng)}:${category}:${lim}`;
  }
  return `${quantize(lat).toFixed(2)}:${quantize(lng).toFixed(2)}:${radiusMeters}:${category}:${lim}`;
}

const CATEGORY_QUERIES = {
  activities: 'things to do and activities',
  restaurants: 'best restaurants',
  nature: 'natural attractions parks scenic spots and unique places',
  gems: 'hidden gems and lesser-known places',
  hotels: 'top rated hotels and resorts'
};

const CATEGORY_FILTERS = {
  activities: { minRating: 4.0, minReviews: 30 },
  restaurants: { minRating: 4.2, minReviews: 100 },
  nature: { minRating: 4.0, minReviews: 50 },
  gems: { minRating: 4.5, minReviews: 100, maxReviews: 2000 },
  hotels: { minRating: 4.0, minReviews: 50 }
};

/**
 * Fetch places for a viewport (lat/lng + radius) and category.
 * Cached, deduped, race-safe via a per-key in-flight Promise registry.
 */
const inFlight = new Map();

export async function fetchPlacesInViewport({
  lat,
  lng,
  radiusMeters = 5000,
  category = 'activities',
  limit = 10,
  bounds = null
}) {
  const key = viewportCacheKey({ lat, lng, radiusMeters, category, bounds, limit });
  const now = Date.now();

  // Cache hit
  const cached = VIEWPORT_CACHE.get(key);
  if (cached && now - cached.time < VIEWPORT_TTL_MS) {
    return cached.data;
  }

  // Already fetching the same key — share the promise (request dedup)
  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const query = CATEGORY_QUERIES[category] || CATEGORY_QUERIES.activities;
  const filterOpts = CATEGORY_FILTERS[category] || CATEGORY_FILTERS.activities;

  const promise = (async () => {
    try {
      const raw = await placesTextSearch({
        textQuery: query,
        lat,
        lng,
        radiusMeters,
        fetchCount: 20,
        bounds
      });

      const LODGING_TYPES = ['lodging', 'hotel', 'resort_hotel', 'extended_stay_hotel'];
      const customFilter = (p) => {
        const types = p.types || [];
        if (category === 'hotels') {
          if (!types.some((t) => LODGING_TYPES.includes(t))) return false;
        } else {
          if (types.some((t) => NOISE_TYPES.has(t))) return false;
        }
        const rating = p.rating ?? 0;
        const reviews = p.userRatingCount ?? 0;
        if (rating < filterOpts.minRating) return false;
        if (reviews < filterOpts.minReviews) return false;
        if (filterOpts.maxReviews && reviews > filterOpts.maxReviews) return false;
        return true;
      };

      const filtered = raw
        .filter(customFilter)
        .sort((a, b) => popularityScore(b) - popularityScore(a))
        .slice(0, limit)
        .map(shapePlace);

      const data = filtered.length
        ? filtered
        : raw
            .sort((a, b) => popularityScore(b) - popularityScore(a))
            .slice(0, limit)
            .map(shapePlace);

      VIEWPORT_CACHE.set(key, { data, time: Date.now() });
      // LRU eviction: keep cache bounded at 100 entries
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

/**
 * Convenience: fetch top places within `radiusKm` of a single point.
 * Used by hotel-click "show me what's near here" mode.
 */
export async function fetchPlacesNearPoint({
  lat,
  lng,
  radiusKm = 2,
  category = 'activities',
  limit = 10
}) {
  return fetchPlacesInViewport({
    lat,
    lng,
    radiusMeters: Math.round(radiusKm * 1000),
    category,
    limit
  });
}

/** Manually clear the viewport cache (e.g. on new search). */
export function clearViewportCache() {
  VIEWPORT_CACHE.clear();
  inFlight.clear();
  clearCache('viewport');
}

// ---- Places Autocomplete (New) -------------------------------------------

/**
 * Generate a session token for Autocomplete billing.
 * Per Google: "Session tokens group the query and selection phases of a user
 * autocomplete search into a discrete session for billing purposes." Tokens
 * are user-generated UUIDs; the same token across N autocomplete calls + the
 * eventual selection counts as ONE session, which is cheaper than per-request
 * billing.
 *
 * Generate a fresh token whenever the user starts a new search session
 * (e.g. focuses an empty input).
 */
export function newSessionToken() {
  // crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: not cryptographically strong but fine for session grouping
  return 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Fetch autocomplete predictions for a partial query.
 * Returns an array of suggestion objects, or [] on error/empty input.
 *
 * @param {string} input    - what the user has typed
 * @param {object} options  - { sessionToken, signal }
 *   sessionToken: required for proper billing grouping
 *   signal:       optional AbortSignal for cancelling in-flight requests
 *                 when the user types another keystroke
 */
export async function fetchPlacePredictions(input, { sessionToken, signal } = {}) {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_KEY
      },
      // Destination search = cities/regions only. `(regions)` is a single
      // allowed collection token (locality / admin areas / country), so it
      // doesn't hit the "mixed type tables → 400" problem that listing
      // individual types would. Keeps businesses/POIs out of the suggestions.
      body: JSON.stringify({
        input: trimmed,
        sessionToken,
        includedPrimaryTypes: ['(regions)']
      }),
      signal
    });

    if (!res.ok) {
      // Soft-fail: don't break typing if the API hiccups
      return [];
    }
    const data = await res.json();
    return (data.suggestions || [])
      .filter((s) => s.placePrediction)
      .map((s) => {
        const p = s.placePrediction;
        return {
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text || p.text?.text || '',
          secondaryText: p.structuredFormat?.secondaryText?.text || '',
          fullText: p.text?.text || '',
          types: p.types || []
        };
      });
  } catch (err) {
    if (err.name === 'AbortError') return [];
    console.warn('Autocomplete error:', err);
    return [];
  }
}
