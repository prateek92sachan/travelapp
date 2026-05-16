import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map, Marker, useMap } from '@vis.gl/react-google-maps';
import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { useTheme } from '../hooks/useTheme';
import MapControlsPanel from './MapControlsPanel';
import HotelInfoCard from './HotelInfoCard';
import { haversineKm } from '../utils/geo';

const PROXIMITY_KM = 2;
const VIEWPORT_DEBOUNCE_MS = 600;
// Don't auto-refresh unless the center moved at least this far. Prevents
// micro-movement spam when the user is just inspecting an area.
const VIEWPORT_MIN_MOVE_KM = 0.5;

export default function MapWidget() {
  const { coords, activeTabItems, hotels, hotelsOn, loading, mapType } = useTrip();

  return (
    <Card
      icon="🗺"
      title="Map"
      className="map-card"
      bodyClassName="no-pad"
      expandable={false}
      extraHeader={<ViewportRefreshIndicator />}
    >
      {loading && !coords ? (
        <div className="map-placeholder">Locating destination…</div>
      ) : !coords ? (
        <div className="map-placeholder">Search a destination to see the map.</div>
      ) : (
        <MapInner
          key={`${coords.lat.toFixed(4)}-${coords.lng.toFixed(4)}`}
          center={coords}
          markers={activeTabItems}
          hotels={hotelsOn ? hotels : []}
          mapType={mapType}
        />
      )}
    </Card>
  );
}

function MapInner({ center, markers, hotels, mapType }) {
  const { theme } = useTheme();
  const {
    selectedPlaceId,
    selectedHotelId,
    nearbyAnchor,
    selectPlace,
    selectHotel
  } = useTrip();

  // Anchor for proximity ring: prefer the active nearby anchor (if user is
  // exploring "near this hotel"), else the selected hotel by id.
  const anchorHotel = useMemo(() => {
    if (nearbyAnchor) return nearbyAnchor;
    return hotels.find((h) => h.placeId === selectedHotelId) || null;
  }, [nearbyAnchor, hotels, selectedHotelId]);

  return (
    <div className="map-container">
      <Map
        defaultCenter={{ lat: center.lat, lng: center.lng }}
        defaultZoom={12}
        mapTypeId={mapType}
        gestureHandling="greedy"
        disableDefaultUI={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        colorScheme={theme === 'dark' ? 'DARK' : 'LIGHT'}
        style={{ width: '100%', height: '100%' }}
      >
        <Marker
          position={{ lat: center.lat, lng: center.lng }}
          title={center.formattedAddress}
          label={{ text: '★', color: 'white', fontWeight: '700' }}
          zIndex={500}
        />

        {markers.slice(0, 10).map((poi, i) => (
          <MemoPOIMarker
            key={poi.placeId}
            poi={poi}
            index={i}
            anchor={anchorHotel}
            isSelected={selectedPlaceId === poi.placeId}
            onSelect={selectPlace}
          />
        ))}

        {hotels.map((hotel) => (
          <MemoHotelMarker
            key={hotel.placeId}
            hotel={hotel}
            isSelected={selectedHotelId === hotel.placeId}
            onSelect={selectHotel}
          />
        ))}

        <MapTypeSync mapType={mapType} />
        <CenterSync lat={center.lat} lng={center.lng} skip={!!nearbyAnchor} />
        <FocusListener />
        <TransitLayer />
        <ProximityRing center={anchorHotel} radiusKm={PROXIMITY_KM} />
        <ViewportWatcher centerLat={center.lat} centerLng={center.lng} />
      </Map>

      <MapControlsPanel />
      <NearbyModeIndicator />
      <HotelInfoCard />
    </div>
  );
}

// ---- Markers (memoized for performance) ----------------------------------

function POIMarker({ poi, index, anchor, isSelected, onSelect }) {
  const isOutsideRing = anchor ? haversineKm(anchor, poi) > PROXIMITY_KM : false;

  // Stable callback per render of THIS component. React.memo below skips
  // re-renders when props don't change shallowly.
  const onClick = useCallback(() => onSelect(poi), [onSelect, poi]);

  const icon = useMemo(
    () =>
      isSelected
        ? {
            path: 'M 0,0 m -14,0 a 14,14 0 1,0 28,0 a 14,14 0 1,0 -28,0',
            fillColor: '#ef4444',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 1
          }
        : undefined,
    [isSelected]
  );

  return (
    <Marker
      position={{ lat: poi.lat, lng: poi.lng }}
      title={`${index + 1}. ${poi.name}`}
      clickable
      onClick={onClick}
      opacity={isOutsideRing ? 0.35 : 1}
      label={{
        text: String(index + 1),
        color: 'white',
        fontWeight: '700',
        fontSize: '13px'
      }}
      icon={icon}
    />
  );
}

// Custom equality: only re-render the marker if its content changed.
// Without this, every map state change re-renders all 10+ markers.
const MemoPOIMarker = memo(POIMarker, (prev, next) => {
  return (
    prev.poi.placeId === next.poi.placeId &&
    prev.index === next.index &&
    prev.anchor?.placeId === next.anchor?.placeId &&
    prev.isSelected === next.isSelected &&
    prev.onSelect === next.onSelect
  );
});

function HotelMarker({ hotel, isSelected, onSelect }) {
  const onClick = useCallback(() => onSelect(hotel), [onSelect, hotel]);

  const icon = useMemo(
    () => ({
      path: 'M 0,0 m -11,0 a 11,11 0 1,0 22,0 a 11,11 0 1,0 -22,0',
      fillColor: isSelected ? '#0d9488' : '#14b8a6',
      fillOpacity: 1,
      strokeColor: '#ffffff',
      strokeWeight: 2,
      scale: 1
    }),
    [isSelected]
  );

  return (
    <Marker
      position={{ lat: hotel.lat, lng: hotel.lng }}
      title={hotel.name}
      clickable
      onClick={onClick}
      icon={icon}
      label={{ text: '🛏', fontSize: '11px' }}
      zIndex={isSelected ? 1000 : 100}
    />
  );
}

const MemoHotelMarker = memo(HotelMarker, (prev, next) => {
  return (
    prev.hotel.placeId === next.hotel.placeId &&
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

/**
 * Pans the map to lat/lng when those change.
 * `skip` prevents this from fighting with nearby-mode (where the user just
 * clicked a hotel and we don't want to jerk the map back to city center).
 */
function CenterSync({ lat, lng, skip }) {
  const map = useMap();
  useEffect(() => {
    if (!map || skip) return;
    map.panTo({ lat, lng });
    map.setZoom(12);
  }, [map, lat, lng, skip]);
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
      map.setZoom(15);
    };
    window.addEventListener('travelapp:focusLocation', onFocus);
    return () => window.removeEventListener('travelapp:focusLocation', onFocus);
  }, [map]);
  return null;
}

function TransitLayer() {
  const map = useMap();
  const { transitOn } = useTrip();
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

/**
 * Watches map idle events and triggers refreshViewport when the user has
 * actually moved meaningfully (debounced + min-move threshold).
 *
 * `idle` fires when pan/zoom settles — that's the right hook for "stopped
 * interacting." Listening to drag/zoom events directly would fire dozens
 * of times per gesture.
 */
function ViewportWatcher({ centerLat, centerLng }) {
  const map = useMap();
  const { refreshViewport, nearbyAnchor } = useTrip();
  const lastTriggeredRef = useRef(null);
  const debounceRef = useRef(null);
  const initialFireSkippedRef = useRef(false);

  // Mirror nearbyAnchor in a ref so the debounced timeout always reads the
  // CURRENT value, not the value captured when the timer was scheduled.
  // Without this, a pan-then-click-hotel sequence fires a stale viewport
  // refresh after entering nearby-mode.
  const nearbyAnchorRef = useRef(nearbyAnchor);
  useEffect(() => {
    nearbyAnchorRef.current = nearbyAnchor;
  }, [nearbyAnchor]);

  useEffect(() => {
    if (!map) return undefined;

    const handleIdle = () => {
      // Skip the very first idle (initial map render, not user interaction)
      if (!initialFireSkippedRef.current) {
        initialFireSkippedRef.current = true;
        return;
      }
      // Don't fight nearby-mode
      if (nearbyAnchorRef.current) return;

      const c = map.getCenter();
      if (!c) return;
      const next = { lat: c.lat(), lng: c.lng() };

      // Compute viewport radius from current bounds so the cache key
      // accounts for zoom level too.
      const bounds = map.getBounds();
      let radiusMeters = 5000;
      if (bounds) {
        const ne = bounds.getNorthEast();
        const sw = bounds.getSouthWest();
        const diagKm = haversineKm(
          { lat: ne.lat(), lng: ne.lng() },
          { lat: sw.lat(), lng: sw.lng() }
        );
        radiusMeters = Math.max(1500, Math.round((diagKm / 2) * 1000));
      }

      // Skip if user hasn't actually moved meaningfully
      const last = lastTriggeredRef.current;
      if (last) {
        const moved = haversineKm(last, next);
        if (moved < VIEWPORT_MIN_MOVE_KM) return;
      }

      // Debounce
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        // Re-check nearby-mode at fire time — user may have clicked a hotel
        // during the debounce window.
        if (nearbyAnchorRef.current) return;
        lastTriggeredRef.current = next;
        refreshViewport({ lat: next.lat, lng: next.lng, radiusMeters });
      }, VIEWPORT_DEBOUNCE_MS);
    };

    const listener = map.addListener('idle', handleIdle);
    return () => {
      if (listener && listener.remove) listener.remove();
      else if (window.google?.maps?.event && listener) {
        window.google.maps.event.removeListener(listener);
      }
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [map, refreshViewport]);

  // Reset position memory when the search destination changes — a new city
  // shouldn't inherit the old city's "we already triggered here" state.
  useEffect(() => {
    lastTriggeredRef.current = null;
    initialFireSkippedRef.current = false;
  }, [centerLat, centerLng]);

  return null;
}

// ---- Floating UI elements ------------------------------------------------

function NearbyModeIndicator() {
  const { nearbyAnchor, exitNearbyMode } = useTrip();
  if (!nearbyAnchor) return null;
  return (
    <button
      type="button"
      className="nearby-pill"
      onClick={exitNearbyMode}
      title="Show city-wide places again"
    >
      <span>← Showing places near {nearbyAnchor.name}</span>
      <span className="nearby-pill-x">✕</span>
    </button>
  );
}

function ViewportRefreshIndicator() {
  const { viewportLoading, viewportItems, clearViewportItems, nearbyAnchor } = useTrip();
  if (nearbyAnchor) return null;
  if (viewportLoading) {
    return <div className="viewport-pill loading">Updating area…</div>;
  }
  if (viewportItems) {
    return (
      <button
        type="button"
        className="viewport-pill clear"
        onClick={clearViewportItems}
        title="Restore the original city-wide list"
      >
        Reset to city view
      </button>
    );
  }
  return null;
}
