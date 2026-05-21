import { useQuery } from '@tanstack/react-query';
import { useSearchStore } from '../../stores/searchStore';
import { queryClient } from '../../lib/queryClient';
import {
  fetchTopActivities,
  fetchTopRestaurants,
  fetchTopNatureUnique,
  fetchHiddenGems,
  fetchTopHotels
} from '../../services/googleMaps';
import { enrichWithWiki } from '../../services/wikipedia';

export const TAB_KEYS = ['activities', 'restaurants', 'nature', 'gems', 'hotels'];

const TAB_FETCHERS = {
  activities: fetchTopActivities,
  restaurants: fetchTopRestaurants,
  nature: fetchTopNatureUnique,
  gems: fetchHiddenGems,
  hotels: fetchTopHotels
};

export const tabQueryKey = ({ tabKey, destination, lat, lng, radiusMeters }) =>
  ['tab', tabKey, destination, lat, lng, radiusMeters];

// Builds the queryFn for a tab. Returns initial items immediately; fires
// Wikipedia enrichment in the background and writes the enriched result
// back into the same cache entry via setQueryData.
//
// `hotels` skips enrichment (matches prior behavior).
export function buildTabQueryFn({ tabKey, destination, lat, lng, radiusMeters }) {
  return async () => {
    const fetcher = TAB_FETCHERS[tabKey];
    if (!fetcher) return [];
    const items = await fetcher({ destination, lat, lng, radiusMeters });
    if (tabKey !== 'hotels' && Array.isArray(items) && items.length) {
      enrichWithWiki(items, destination)
        .then((enriched) => {
          queryClient.setQueryData(
            tabQueryKey({ tabKey, destination, lat, lng, radiusMeters }),
            enriched
          );
        })
        .catch((err) => console.warn('Wiki enrich failed:', err));
    }
    return items;
  };
}

export function useTabQuery(tabKey) {
  const destination = useSearchStore((s) => s.destination);
  const coords = useSearchStore((s) => s.coords);
  const radiusMeters = useSearchStore((s) => s.searchRadiusMeters);
  const lat = coords?.lat;
  const lng = coords?.lng;
  const enabled =
    !!destination &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    TAB_KEYS.includes(tabKey);
  return useQuery({
    queryKey: tabQueryKey({ tabKey, destination, lat, lng, radiusMeters }),
    queryFn: buildTabQueryFn({ tabKey, destination, lat, lng, radiusMeters }),
    enabled
  });
}
