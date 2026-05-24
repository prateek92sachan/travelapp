import { useCallback, useEffect } from 'react';
import Card from './Card';
import { useSearchStore } from '../stores/searchStore';
import { useMapStore } from '../stores/mapStore';
import GoogleMapInner from './map/GoogleMapInner';
import MapboxMapInner from './map/MapboxMapInner';
import { MAPBOX_TOKEN } from '../services/config';

export default function MapWidget() {
  const coords = useSearchStore((s) => s.coords);
  const loading = useSearchStore((s) => s.loading);
  const mapType = useMapStore((s) => s.mapType);
  const mapProvider = useMapStore((s) => s.mapProvider);
  // visibleCategories drives both map markers AND useTabQuery prefetch gating.
  const visibleCategories = useMapStore((s) => s.visibleCategories);
  const toggleCategory = useMapStore((s) => s.toggleCategory);

  return (
    <Card className="map-card" bodyClassName="no-pad" expandable={false}>
      {loading && !coords ? (
        <div className="map-placeholder">Locating destination…</div>
      ) : !coords ? (
        <div className="map-placeholder">Search a destination to see the map.</div>
      ) : (
        (() => {
          // Auto-fallback to Google when Mapbox token is unavailable so the
          // provider toggle pill stays reachable and the map never goes blank.
          const useMapbox = mapProvider === 'mapbox' && !!MAPBOX_TOKEN;
          const Inner = useMapbox ? MapboxMapInner : GoogleMapInner;
          const effectiveProvider = useMapbox ? 'mapbox' : 'google';
          return (
            <Inner
              key={`${effectiveProvider}-${coords.lat.toFixed(4)}-${coords.lng.toFixed(4)}`}
              center={coords}
              mapType={mapType}
              visibleCategories={visibleCategories}
              toggleCategory={toggleCategory}
            />
          );
        })()
      )}
    </Card>
  );
}
