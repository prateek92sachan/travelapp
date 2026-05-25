import { useQuery } from '@tanstack/react-query';
import { fetchPlacesNearPoint, activeDataSource } from '../../services/placesProvider';
import { useMapStore } from '../../stores/mapStore';
import { useSearchStore } from '../../stores/searchStore';
import { queryClient } from '../../lib/queryClient';

export const NEARBY_CATEGORIES = ['activities', 'restaurants', 'nature', 'gems'];

export const nearbyQueryKey = ({ anchor, category }) => [
  'nearby',
  activeDataSource(),
  anchor?.placeId ?? null,
  anchor?.lat ?? null,
  anchor?.lng ?? null,
  category
];

// Gated by visibleCategories toggle (Fix 3) — same pattern as useTabQuery /
// useViewportQuery. When the user clicks a hotel to enter nearby-mode, only
// toggled-ON categories fire.
export function useNearbyQuery({ anchor, category }) {
  const visible = useMapStore((s) => s.visibleCategories?.[category]);
  const activeTab = useSearchStore((s) => s.activeTab);
  const queryKey = nearbyQueryKey({ anchor, category });
  const alreadyCached = !!queryClient.getQueryData(queryKey);
  const demanded = !!visible || activeTab === category || alreadyCached;
  const enabled =
    demanded &&
    !!anchor &&
    Number.isFinite(anchor.lat) &&
    Number.isFinite(anchor.lng) &&
    NEARBY_CATEGORIES.includes(category);
  return useQuery({
    queryKey,
    queryFn: () =>
      fetchPlacesNearPoint({
        lat: anchor.lat,
        lng: anchor.lng,
        radiusKm: 2,
        category
      }),
    enabled,
    staleTime: Infinity
  });
}
