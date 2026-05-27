import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Map } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from '../../services/config';
import { reverseGeocodePlaceName, reverseGeocodeCity } from '../../services/locationService';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useTheme } from '../../hooks/useTheme';
import MapControlsPanel from '../MapControlsPanel';
import { haversineKm } from '../../utils/geo';
import {
  CATEGORY_KEYS,
  VIEWPORT_DEBOUNCE_MS,
  VIEWPORT_MIN_MOVE_KM
} from './constants';
import { densestCentroid } from './helpers';
import { mapboxStyleFor, POIMarker } from './mapboxShared';
import MapFloatingHeader from './MapFloatingHeader';
import { useMapData } from './useMapData';

export default function MapboxMapInner({
  center, mapType, visibleCategories, toggleCategory
}) {
  const { theme } = useTheme();
  const mapRef = useRef(null);
  const {
    loading,
    selectedPlaceId,
    viewportItems,
    tabData,
    markersForCat,
    onPinTap,
    handleSearchHereClick,
    clearViewportItems,
    actionsDisabled
  } = useMapData();

  const transitOn = useMapStore((s) => s.transitOn);
  const setPlaceDisplay = useSearchStore((s) => s.setPlaceDisplay);

  const mapStyle = useMemo(() => mapboxStyleFor(mapType, theme), [mapType, theme]);

  function getMap() {
    return mapRef.current?.getMap?.() || null;
  }

  // ---- Center sync: pan on prop change + travelapp:panToCity event --------
  useEffect(() => {
    const map = getMap();
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], zoom: 12 });
  }, [center.lat, center.lng]);

  useEffect(() => {
    function onReset(e) {
      const { lat: rlat, lng: rlng } = e.detail || {};
      if (typeof rlat !== 'number') return;
      const map = getMap();
      if (!map) return;
      map.easeTo({ center: [rlng, rlat], zoom: 12 });
    }
    window.addEventListener('travelapp:panToCity', onReset);
    return () => window.removeEventListener('travelapp:panToCity', onReset);
  }, []);

  // ---- Focus listener: pan to a specific marker --------------------------
  useEffect(() => {
    function onFocus(e) {
      const { lat, lng } = e.detail || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const map = getMap();
      if (!map) return;
      map.easeTo({ center: [lng, lat] });
    }
    window.addEventListener('travelapp:focusLocation', onFocus);
    return () => window.removeEventListener('travelapp:focusLocation', onFocus);
  }, []);

  // ---- Density centering: fire once after pins resolve -------------------
  const densityFiredRef = useRef(false);
  useEffect(() => {
    if (densityFiredRef.current || viewportItems) return;
    const all = [];
    for (const cat of CATEGORY_KEYS) {
      const items = tabData?.[cat] || [];
      for (const p of items.slice(0, 7)) {
        if (typeof p.lat === 'number' && typeof p.lng === 'number') all.push(p);
      }
    }
    if (all.length < 3) return;
    const target = densestCentroid(all);
    if (!target) return;
    const map = getMap();
    if (!map) return;
    densityFiredRef.current = true;
    map.easeTo({ center: [target.lng, target.lat] });
  }, [tabData, viewportItems]);

  // Reset density + move trackers when search center changes.
  useEffect(() => {
    densityFiredRef.current = false;
  }, [center.lat, center.lng]);

  // ---- Style-bound layers: transit visibility --------------------------
  // Must re-apply after every style swap (style URL change blows away custom
  // layer state). The sync function is idempotent so it can run freely on
  // each styledata event.
  useEffect(() => {
    const map = getMap();
    if (!map) return;

    function apply() {
      if (!map.isStyleLoaded()) return;
      // Transit visibility: toggle Mapbox style's built-in transit layers.
      const style = map.getStyle();
      if (style?.layers) {
        for (const layer of style.layers) {
          const isTransit =
            layer['source-layer'] === 'transit' ||
            (typeof layer.id === 'string' && layer.id.includes('transit'));
          if (isTransit) {
            try {
              map.setLayoutProperty(
                layer.id,
                'visibility',
                transitOn ? 'visible' : 'none'
              );
            } catch {}
          }
        }
      }
    }

    apply();
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
    };
  }, [transitOn]);

  // ---- moveend watcher: reverse-geocode chip update only -----------------
  // Matches GoogleMapInner's SearchHereWatcher exactly: on every map settle
  // (after the first), reverse-geocode the centre to update the area/city
  // display chip. Does NOT trigger a Places API refetch — the user must
  // explicitly press "Search here" for that, just like the Google Maps version.
  const firstMoveSkippedRef = useRef(false);
  const lastSearchHereRef = useRef(null);
  const shDebRef = useRef(null);
  const shSeqRef = useRef(0);

  useEffect(() => {
    firstMoveSkippedRef.current = false;
    lastSearchHereRef.current = null;
  }, [center.lat, center.lng]);

  useEffect(() => {
    return () => {
      if (shDebRef.current) clearTimeout(shDebRef.current);
    };
  }, []);

  const handleMoveEnd = useCallback(() => {
    const map = getMap();
    if (!map) return;
    if (!firstMoveSkippedRef.current) {
      firstMoveSkippedRef.current = true;
      return;
    }

    const c = map.getCenter();
    const next = { lat: c.lat, lng: c.lng };

    const lastSh = lastSearchHereRef.current;
    if (lastSh && haversineKm(lastSh, next) < VIEWPORT_MIN_MOVE_KM) return;

    if (shDebRef.current) clearTimeout(shDebRef.current);
    shDebRef.current = setTimeout(async () => {
      lastSearchHereRef.current = next;
      const seq = ++shSeqRef.current;
      const [name, locality] = await Promise.all([
        reverseGeocodePlaceName({ lat: next.lat, lng: next.lng }).catch(() => null),
        reverseGeocodeCity({ lat: next.lat, lng: next.lng }).catch(() => null)
      ]);
      if (seq !== shSeqRef.current) return;
      if (!name && !locality) return;
      let area = name || locality || '';
      let city = '';
      if (name) {
        const parts = name.split(',').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
          area = parts[0];
          city = parts[1];
        } else if (parts.length === 1) {
          area = parts[0];
          if (locality && locality.toLowerCase() !== parts[0].toLowerCase()) {
            city = locality;
          }
        }
      }
      setPlaceDisplay({ area, city });
      // Sync wishlist ghost city + viewport city label on every pan
      if (locality) {
        const ws = useWishlistStore.getState();
        if (ws.ghostCity !== locality) ws.setGhostCity(locality);
        const ms = useMapStore.getState();
        if (ms.viewportCity !== locality) ms.setViewportCity(locality);
      }
    }, VIEWPORT_DEBOUNCE_MS);
  }, [setPlaceDisplay]);

  return (
    <div className="map-container">
      <MapFloatingHeader
        onSearchHere={handleSearchHereClick}
        onClearViewport={clearViewportItems}
        actionsDisabled={actionsDisabled}
        searchLoading={loading}
        visibleCategories={visibleCategories}
        onToggleCategory={toggleCategory}
      />
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        initialViewState={{ longitude: center.lng, latitude: center.lat, zoom: 12 }}
        mapStyle={mapStyle}
        onMoveEnd={handleMoveEnd}
        style={{ width: '100%', height: '100%' }}
      >
        {CATEGORY_KEYS.map((cat) =>
          visibleCategories[cat]
            ? markersForCat(cat).slice(0, 7).map((poi, i) => (
                <POIMarker
                  key={poi.placeId}
                  poi={poi}
                  index={i}
                  category={cat}
                  isSelected={selectedPlaceId === poi.placeId}
                  onSelect={onPinTap}
                />
              ))
            : null
        )}
      </Map>
      <MapControlsPanel />
    </div>
  );
}
