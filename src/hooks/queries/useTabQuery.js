import { useQuery } from '@tanstack/react-query';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { queryClient } from '../../lib/queryClient';
import {
  fetchTopActivities,
  fetchTopRestaurants,
  fetchTopNatureUnique,
  fetchHiddenGems,
  fetchTopHotels,
  activeDataSource
} from '../../services/placesProvider';
import { enrichWithWiki } from '../../services/wikipedia';

export const TAB_KEYS = ['activities', 'restaurants', 'nature', 'gems', 'hotels'];

const TAB_FETCHERS = {
  activities: fetchTopActivities,
  restaurants: fetchTopRestaurants,
  nature: fetchTopNatureUnique,
  gems: fetchHiddenGems,
  hotels: fetchTopHotels
};

// `src` ('g' | 'mb') tags the data source so Google- and Mapbox-sourced caches
// never collide. 'tab' stays the first segment so removeQueries(['tab']) still
// clears every provider's tabs.
export const tabQueryKey = ({ tabKey, destination, lat, lng, radiusMeters }) =>
  ['tab', activeDataSource(), tabKey, destination, lat, lng, radiusMeters];

// Builds the queryFn for a tab. Returns initial items with photoUrl hidden
// (stashed as googlePhotoUrl) so the browser never fetches a billed Google
// Place Photo before Wikipedia enrichment has a chance to win. Wikipedia
// resolves in the background; whichever survives (Wiki thumbnail preferred,
// Google photo as fallback) lands via setQueryData and the card paints then.
//
// `hotels` skips enrichment entirely — no Wiki swap possible, so render the
// Google photo immediately (consistent with prior behavior).
export function buildTabQueryFn({ tabKey, destination, lat, lng, radiusMeters }) {
  return async () => {
    const fetcher = TAB_FETCHERS[tabKey];
    if (!fetcher) return [];
    const items = await fetcher({ destination, lat, lng, radiusMeters });
    if (tabKey === 'hotels' || !Array.isArray(items) || !items.length) {
      return items;
    }
    const stashed = items.map((p) => ({
      ...p,
      googlePhotoUrl: p.photoUrl,
      photoUrl: null
    }));
    const key = tabQueryKey({ tabKey, destination, lat, lng, radiusMeters });
    enrichWithWiki(stashed, destination)
      .then((enriched) => {
        // Only write back if the cache still holds the initial stashed
        // payload — otherwise a refetch or destination change has replaced
        // it and the enrichment would overwrite fresher data.
        if (queryClient.getQueryData(key) !== stashed) return;
        const final = enriched.map((p) => ({
          ...p,
          photoUrl: p.photoUrl || p.googlePhotoUrl
        }));
        queryClient.setQueryData(key, final);
      })
      .catch((err) => console.warn('Wiki enrich failed:', err));
    return stashed;
  };
}

// Tab query gating (Fix 3): fetches only when the tab is "demanded" by either
// (a) the active drawer tab, (b) the map category toggle being ON, or
// (c) cache already has data (we still want refetch/refresh behavior).
// This replaces the prior always-on prefetch of all 5 tabs that fired on
// every search.
export function useTabQuery(tabKey) {
  const destination = useSearchStore((s) => s.destination);
  const coords = useSearchStore((s) => s.coords);
  const radiusMeters = useSearchStore((s) => s.searchRadiusMeters);
  const activeTab = useSearchStore((s) => s.activeTab);
  const visible = useMapStore((s) => s.visibleCategories?.[tabKey]);
  const lat = coords?.lat;
  const lng = coords?.lng;
  const queryKey = tabQueryKey({ tabKey, destination, lat, lng, radiusMeters });
  const alreadyCached = !!queryClient.getQueryData(queryKey);
  const demanded = activeTab === tabKey || !!visible || alreadyCached;
  const enabled =
    demanded &&
    !!destination &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    TAB_KEYS.includes(tabKey);
  return useQuery({
    queryKey,
    queryFn: buildTabQueryFn({ tabKey, destination, lat, lng, radiusMeters }),
    enabled,
    // Once fetched, keep the data forever within the session — the cost
    // savings come from never re-fetching a tab the user already opened.
    staleTime: Infinity
  });
}
