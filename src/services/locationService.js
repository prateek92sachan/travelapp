// Provider-agnostic location service. Mapbox first, Google as silent fallback
// for non-city queries; toast-notified fallback only on hard Mapbox errors.
//
// Public API matches googleMaps.js so consumers can swap imports 1:1.

import { toast } from 'sonner';
import {
  geocodeDestinationMapbox,
  reverseGeocodeCityMapbox,
  reverseGeocodePlaceNameMapbox,
  fetchPlacePredictionsMapbox,
  newSessionTokenMapbox
} from './mapboxSearch';
import {
  geocodeDestination as geocodeDestinationGoogle,
  reverseGeocodeCity as reverseGeocodeCityGoogle,
  reverseGeocodePlaceName as reverseGeocodePlaceNameGoogle,
  fetchPlacePredictions as fetchPlacePredictionsGoogle
} from './googleMaps';

// Dedupe fallback toasts during outage — every reverse-geocode pan would
// spam otherwise.
let lastToastAt = 0;
function notifyFallback(message) {
  const now = Date.now();
  if (now - lastToastAt < 8000) return;
  lastToastAt = now;
  toast(message, { duration: 3000 });
}

function isAbortError(err) {
  return err?.name === 'AbortError';
}

// ---- Forward geocode --------------------------------------------------------

export async function geocodeDestination(destination) {
  try {
    const mb = await geocodeDestinationMapbox(destination);
    if (mb) return mb;
    // Empty Mapbox result for restricted city types — likely a POI query
    // ("Eiffel Tower"). Silent fallback per user decision.
    return await geocodeDestinationGoogle(destination);
  } catch (err) {
    if (isAbortError(err)) throw err;
    console.warn('[locationService] Mapbox geocodeDestination failed, falling back to Google:', err);
    notifyFallback('Search using Google (Mapbox unavailable)');
    return await geocodeDestinationGoogle(destination);
  }
}

// ---- Reverse geocode --------------------------------------------------------

export async function reverseGeocodeCity(coords) {
  try {
    const v = await reverseGeocodeCityMapbox(coords);
    if (v !== null) return v;
    return await reverseGeocodeCityGoogle(coords);
  } catch (err) {
    if (isAbortError(err)) return null;
    console.warn('[locationService] Mapbox reverseGeocodeCity failed, falling back to Google:', err);
    notifyFallback('Location lookup using Google');
    return await reverseGeocodeCityGoogle(coords);
  }
}

export async function reverseGeocodePlaceName(coords) {
  try {
    const v = await reverseGeocodePlaceNameMapbox(coords);
    if (v !== null) return v;
    return await reverseGeocodePlaceNameGoogle(coords);
  } catch (err) {
    if (isAbortError(err)) return null;
    console.warn('[locationService] Mapbox reverseGeocodePlaceName failed, falling back to Google:', err);
    notifyFallback('Location lookup using Google');
    return await reverseGeocodePlaceNameGoogle(coords);
  }
}

// ---- Autocomplete -----------------------------------------------------------

export function newSessionToken() {
  return newSessionTokenMapbox();
}

export async function fetchPlacePredictions(input, opts) {
  try {
    const results = await fetchPlacePredictionsMapbox(input, opts);
    if (results.length === 0 && input?.trim()?.length >= 2) {
      // Mapbox returned no suggestions for a valid query. Google's autocomplete
      // is stronger on chains/brands — fall back silently.
      return await fetchPlacePredictionsGoogle(input, opts);
    }
    return results;
  } catch (err) {
    if (isAbortError(err)) return [];
    console.warn('[locationService] Mapbox fetchPlacePredictions failed, falling back to Google:', err);
    notifyFallback('Autocomplete using Google');
    return await fetchPlacePredictionsGoogle(input, opts);
  }
}
