import { useQuery } from '@tanstack/react-query';
import { fetchPlacesNearPoint } from '../../services/googleMaps';

export const NEARBY_CATEGORIES = ['activities', 'restaurants', 'nature', 'gems'];

export const nearbyQueryKey = ({ anchor, category }) => [
  'nearby',
  anchor?.placeId ?? null,
  anchor?.lat ?? null,
  anchor?.lng ?? null,
  category
];

export function useNearbyQuery({ anchor, category }) {
  const enabled =
    !!anchor &&
    Number.isFinite(anchor.lat) &&
    Number.isFinite(anchor.lng) &&
    NEARBY_CATEGORIES.includes(category);
  return useQuery({
    queryKey: nearbyQueryKey({ anchor, category }),
    queryFn: () =>
      fetchPlacesNearPoint({
        lat: anchor.lat,
        lng: anchor.lng,
        radiusKm: 2,
        category
      }),
    enabled
  });
}
