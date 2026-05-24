import { memo, useCallback, useEffect, useRef } from 'react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_MAP_ID } from '../../services/config';
import { reverseGeocodePlaceName, reverseGeocodeCity } from '../../services/googleMaps';
import { useSearchStore } from '../../stores/searchStore';
import { useMapStore } from '../../stores/mapStore';
import { useWishlistStore } from '../../stores/wishlistStore';
import { useTheme } from '../../hooks/useTheme';
import MapControlsPanel from '../MapControlsPanel';
import HotelInfoCard from '../HotelInfoCard';
import { haversineKm } from '../../utils/geo';
import {
  CATEGORY_CONFIG,
  CATEGORY_KEYS,
  PROXIMITY_KM,
  VIEWPORT_DEBOUNCE_MS,
  VIEWPORT_MIN_MOVE_KM
} from './constants';
import { densestCentroid } from './helpers';
import MapFloatingHeader from './MapFloatingHeader';
import NearbyModeIndicator from './NearbyModeIndicator';
import { useMapData } from './useMapData';

export default function GoogleMapInner({
  center, mapType, visibleCategories, toggleCategory, controlsOpen, onToggleControls
}) {
  const { theme } = useTheme();
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
        controlsOpen={controlsOpen}
        onToggleControls={onToggleControls}
      />
      <Map
        defaultCenter={{ lat: center.lat, lng: center.lng }}
        defaultZoom={12}
        mapTypeId={mapType}
        mapId={GOOGLE_MAPS_MAP_ID || undefined}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
        style={{ width: '100%', height: '100%' }}
      >
        {CATEGORY_KEYS.map((cat) =>
          visibleCategories[cat]
            ? markersForCat(cat).slice(0, 7).map((poi, i) => (
                <MemoPOIMarker
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

        <MapTypeSync mapType={mapType} />
        <CenterSync lat={center.lat} lng={center.lng} skip={!!nearbyAnchor} />
        <DensityCentering tabData={tabData} skip={!!nearbyAnchor || !!viewportItems} />
        <FocusListener />
        <TransitLayer />
        <ProximityRing center={anchorHotel} radiusKm={PROXIMITY_KM} />
        <SearchHereWatcher skip={!!nearbyAnchor} />
      </Map>

      <MapControlsPanel open={controlsOpen} onToggle={onToggleControls} />
      <NearbyModeIndicator />
      <HotelInfoCard />
    </div>
  );
}

// ---- Markers (memoized for performance) ----------------------------------

function POIMarker({ poi, index, anchor, isSelected, onSelect, category }) {
  const isOutsideRing = anchor ? haversineKm(anchor, poi) > PROXIMITY_KM : false;
  const color = CATEGORY_CONFIG[category]?.color || '#ef4444';
  const onClick = useCallback(() => onSelect(poi, category), [onSelect, poi, category]);

  return (
    <AdvancedMarker
      position={{ lat: poi.lat, lng: poi.lng }}
      title={`${index + 1}. ${poi.name}`}
      onClick={onClick}
      zIndex={isSelected ? 200 : 10}
    >
      <div
        className={`map-marker-poi${isSelected ? ' selected' : ''}`}
        style={{
          background: color,
          opacity: isOutsideRing ? 0.35 : 1,
          boxShadow: isSelected
            ? `0 0 0 3px white, 0 0 0 5px ${color}`
            : '0 1px 4px rgba(0,0,0,0.4)'
        }}
      >
        {index + 1}
      </div>
    </AdvancedMarker>
  );
}

const MemoPOIMarker = memo(POIMarker, (prev, next) => {
  return (
    prev.poi.placeId === next.poi.placeId &&
    prev.index === next.index &&
    prev.category === next.category &&
    prev.anchor?.placeId === next.anchor?.placeId &&
    prev.isSelected === next.isSelected &&
    prev.onSelect === next.onSelect
  );
});

// ---- Imperative helpers (mounted inside <Map>) ---------------------------

function MapTypeSync({ mapType }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(mapType);
  }, [map, mapType]);
  return null;
}

function CenterSync({ lat, lng, skip }) {
  const map = useMap();
  useEffect(() => {
    if (!map || skip) return;
    map.panTo({ lat, lng });
    map.setZoom(12);
  }, [map, lat, lng, skip]);

  useEffect(() => {
    if (!map) return;
    function onReset(e) {
      const { lat: rlat, lng: rlng } = e.detail || {};
      if (typeof rlat !== 'number') return;
      map.panTo({ lat: rlat, lng: rlng });
      map.setZoom(12);
    }
    window.addEventListener('travelapp:panToCity', onReset);
    return () => window.removeEventListener('travelapp:panToCity', onReset);
  }, [map]);

  return null;
}

function DensityCentering({ tabData, skip }) {
  const map = useMap();
  const firedRef = useRef(false);
  useEffect(() => {
    if (!map || skip || firedRef.current) return;
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
    firedRef.current = true;
    map.panTo(target);
  }, [map, tabData, skip]);
  return null;
}

function FocusListener() {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const onFocus = (e) => {
      const { lat, lng } = e.detail || {};
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      map.panTo({ lat, lng });
    };
    window.addEventListener('travelapp:focusLocation', onFocus);
    return () => window.removeEventListener('travelapp:focusLocation', onFocus);
  }, [map]);
  return null;
}

function TransitLayer() {
  const map = useMap();
  const transitOn = useMapStore((s) => s.transitOn);
  useEffect(() => {
    if (!map || !window.google?.maps?.TransitLayer) return;
    if (!transitOn) return undefined;
    const layer = new window.google.maps.TransitLayer();
    layer.setMap(map);
    return () => layer.setMap(null);
  }, [map, transitOn]);
  return null;
}

function ProximityRing({ center, radiusKm }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !center || !window.google?.maps?.Circle) return undefined;
    const circle = new window.google.maps.Circle({
      map,
      center: { lat: center.lat, lng: center.lng },
      radius: radiusKm * 1000,
      strokeColor: '#14b8a6',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#14b8a6',
      fillOpacity: 0.08,
      clickable: false
    });
    map.panTo({ lat: center.lat, lng: center.lng });
    if (map.getZoom() < 13) map.setZoom(13);
    return () => circle.setMap(null);
  }, [map, center, radiusKm]);
  return null;
}

// ---- Search-here watcher (mounted inside <Map>) -------------------------
// On every map idle (after the first), reverse-geocode the current map center
// to a neighborhood/city name and update placeArea/placeCity. Does NOT write
// to `destination` — that would trigger a tab refetch on every pan.
function SearchHereWatcher({ skip }) {
  const map = useMap();
  const firstIdleSkippedRef = useRef(false);
  const requestSeqRef = useRef(0);
  const skipRef = useRef(skip);
  const debounceRef = useRef(null);
  const lastResolvedRef = useRef(null);
  const setPlaceDisplay = useSearchStore((s) => s.setPlaceDisplay);
  useEffect(() => { skipRef.current = skip; }, [skip]);

  useEffect(() => {
    if (!map) return undefined;

    const handleIdle = () => {
      if (!firstIdleSkippedRef.current) {
        firstIdleSkippedRef.current = true;
        return;
      }
      if (skipRef.current) return;

      const c = map.getCenter();
      if (!c) return;
      const next = { lat: c.lat(), lng: c.lng() };

      const last = lastResolvedRef.current;
      if (last && haversineKm(last, next) < VIEWPORT_MIN_MOVE_KM) return;

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        if (skipRef.current) return;
        lastResolvedRef.current = next;
        const { lat, lng } = next;

        const seq = ++requestSeqRef.current;
        const [name, locality] = await Promise.all([
          reverseGeocodePlaceName({ lat, lng }).catch(() => null),
          reverseGeocodeCity({ lat, lng }).catch(() => null)
        ]);
        if (seq !== requestSeqRef.current) return;
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
    };

    const listener = map.addListener('idle', handleIdle);
    return () => {
      if (listener?.remove) listener.remove();
      else if (window.google?.maps?.event) window.google.maps.event.removeListener(listener);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [map, setPlaceDisplay]);

  return null;
}
