import { Settings } from 'lucide-react';
import { useMapStore } from '../../stores/mapStore';
import { CATEGORY_CONFIG, CATEGORY_KEYS } from './constants';

export default function MapFloatingHeader({
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
        <ProviderToggle />
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

function ProviderToggle() {
  const provider = useMapStore((s) => s.mapProvider);
  const setProvider = useMapStore((s) => s.setMapProvider);
  return (
    <div className="provider-toggle" role="group" aria-label="Map provider">
      <button
        type="button"
        className={`provider-toggle-btn${provider === 'google' ? ' active' : ''}`}
        onClick={() => setProvider('google')}
        aria-pressed={provider === 'google'}
        title="Use Google Maps"
      >
        Google
      </button>
      <button
        type="button"
        className={`provider-toggle-btn${provider === 'mapbox' ? ' active' : ''}`}
        onClick={() => setProvider('mapbox')}
        aria-pressed={provider === 'mapbox'}
        title="Use Mapbox"
      >
        Mapbox
      </button>
    </div>
  );
}

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
