// Ranking, filtering, and shaping for raw Places (New) results.

import { GOOGLE_MAPS_KEY } from './config';

export const NOISE_TYPES = new Set([
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
export function popularityScore(p) {
  const rating = p.rating ?? 0;
  const count = p.userRatingCount ?? 0;
  return rating * Math.log10(count + 1);
}

/**
 * Returns true if the place looks like a legitimate attraction worth
 * surfacing. Filters out noise, low-rated, and under-reviewed entries.
 */
export function isWorthShowing(p, { minRating = 4.0, minReviews = 50 } = {}) {
  const types = p.types || [];
  if (types.some((t) => NOISE_TYPES.has(t))) return false;
  if ((p.rating ?? 0) < minRating) return false;
  if ((p.userRatingCount ?? 0) < minReviews) return false;
  return true;
}

/**
 * Map a raw Places API response to our app's POI / activity shape.
 */
export function shapePlace(p) {
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
