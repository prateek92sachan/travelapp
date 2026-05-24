import { useCallback, useMemo } from 'react';
import { reverseGeocodeCity } from '../../services/locationService';
import { useTrip } from '../../hooks/useTrip';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useTabQuery } from '../../hooks/queries/useTabQuery';
import { useNearbyQuery } from '../../hooks/queries/useNearbyQuery';
import { useViewportQuery } from '../../hooks/queries/useViewportQuery';

// Provider-agnostic data + callback assembly for map renderers.
// Returns everything a renderer needs to draw markers + wire actions, without
// touching any Google/Mapbox-specific APIs.
export function useMapData() {
  const { selectPlace, clearViewportItems, search } = useTrip();

  const loading = useSearchStore((s) => s.loading);
  const selectedPlaceId = useSearchStore((s) => s.selectedPlaceId);
  const nearbyAnchor = useMapStore((s) => s.nearbyAnchor);
  const selectedHotelId = useMapStore((s) => s.selectedHotelId);
  const viewportTarget = useMapStore((s) => s.viewportTarget);

  // Pin tap → full city navigation for the pin's locality.
  //   1. selectPlace: opens detail card + dispatches map focus event.
  //   2. reverseGeocodeCity: resolves pin's city.
  //   3. Instant UI sync: ghostCity (wishlist chip) + viewportCity (Save label).
  //   4. search(): refetches tabs + weather + events for the new city.
  //      - skipRecents: pin taps don't pollute the recents list.
  //      - preserveSelection: keep the tapped place + its category tab active.
  const onPinTap = useCallback(
    (poi, category) => {
      selectPlace(poi, category);
      if (!Number.isFinite(poi?.lat) || !Number.isFinite(poi?.lng)) return;
      reverseGeocodeCity({ lat: poi.lat, lng: poi.lng })
        .then((city) => {
          if (!city) return;
          const wishlistStore = useWishlistStore.getState();
          if (wishlistStore.ghostCity !== city) wishlistStore.setGhostCity(city);
          const mapStore = useMapStore.getState();
          if (mapStore.viewportCity !== city) mapStore.setViewportCity(city);
          const searchSnap = useSearchStore.getState();
          if (searchSnap.destination !== city) {
            search({ destination: city, skipRecents: true, preserveSelection: true });
          }
        })
        .catch(() => {});
    },
    [selectPlace, search]
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

  const { data: nearbyAct } = useNearbyQuery({ anchor: nearbyAnchor, category: 'activities' });
  const { data: nearbyRest } = useNearbyQuery({ anchor: nearbyAnchor, category: 'restaurants' });
  const { data: nearbyNat } = useNearbyQuery({ anchor: nearbyAnchor, category: 'nature' });
  const { data: nearbyGems } = useNearbyQuery({ anchor: nearbyAnchor, category: 'gems' });
  const nearbyItems = useMemo(
    () => ({
      activities: nearbyAct ?? null,
      restaurants: nearbyRest ?? null,
      nature: nearbyNat ?? null,
      gems: nearbyGems ?? null
    }),
    [nearbyAct, nearbyRest, nearbyNat, nearbyGems]
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

  // Click "Search here" → search the current map-center location.
  const handleSearchHereClick = useCallback(() => {
    const { placeArea, placeCity, destination } = useSearchStore.getState();
    const parts = [placeArea, placeCity].filter(Boolean);
    const override = parts.length ? parts.join(', ') : destination;
    if (!override) return;
    search({ destination: override });
  }, [search]);

  const actionsDisabled = loading || !!nearbyAnchor;

  const anchorHotel = useMemo(() => {
    if (nearbyAnchor) return nearbyAnchor;
    return tabData.hotels?.find((h) => h.placeId === selectedHotelId) || null;
  }, [nearbyAnchor, tabData.hotels, selectedHotelId]);

  // Source priority: nearby > viewport (all 4 cats) > city-wide tabData
  const markersForCat = useCallback(
    (cat) => {
      if (nearbyAnchor) return nearbyItems[cat] || [];
      if (viewportItems) return viewportItems[cat] || [];
      return tabData[cat] || [];
    },
    [nearbyAnchor, nearbyItems, viewportItems, tabData]
  );

  return {
    loading,
    selectedPlaceId,
    nearbyAnchor,
    viewportTarget,
    viewportItems,
    tabData,
    anchorHotel,
    markersForCat,
    onPinTap,
    handleSearchHereClick,
    clearViewportItems,
    actionsDisabled
  };
}
