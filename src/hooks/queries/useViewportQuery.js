import { useQuery } from '@tanstack/react-query';
import { fetchPlacesInViewport } from '../../services/googleMaps';

export const VIEWPORT_CATEGORIES = ['activities', 'restaurants', 'nature', 'gems', 'hotels'];

export const viewportQueryKey = ({ target, category }) => [
  'viewport',
  target?.lat ?? null,
  target?.lng ?? null,
  target?.radiusMeters ?? null,
  category
];

export function useViewportQuery({ target, category }) {
  const enabled =
    !!target &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng) &&
    VIEWPORT_CATEGORIES.includes(category);
  return useQuery({
    queryKey: viewportQueryKey({ target, category }),
    queryFn: () =>
      fetchPlacesInViewport({
        lat: target.lat,
        lng: target.lng,
        radiusMeters: target.radiusMeters || 5000,
        category,
        bounds: target.bounds || null
      }),
    enabled
  });
}
