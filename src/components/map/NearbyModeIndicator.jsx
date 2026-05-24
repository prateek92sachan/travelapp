import { useMapStore } from '../../stores/mapStore';

export default function NearbyModeIndicator() {
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
