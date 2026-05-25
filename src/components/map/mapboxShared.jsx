// Presentational bits shared by both Mapbox-based renderers (MapboxMapInner,
// TmapMapInner). Pure UI — no data-source coupling, so safe to share.

import { Marker } from 'react-map-gl/mapbox';
import { CATEGORY_CONFIG, PROXIMITY_KM } from './constants';
import { haversineKm } from '../../utils/geo';

// Map Google's mapTypeId values onto Mapbox style URLs. Light/dark variants
// only apply to the roadmap base — satellite/hybrid/terrain are theme-neutral.
export function mapboxStyleFor(mapType, theme) {
  if (mapType === 'satellite') return 'mapbox://styles/mapbox/satellite-v9';
  if (mapType === 'hybrid') return 'mapbox://styles/mapbox/satellite-streets-v12';
  if (mapType === 'terrain') return 'mapbox://styles/mapbox/outdoors-v12';
  return theme === 'dark'
    ? 'mapbox://styles/mapbox/dark-v11'
    : 'mapbox://styles/mapbox/streets-v12';
}

// Numbered, category-colored pin. Dimmed when outside the proximity ring of an
// anchor hotel; double-ringed when selected.
export function POIMarker({ poi, index, anchor, isSelected, onSelect, category }) {
  const isOutsideRing = anchor ? haversineKm(anchor, poi) > PROXIMITY_KM : false;
  const color = CATEGORY_CONFIG[category]?.color || '#ef4444';
  const onClick = (e) => {
    e.originalEvent?.stopPropagation();
    onSelect(poi, category);
  };
  return (
    <Marker longitude={poi.lng} latitude={poi.lat} onClick={onClick}>
      <div
        className={`map-marker-poi${isSelected ? ' selected' : ''}`}
        title={`${index + 1}. ${poi.name}`}
        style={{
          background: color,
          opacity: isOutsideRing ? 0.35 : 1,
          boxShadow: isSelected
            ? `0 0 0 3px white, 0 0 0 5px ${color}`
            : '0 1px 4px rgba(0,0,0,0.4)',
          zIndex: isSelected ? 200 : 10
        }}
      >
        {index + 1}
      </div>
    </Marker>
  );
}
