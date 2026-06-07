import { useCallback, useMemo } from 'react';
import { useTripSearch, useTripSearchHere } from '../../hooks/useTrip';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useTabQuery } from '../../hooks/queries/useTabQuery';
import { useViewportQuery } from '../../hooks/queries/useViewportQuery';
import { gridSpread } from './helpers';
import { GRID_CELLS } from './constants';

// Provider-agnostic data + callback assembly for map renderers.
// Returns everything a renderer needs to draw markers + wire actions, without
// touching any Google/Mapbox-specific APIs.
export function useMapData() {
  const selectPlace = useSearchStore((s) => s.selectPlace);
  const clearViewportItems = useMapStore((s) => s.clearViewportItems);
  const search = useTripSearch();
  const searchHere = useTripSearchHere();

  const loading = useSearchStore((s) => s.loading);
  const selectedPlaceId = useSearchStore((s) => s.selectedPlaceId);
  const viewportTarget = useMapStore((s) => s.viewportTarget);

  // Pin tap → highlight the matching drawer row + switch to that pin's
  // category tab. Does NOT open the detail card and does NOT pan the map
  // (the pin is already on screen). The user opens the detail card by then
  // tapping the highlighted row in the drawer.
  const onPinTap = useCallback(
    (poi, category) => {
      selectPlace(poi, category, { pan: false, openDetail: false });
    },
    [selectPlace]
  );

  const { data: tabActivities } = useTabQuery('activities');
  const { data: tabRestaurants } = useTabQuery('restaurants');
  const { data: tabNature } = useTabQuery('nature');
  const { data: tabGems } = useTabQuery('gems');
  const { data: tabHotels } = useTabQuery('hotels');
  const tabData = useMemo(
    () => ({
      activities: tabActivities ?? null,
      restaurants: tabRestaurants ?? null,
      nature: tabNature ?? null,
      gems: tabGems ?? null,
      hotels: tabHotels ?? null
    }),
    [tabActivities, tabRestaurants, tabNature, tabGems, tabHotels]
  );

  const { data: vpAct } = useViewportQuery({ target: viewportTarget, category: 'activities' });
  const { data: vpRest } = useViewportQuery({ target: viewportTarget, category: 'restaurants' });
  const { data: vpNat } = useViewportQuery({ target: viewportTarget, category: 'nature' });
  const { data: vpGems } = useViewportQuery({ target: viewportTarget, category: 'gems' });
  const { data: vpHotels } = useViewportQuery({ target: viewportTarget, category: 'hotels' });
  const viewportItems = useMemo(() => {
    if (!viewportTarget) return null;
    return {
      activities: vpAct ?? null,
      restaurants: vpRest ?? null,
      nature: vpNat ?? null,
      gems: vpGems ?? null,
      hotels: vpHotels ?? null
    };
  }, [viewportTarget, vpAct, vpRest, vpNat, vpGems, vpHotels]);

  // City-wide text search of the current map-center location's city/area.
  // Used as the fallback when the user is zoomed out past BOX_SEARCH_MIN_ZOOM.
  const cityWideSearch = useCallback(() => {
    const { placeArea, placeCity, destination } = useSearchStore.getState();
    const parts = [placeArea, placeCity].filter(Boolean);
    const override = parts.length ? parts.join(', ') : destination;
    if (!override) return;
    search({ destination: override });
  }, [search]);

  // Box search: search ONLY the supplied visible-viewport rectangle.
  // Reuses useTrip.searchHere (via the lightweight search context) for free
  // weather-target + city-label updates; falls back to refreshViewport if the
  // search context is unavailable.
  const boxSearchHere = useCallback(
    ({ lat, lng, bounds }) => {
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      if (searchHere) searchHere({ lat, lng, bounds });
      else useMapStore.getState().refreshViewport({ lat, lng, bounds });
    },
    [searchHere]
  );

  const actionsDisabled = loading;

  // Source priority: viewport (all cats) > city-wide tabData.
  // Declutter is centralized HERE so all renderers benefit and stop slicing:
  //  - viewport mode → grid-cap spread within the viewport bounds, capped at 5
  //  - city mode     → first 5
  const markersForCat = useCallback(
    (cat) => {
      if (viewportItems) {
        const items = viewportItems[cat] || [];
        const bounds = viewportTarget?.bounds;
        return bounds ? gridSpread(items, bounds, GRID_CELLS, 1, 5) : items.slice(0, 5);
      }
      return (tabData[cat] || []).slice(0, 5);
    },
    [viewportItems, viewportTarget, tabData]
  );

  return {
    loading,
    selectedPlaceId,
    viewportTarget,
    viewportItems,
    tabData,
    markersForCat,
    onPinTap,
    cityWideSearch,
    boxSearchHere,
    clearViewportItems,
    actionsDisabled
  };
}
