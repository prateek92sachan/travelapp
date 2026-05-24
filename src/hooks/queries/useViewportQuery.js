import { useQuery } from '@tanstack/react-query';
import { fetchPlacesInViewport } from '../../services/googleMaps';
import { useMapStore } from '../../stores/mapStore';
import { useSearchStore } from '../../stores/searchStore';
import { queryClient } from '../../lib/queryClient';

export const VIEWPORT_CATEGORIES = ['activities', 'restaurants', 'nature', 'gems', 'hotels'];

export const viewportQueryKey = ({ target, category }) => [
  'viewport',
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
    queryFn: () =>
      fetchPlacesInViewport({
        lat: target.lat,
        lng: target.lng,
        radiusMeters: target.radiusMeters || 5000,
        category,
        bounds: target.bounds || null
      }),
    enabled,
    staleTime: Infinity
  });
}
