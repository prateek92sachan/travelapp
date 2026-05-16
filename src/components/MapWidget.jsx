import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Utensils, Leaf, Gem, Settings } from 'lucide-react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_MAP_ID } from '../services/config';
import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { useTheme } from '../hooks/useTheme';
import MapControlsPanel from './MapControlsPanel';
import HotelInfoCard from './HotelInfoCard';
import { haversineKm } from '../utils/geo';

const PROXIMITY_KM = 2;
const VIEWPORT_DEBOUNCE_MS = 600;
const VIEWPORT_MIN_MOVE_KM = 0.5;

// Category metadata — colors match the tab icons in PlacesDrawer / TabbedPlacesWidget
const CATEGORY_CONFIG = {
  activities:  { color: '#f97316', label: 'Activities',  Icon: Compass  },
  restaurants: { color: '#ef4444', label: 'Restaurants', Icon: Utensils },
  nature:      { color: '#22c55e', label: 'Nature',      Icon: Leaf     },
  gems:        { color: '#6366f1', label: 'Hidden gems', Icon: Gem      },
};
const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG);

export default function MapWidget() {
  const { coords, hotels, hotelsOn, loading, mapType } = useTrip();

  const [visibleCategories, setVisibleCategories] = useState({
    activities: true,
    restaurants: true,
    nature: true,
    gems: true
  });
  const [controlsOpen, setControlsOpen] = useState(false);

  const toggleCategory = useCallback((cat) => {
    setVisibleCategories((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);
  const toggleControls = useCallback(() => setControlsOpen((o) => !o), []);

  useEffect(() => {
    if (!controlsOpen) return;
    function handlePointerDown(e) {
      if (e.target.closest('.map-controls') || e.target.closest('.map-gear-btn')) return;
      setControlsOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [controlsOpen]);

  return (
    <Card className="map-card" bodyClassName="no-pad" expandable={false}>
      {loading && !coords ? (
        <div className="map-placeholder">Locating destination…</div>
      ) : !coords ? (
        <div className="map-placeholder">Search a destination to see the map.</div>
      ) : (
        <MapInner
          key={`${coords.lat.toFixed(4)}-${coords.lng.toFixed(4)}`}
          center={coords}
          hotels={hotelsOn ? hotels : []}
          mapType={mapType}
          visibleCategories={visibleCategories}
          toggleCategory={toggleCategory}
          controlsOpen={controlsOpen}
          onToggleControls={toggleControls}
        />
      )}
    </Card>
  );
}

function MapInner({ center, hotels, mapType, visibleCategories, toggleCategory, controlsOpen, onToggleControls }) {
  const { theme } = useTheme();
  const {
    tabData,
    nearbyItems,
    nearbyAnchor,
    selectedPlaceId,
    selectedHotelId,
    selectPlace,
    selectHotel
  } = useTrip();

  const anchorHotel = useMemo(() => {
    if (nearbyAnchor) return nearbyAnchor;
    return hotels.find((h) => h.placeId === selectedHotelId) || null;
  }, [nearbyAnchor, hotels, selectedHotelId]);

  // Source for each category: nearby-mode overrides city-wide data
  const markersForCat = useCallback(
    (cat) => (nearbyAnchor ? nearbyItems[cat] : tabData[cat]) || [],
    [nearbyAnchor, nearbyItems, tabData]
  );

  return (
    <div className="map-container">
      <MapFloatingHeader
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
        <AdvancedMarker
          position={{ lat: center.lat, lng: center.lng }}
          title={center.formattedAddress}
          zIndex={500}
        >
          <div className="map-marker-center">★</div>
        </AdvancedMarker>

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
                  onSelect={selectPlace}
                />
              ))
            : null
        )}

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

      <MapControlsPanel open={controlsOpen} onToggle={onToggleControls} />
      <NearbyModeIndicator />
      <HotelInfoCard />
    </div>
  );
}

// ---- Floating header (rendered inside map-container for reliable painting) ---

function MapFloatingHeader({ visibleCategories, onToggleCategory, controlsOpen, onToggleControls }) {
  return (
    <div className="map-floating-header">
      <div className="map-floating-title">
        <span aria-hidden>🗺</span>
        <span>Map</span>
      </div>
      <div className="map-floating-center">
        <ViewportRefreshIndicator />
      </div>
      <div className="map-header-right">
        <CategoryTogglePanel visible={visibleCategories} onToggle={onToggleCategory} />
        <button
          type="button"
          className={`cat-toggle-btn map-gear-btn ${controlsOpen ? 'on' : 'off'}`}
          onClick={onToggleControls}
          title={controlsOpen ? 'Hide map controls' : 'Show map controls'}
          aria-pressed={controlsOpen}
        >
          <Settings size={15} strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </div>
  );
}

// ---- Category toggle overlay -------------------------------------------------

function CategoryTogglePanel({ visible, onToggle }) {
  return (
    <div className="cat-toggle-panel">
      {CATEGORY_KEYS.map((cat) => {
        const { color, label, Icon } = CATEGORY_CONFIG[cat];
        const on = visible[cat];
        return (
          <button
            key={cat}
            type="button"
            className={`cat-toggle-btn ${on ? 'on' : 'off'}`}
            style={on ? { borderColor: color + '55', background: color + '18' } : undefined}
            onClick={() => onToggle(cat)}
            title={`${on ? 'Hide' : 'Show'} ${label}`}
            aria-pressed={on}
          >
            <Icon
              size={15}
              strokeWidth={1.75}
              color={on ? color : undefined}
              aria-hidden
            />
          </button>
        );
      })}
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

function HotelMarker({ hotel, isSelected, onSelect }) {
  const onClick = useCallback(() => onSelect(hotel), [onSelect, hotel]);

  return (
    <AdvancedMarker
      position={{ lat: hotel.lat, lng: hotel.lng }}
      title={hotel.name}
      onClick={onClick}
      zIndex={isSelected ? 1000 : 100}
    >
      <div className={`map-marker-hotel${isSelected ? ' selected' : ''}`}>🛏</div>
    </AdvancedMarker>
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

function ViewportWatcher({ centerLat, centerLng }) {
  const map = useMap();
  const { refreshViewport, nearbyAnchor } = useTrip();
  const lastTriggeredRef = useRef(null);
  const debounceRef = useRef(null);
  const initialFireSkippedRef = useRef(false);

  const nearbyAnchorRef = useRef(nearbyAnchor);
  useEffect(() => {
    nearbyAnchorRef.current = nearbyAnchor;
  }, [nearbyAnchor]);

  useEffect(() => {
    if (!map) return undefined;

    const handleIdle = () => {
      if (!initialFireSkippedRef.current) {
        initialFireSkippedRef.current = true;
        return;
      }
      if (nearbyAnchorRef.current) return;

      const c = map.getCenter();
      if (!c) return;
      const next = { lat: c.lat(), lng: c.lng() };

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

      const last = lastTriggeredRef.current;
      if (last) {
        const moved = haversineKm(last, next);
        if (moved < VIEWPORT_MIN_MOVE_KM) return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
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
