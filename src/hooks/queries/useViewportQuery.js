import { useQuery } from '@tanstack/react-query';
import { fetchPlacesInViewport, activeDataSource } from '../../services/placesProvider';
import { useMapStore } from '../../stores/mapStore';
import { useSearchStore } from '../../stores/searchStore';
import { queryClient } from '../../lib/queryClient';
import { backfillPhotosWithWiki } from '../../services/wikipedia';

export const VIEWPORT_CATEGORIES = ['activities', 'restaurants', 'nature', 'gems', 'hotels'];

export const viewportQueryKey = ({ target, category }) => [
  'viewport',
  activeDataSource(),
  target?.lat ?? null,
  target?.lng ?? null,
  target?.radiusMeters ?? null,
  category
];

// Gated by the same visibleCategories toggle that drives useTabQuery (Fix 3).
// Without this, panning the map fired all 5 category fetches per idle even
// though only ON-toggled categories were rendered.
export function useViewportQuery({ target, category }) {
  const visible = useMapStore((s) => s.visibleCategories?.[category]);
  const activeTab = useSearchStore((s) => s.activeTab);
  const destination = useSearchStore((s) => s.destination);
  const queryKey = viewportQueryKey({ target, category });
  const alreadyCached = !!queryClient.getQueryData(queryKey);
  const demanded = !!visible || activeTab === category || alreadyCached;
  const enabled =
    demanded &&
    !!target &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng) &&
    VIEWPORT_CATEGORIES.includes(category);
  return useQuery({
    queryKey,
    // Returns marker items immediately; backfills free Wikipedia photos for any
    // photoless place (Tmap/Mapbox data) in the background and writes the
    // result back into the same cache entry, so saving from a pin keeps a photo.
    queryFn: async () => {
      const items = await fetchPlacesInViewport({
        lat: target.lat,
        lng: target.lng,
        radiusMeters: target.radiusMeters || 5000,
        category,
        bounds: target.bounds || null
      });
      if (Array.isArray(items) && items.length) {
        backfillPhotosWithWiki(items, destination)
          .then((enriched) => {
            if (enriched !== items) queryClient.setQueryData(queryKey, enriched);
          })
          .catch((err) => console.warn('Wiki photo backfill failed:', err));
      }
      return items;
    },
    enabled,
    staleTime: Infinity
  });
}
