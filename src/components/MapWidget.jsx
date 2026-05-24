import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Compass, Utensils, Leaf, Gem, BedDouble, Settings } from 'lucide-react';
import { Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { GOOGLE_MAPS_MAP_ID } from '../services/config';
import { reverseGeocodePlaceName, reverseGeocodeCity } from '../services/googleMaps';
import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { useSearchStore } from '../stores/searchStore';
import { useMapStore } from '../stores/mapStore';
import { useWishlistStore } from '../stores/wishlistStore';
import { useTabQuery } from '../hooks/queries/useTabQuery';
import { useNearbyQuery } from '../hooks/queries/useNearbyQuery';
import { useViewportQuery } from '../hooks/queries/useViewportQuery';
import { useTheme } from '../hooks/useTheme';
import MapControlsPanel from './MapControlsPanel';
import HotelInfoCard from './HotelInfoCard';
import { haversineKm } from '../utils/geo';

const PROXIMITY_KM = 2;
const VIEWPORT_DEBOUNCE_MS = 600;
const VIEWPORT_MIN_MOVE_KM = 0.5;

// Category metadata — colors match the tab icons in PlacesDrawer / TabbedPlacesWidget
const CATEGORY_CONFIG = {
  activities:  { color: '#f97316', label: 'Activities',  Icon: Compass   },
  restaurants: { color: '#ef4444', label: 'Restaurants', Icon: Utensils  },
  nature:      { color: '#22c55e', label: 'Nature',      Icon: Leaf      },
  gems:        { color: '#6366f1', label: 'Hidden gems', Icon: Gem       },
  hotels:      { color: '#0ea5e9', label: 'Hotels',      Icon: BedDouble },
};
const CATEGORY_KEYS = Object.keys(CATEGORY_CONFIG);

export default function MapWidget() {
  const coords = useSearchStore((s) => s.coords);
  const loading = useSearchStore((s) => s.loading);
  const mapType = useMapStore((s) => s.mapType);
  // visibleCategories moved to mapStore (Fix 3) — also drives useTabQuery
  // gating, so the same toggle controls both marker visibility and data fetch.
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const toggleCategory = useMapStore((s) => s.toggleCategory);

  const [controlsOpen, setControlsOpen] = useState(false);

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

function MapInner({ center, mapType, visibleCategories, toggleCategory, controlsOpen, onToggleControls }) {
  const { theme } = useTheme();
  // Cross-domain callbacks stay on TripContext: selectPlace orchestrates
  // tab switching + UI state + map pan event; clearViewportItems dispatches
  // a pan-to-city event; search() drives the full orchestration flow.
  const { selectPlace, clearViewportItems, search } = useTrip();

  // Pin tap → full city navigation for the pin's locality.
  //   1. selectPlace: opens detail card + dispatches map focus event.
  //   2. reverseGeocodeCity: resolves pin's city.
  //   3. Instant UI sync: ghostCity (wishlist chip) + viewportCity (Save label).
  //   4. search(): refetches tabs + weather + events for the new city.
  //      - skipRecents: pin taps don't pollute the recents list.
  //      - preserveSelection: keep the tapped place + its category tab active.
  // Skips the search() call when the city already matches current destination.
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
  const loading = useSearchStore((s) => s.loading);
  const selectedPlaceId = useSearchStore((s) => s.selectedPlaceId);
  const nearbyAnchor = useMapStore((s) => s.nearbyAnchor);
  const selectedHotelId = useMapStore((s) => s.selectedHotelId);
  const viewportTarget = useMapStore((s) => s.viewportTarget);
  // Tab data (5 queries) — these were exposed as a single tabData object
  // from useTrip but we read each tab individually so this component only
  // re-renders when a category it shows actually changes.
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

  // Click "Search here" → search the current map-center location (resolved
  // into placeArea/placeCity by SearchHereWatcher). Falls back to the current
  // destination input if no resolved name yet.
  const handleSearchHereClick = useCallback(() => {
    const { placeArea, placeCity, destination } = useSearchStore.getState();
    const parts = [placeArea, placeCity].filter(Boolean);
    const override = parts.length ? parts.join(', ') : destination;
    if (!override) return;
    search({ destination: override });
  }, [search]);

  // Buttons disabled while a full search is in-flight or nearby mode is active.
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

// ---- Floating header (rendered inside map-container for reliable painting) ---

function MapFloatingHeader({
  onSearchHere, onClearViewport, actionsDisabled, searchLoading, nearbyAnchor,
  visibleCategories, onToggleCategory, controlsOpen, onToggleControls
}) {
  return (
    <div className="map-floating-header">
      <div className="map-action-group">
        <button
          type="button"
          className="viewport-pill clear"
          onClick={onSearchHere}
          disabled={actionsDisabled}
          title="Search for places centered on the current map view"
        >
          {searchLoading && !nearbyAnchor ? 'Searching…' : 'Search here'}
        </button>
        <button
          type="button"
          className="viewport-pill"
          onClick={onClearViewport}
          disabled={actionsDisabled}
          title="Reset to city-wide results and pan back to city"
        >
          Reset to city view
        </button>
      </div>
      <div className="map-floating-center" />
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

// Pans the map once per (re)mount to the centroid of the densest pin cluster.
// "Densest" = pick the marker with the most neighbors within DENSITY_RADIUS_KM,
// then return the centroid of that cluster. Skips while in nearby/viewport modes
// (those have their own framing logic).
const DENSITY_RADIUS_KM = 3;

function densestCentroid(pins) {
  if (!pins || pins.length < 2) return null;
  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < pins.length; i++) {
    let count = 0;
    for (let j = 0; j < pins.length; j++) {
      if (haversineKm(pins[i], pins[j]) <= DENSITY_RADIUS_KM) count++;
    }
    if (count > bestCount) { bestCount = count; bestIdx = i; }
  }
  const anchor = pins[bestIdx];
  const cluster = pins.filter((p) => haversineKm(anchor, p) <= DENSITY_RADIUS_KM);
  const lat = cluster.reduce((s, p) => s + p.lat, 0) / cluster.length;
  const lng = cluster.reduce((s, p) => s + p.lng, 0) / cluster.length;
  return { lat, lng };
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
      // No zoom change — keep user's current zoom so surrounding markers stay visible
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

function ViewportWatcher({ centerLat, centerLng }) {
  const map = useMap();
  const refreshViewport = useMapStore((s) => s.refreshViewport);
  const nearbyAnchor = useMapStore((s) => s.nearbyAnchor);
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

// ---- Search-here watcher (mounted inside <Map>) -------------------------
// On every map idle (after the first one, which is the initial settle right
// after a search), reverse-geocode the current map center to a neighborhood/
// city name and update the placeArea/placeCity chip so the user can see what
// "Search here" will target. Does NOT write to `destination` — that would
// change useTabQuery's queryKey and trigger a tab refetch on every pan.
//
// Skips while nearby-mode is active (hotel-selected dims the rest of the UI).
function SearchHereWatcher({ skip }) {
  const map = useMap();
  const firstIdleSkippedRef = useRef(false);
  const requestSeqRef = useRef(0);
  const skipRef = useRef(skip);
  // Mirrors ViewportWatcher's debounce + min-move guard so the reverse-geocode
  // pair fires once per real pan instead of on every idle settle. See
  // milestone Fix 1.
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
        // reverseGeocodeCity uses Geocoding API (~$5/1000) instead of the
        // Places Text Search "city" probe (~$32/1000). See milestone Fix 2.
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

// ---- Floating UI elements ------------------------------------------------

function NearbyModeIndicator() {
  const nearbyAnchor = useMapStore((s) => s.nearbyAnchor);
  const exitNearbyMode = useMapStore((s) => s.exitNearbyMode);
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

