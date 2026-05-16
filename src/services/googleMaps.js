// Google Maps Platform service: geocoding + Places (New) Text Search.
// All calls go through the JS SDK once the map is loaded; geocoding uses REST.

import { GOOGLE_MAPS_KEY } from './config';

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

  const res = await fetch(url);
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
 */
async function placesTextSearch({ textQuery, lat, lng, radiusMeters, fetchCount }) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
      'X-Goog-FieldMask': PLACES_FIELD_MASK
    },
    body: JSON.stringify({
      textQuery,
      maxResultCount: fetchCount,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusMeters
        }
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Places API error ${res.status}: ${errText}`);
  }
  const data = await res.json();
  return data.places || [];
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

export async function fetchTopActivities({ destination, lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchAndRank({
    textQuery: `things to do and activities in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.0, minReviews: 30 }
  });
}

export async function fetchTopRestaurants({ destination, lat, lng, radiusMeters = 20000, limit = 10 }) {
  return fetchAndRank({
    textQuery: `best restaurants in ${destination}`,
    lat,
    lng,
    radiusMeters,
    limit,
    filterOpts: { minRating: 4.2, minReviews: 100 }
  });
}

export async function fetchTopNatureUnique({ destination, lat, lng, radiusMeters = 20000, limit = 10 }) {
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
 * Higher fetch limit (15) than other categories — map can comfortably
 * display more lodging markers without losing density.
 */
export async function fetchTopHotels({ destination, lat, lng, radiusMeters = 20000, limit = 15 }) {
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
export async function fetchHiddenGems({ destination, lat, lng, radiusMeters = 20000, limit = 10 }) {
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
    return '$$';
  if (t.has('amusement_park') || t.has('observation_deck')) return '$$$';
  if (t.has('restaurant') || t.has('cafe') || t.has('bar')) return '$$';
  return '$$';
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

// ---- Place Details (New) -------------------------------------------------

const PLACE_DETAILS_CACHE = new Map();
const detailsInFlight = new Map();

const PRICE_LEVEL_MAP = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$'
};

/**
 * Fetch rich details for a single place: hours, phone, website, reviews,
 * price level, editorial summary, and extra photos.
 * Results are cached for the session; concurrent calls for the same placeId
 * share one in-flight request instead of racing.
 */
export async function fetchPlaceDetails(placeId) {
  if (PLACE_DETAILS_CACHE.has(placeId)) return PLACE_DETAILS_CACHE.get(placeId);
  if (detailsInFlight.has(placeId)) return detailsInFlight.get(placeId);

  const fields = [
    'currentOpeningHours',
    'internationalPhoneNumber',
    'websiteUri',
    'reviews',
    'photos',
    'priceLevel',
    'editorialSummary'
  ].join(',');

  const promise = (async () => {
    try {
      const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
          'X-Goog-Api-Key': GOOGLE_MAPS_KEY,
          'X-Goog-FieldMask': fields
        }
      });

      if (!res.ok) throw new Error(`Place details ${res.status}`);
      const data = await res.json();

      const details = {
        openNow: data.currentOpeningHours?.openNow ?? null,
        weekdayHours: data.currentOpeningHours?.weekdayDescriptions || [],
        phone: data.internationalPhoneNumber || null,
        website: data.websiteUri || null,
        priceLevel: PRICE_LEVEL_MAP[data.priceLevel] || null,
        editorialSummary: data.editorialSummary?.text || null,
        reviews: (data.reviews || []).slice(0, 3).map((r) => ({
          author: r.authorAttribution?.displayName || 'Anonymous',
          rating: r.rating ?? null,
          text: r.text?.text || '',
          time: r.relativePublishTimeDescription || ''
        })),
        extraPhotos: (data.photos || []).slice(1, 4).map(
          (p) =>
            `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=400&maxWidthPx=600&key=${GOOGLE_MAPS_KEY}`
        )
      };

      PLACE_DETAILS_CACHE.set(placeId, details);
      return details;
    } finally {
      detailsInFlight.delete(placeId);
    }
  })();

  detailsInFlight.set(placeId, promise);
  return promise;
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

const VIEWPORT_CACHE = new Map();
const VIEWPORT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const COORD_BUCKET = 0.01; // ≈ 1.1 km at the equator

function quantize(n) {
  return Math.round(n / COORD_BUCKET) * COORD_BUCKET;
}

function viewportCacheKey({ lat, lng, radiusMeters, category }) {
  return `${quantize(lat).toFixed(2)}:${quantize(lng).toFixed(2)}:${radiusMeters}:${category}`;
}

const CATEGORY_QUERIES = {
  activities: 'things to do and activities',
  restaurants: 'best restaurants',
  nature: 'natural attractions parks scenic spots and unique places',
  gems: 'hidden gems and lesser-known places'
};

const CATEGORY_FILTERS = {
  activities: { minRating: 4.0, minReviews: 30 },
  restaurants: { minRating: 4.2, minReviews: 100 },
  nature: { minRating: 4.0, minReviews: 50 },
  gems: { minRating: 4.5, minReviews: 100, maxReviews: 2000 }
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
  limit = 10
}) {
  const key = viewportCacheKey({ lat, lng, radiusMeters, category });
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
        fetchCount: 20
      });

      const customFilter = (p) => {
        const types = p.types || [];
        if (types.some((t) => NOISE_TYPES.has(t))) return false;
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
      // NOTE: We deliberately omit `includedPrimaryTypes` here. Google Places
      // Autocomplete (New) requires all values to come from a single type
      // table (Table A or Table B). Mixing locality/country/tourist_attraction
      // returns HTTP 400 INVALID_ARGUMENT. Letting Google rank by relevance
      // gives the best results in practice.
      body: JSON.stringify({
        input: trimmed,
        sessionToken
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
