import { useCallback, useEffect, useState } from 'react';
import Card from './Card';
import { useSearchStore } from '../stores/searchStore';
import { useMapStore } from '../stores/mapStore';
import GoogleMapInner from './map/GoogleMapInner';
import MapboxMapInner from './map/MapboxMapInner';

export default function MapWidget() {
  const coords = useSearchStore((s) => s.coords);
  const loading = useSearchStore((s) => s.loading);
  const mapType = useMapStore((s) => s.mapType);
  const mapProvider = useMapStore((s) => s.mapProvider);
  // visibleCategories drives both map markers AND useTabQuery prefetch gating.
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
        (() => {
          const Inner = mapProvider === 'mapbox' ? MapboxMapInner : GoogleMapInner;
          return (
            <Inner
              key={`${mapProvider}-${coords.lat.toFixed(4)}-${coords.lng.toFixed(4)}`}
              center={coords}
              mapType={mapType}
              visibleCategories={visibleCategories}
              toggleCategory={toggleCategory}
              controlsOpen={controlsOpen}
              onToggleControls={toggleControls}
            />
          );
        })()
      )}
    </Card>
  );
}
