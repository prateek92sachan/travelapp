// Provider routing layer. The map-data query hooks (useTabQuery /
// useNearbyQuery / useViewportQuery) and useTrip.search() call THESE functions
// instead of importing googleMaps directly, so the active map provider decides
// the data source at call time:
//
//   provider 'google'  -> Google Places (googleMaps)
//   provider 'mapbox'  -> Google Places (googleMaps)   [Mapbox renders, Google data]
//   provider 'tmap'    -> Mapbox Search Box (tmapService) — zero Google calls
//
// Query keys are tagged with activeDataSource() ('g' | 'mb') so Google-sourced
// and Mapbox-sourced caches never collide. 'google' and 'mapbox' share the 'g'
// tag, so toggling between them is free (no refetch); only 'tmap' uses 'mb'.

import { MAPBOX_TOKEN } from './config';
import { useMapStore } from '../stores/mapStore';
import * as google from './googleMaps';
import * as tmap from './tmapService';
import { geocodeDestination as geocodeDestinationMixed } from './locationService';
import { geocodeDestinationMapbox } from './mapboxSearch';

// Tmap is only "live" when a Mapbox token exists; otherwise MapWidget falls
// back to the Google renderer and we must serve Google data + the 'g' tag.
function isTmap() {
  return useMapStore.getState().mapProvider === 'tmap' && !!MAPBOX_TOKEN;
}

function svc() {
  return isTmap() ? tmap : google;
}

export function activeDataSource() {
  return isTmap() ? 'mb' : 'g';
}

export const fetchTopActivities = (args) => svc().fetchTopActivities(args);
export const fetchTopRestaurants = (args) => svc().fetchTopRestaurants(args);
export const fetchTopNatureUnique = (args) => svc().fetchTopNatureUnique(args);
export const fetchHiddenGems = (args) => svc().fetchHiddenGems(args);
export const fetchTopHotels = (args) => svc().fetchTopHotels(args);
export const fetchPlacesInViewport = (args) => svc().fetchPlacesInViewport(args);
export const fetchPlacesNearPoint = (args) => svc().fetchPlacesNearPoint(args);

// Destination geocode. Tmap stays pure Mapbox (no Google fallback); other
// providers use the existing Mapbox-first / Google-fallback dispatcher.
export async function geocodeDestination(destination) {
  if (isTmap()) {
    const mb = await geocodeDestinationMapbox(destination);
    if (!mb) throw new Error(`Could not locate "${destination}" on Mapbox.`);
    return mb;
  }
  return geocodeDestinationMixed(destination);
}

// Clear both providers' viewport caches so a new search never serves stale
// cross-provider data after a toggle.
export function clearViewportCache() {
  google.clearViewportCache();
  tmap.clearViewportCache();
}
