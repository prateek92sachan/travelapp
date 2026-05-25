// Tmap renderer — a Mapbox GL map whose POI data is sourced entirely from
// Mapbox (via placesProvider, which routes to tmapService when the provider is
// 'tmap'). Structurally a sibling of MapboxMapInner; the deliberate difference
// is that pan reverse-geocoding here calls the Mapbox geocoder directly (no
// Google fallback) so Tmap stays 100% Google-free.

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Map } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from '../../services/config';
import {
  reverseGeocodePlaceNameMapbox,
  reverseGeocodeCityMapbox
} from '../../services/mapboxSearch';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useTheme } from '../../hooks/useTheme';
import MapControlsPanel from '../MapControlsPanel';
import HotelInfoCard from '../HotelInfoCard';
import { haversineKm } from '../../utils/geo';
import {
  CATEGORY_KEYS,
  PROXIMITY_KM,
  VIEWPORT_DEBOUNCE_MS,
  VIEWPORT_MIN_MOVE_KM
} from './constants';
import { densestCentroid, geodesicCirclePolygon } from './helpers';
import { mapboxStyleFor, POIMarker } from './mapboxShared';
import MapFloatingHeader from './MapFloatingHeader';
import NearbyModeIndicator from './NearbyModeIndicator';
import { useMapData } from './useMapData';

export default function TmapMapInner({
  center, mapType, visibleCategories, toggleCategory
}) {
  const { theme } = useTheme();
  const mapRef = useRef(null);
  const {
    loading,
    selectedPlaceId,
    nearbyAnchor,
    viewportItems,
    tabData,
    anchorHotel,
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
    if (nearbyAnchor) return;
    const map = getMap();
    if (!map) return;
    map.easeTo({ center: [center.lng, center.lat], zoom: 12 });
  }, [center.lat, center.lng, nearbyAnchor]);

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
    if (densityFiredRef.current || nearbyAnchor || viewportItems) return;
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
  }, [tabData, nearbyAnchor, viewportItems]);

  useEffect(() => {
    densityFiredRef.current = false;
  }, [center.lat, center.lng]);

  // ---- Proximity ring: pan + zoom on anchor change ----------------------
  useEffect(() => {
    if (!anchorHotel) return;
    const map = getMap();
    if (!map) return;
    map.easeTo({ center: [anchorHotel.lng, anchorHotel.lat] });
    if (map.getZoom() < 13) map.setZoom(13);
  }, [anchorHotel?.placeId]);

  // ---- Style-bound layers: transit visibility + proximity ring ----------
  // Re-applied on every styledata event (style swaps drop custom sources).
  useEffect(() => {
    const map = getMap();
    if (!map) return;

    const RING_SRC = 'travelapp-proximity-ring';
    const RING_FILL = 'travelapp-proximity-ring-fill';
    const RING_LINE = 'travelapp-proximity-ring-line';

    function apply() {
      if (!map.isStyleLoaded()) return;

      const style = map.getStyle();
      if (style?.layers) {
        for (const layer of style.layers) {
          const isTransit =
            layer['source-layer'] === 'transit' ||
            (typeof layer.id === 'string' && layer.id.includes('transit'));
          if (isTransit) {
            try {
              map.setLayoutProperty(layer.id, 'visibility', transitOn ? 'visible' : 'none');
            } catch {}
          }
        }
      }

      if (anchorHotel && Number.isFinite(anchorHotel.lat) && Number.isFinite(anchorHotel.lng)) {
        const polygon = geodesicCirclePolygon(
          { lat: anchorHotel.lat, lng: anchorHotel.lng },
          PROXIMITY_KM
        );
        const data = { type: 'Feature', geometry: polygon, properties: {} };
        const src = map.getSource(RING_SRC);
        if (!src) {
          map.addSource(RING_SRC, { type: 'geojson', data });
        } else {
          src.setData(data);
        }
        if (!map.getLayer(RING_FILL)) {
          map.addLayer({
            id: RING_FILL,
            type: 'fill',
            source: RING_SRC,
            paint: { 'fill-color': '#14b8a6', 'fill-opacity': 0.08 }
          });
        }
        if (!map.getLayer(RING_LINE)) {
          map.addLayer({
            id: RING_LINE,
            type: 'line',
            source: RING_SRC,
            paint: { 'line-color': '#14b8a6', 'line-width': 2, 'line-opacity': 0.8 }
          });
        }
      } else {
        if (map.getLayer(RING_FILL)) map.removeLayer(RING_FILL);
        if (map.getLayer(RING_LINE)) map.removeLayer(RING_LINE);
        if (map.getSource(RING_SRC)) map.removeSource(RING_SRC);
      }
    }

    apply();
    map.on('styledata', apply);
    return () => {
      map.off('styledata', apply);
    };
  }, [transitOn, anchorHotel?.placeId, anchorHotel?.lat, anchorHotel?.lng]);

  // ---- moveend watcher: reverse-geocode chip update only -----------------
  // Pure Mapbox geocoder (no Google fallback) — the whole point of Tmap. Only
  // updates the area/city display chip + ghost/viewport city; does NOT refetch
  // places (user must press "Search here").
  const firstMoveSkippedRef = useRef(false);
  const lastSearchHereRef = useRef(null);
  const shDebRef = useRef(null);
  const shSeqRef = useRef(0);
  const nearbyRef = useRef(nearbyAnchor);
  useEffect(() => { nearbyRef.current = nearbyAnchor; }, [nearbyAnchor]);

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
    if (nearbyRef.current) return;

    const c = map.getCenter();
    const next = { lat: c.lat, lng: c.lng };

    const lastSh = lastSearchHereRef.current;
    if (lastSh && haversineKm(lastSh, next) < VIEWPORT_MIN_MOVE_KM) return;

    if (shDebRef.current) clearTimeout(shDebRef.current);
    shDebRef.current = setTimeout(async () => {
      if (nearbyRef.current) return;
      lastSearchHereRef.current = next;
      const seq = ++shSeqRef.current;
      const [name, locality] = await Promise.all([
        reverseGeocodePlaceNameMapbox({ lat: next.lat, lng: next.lng }).catch(() => null),
        reverseGeocodeCityMapbox({ lat: next.lat, lng: next.lng }).catch(() => null)
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
        nearbyAnchor={nearbyAnchor}
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
                  anchor={anchorHotel}
                  isSelected={selectedPlaceId === poi.placeId}
                  onSelect={onPinTap}
                />
              ))
            : null
        )}
      </Map>
      <MapControlsPanel />
      <NearbyModeIndicator />
      <HotelInfoCard />
    </div>
  );
}
