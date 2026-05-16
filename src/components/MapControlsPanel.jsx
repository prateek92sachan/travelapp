import { useState } from 'react';
import { useTrip } from '../hooks/useTrip';

export default function MapControlsPanel({ open: openProp, onToggle: onToggleProp }) {
  const {
    mapType,
    setMapType,
    transitOn,
    setTransitOn,
    hotelsOn,
    toggleHotels,
    hotelsLoading
  } = useTrip();

  const [localOpen, setLocalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : localOpen;
  const handleToggle = controlled ? onToggleProp : () => setLocalOpen((o) => !o);

  return (
    <div className={`map-controls ${open ? 'open' : 'closed'}`}>
      {!controlled && (
        <button
          type="button"
          className="map-controls-toggle"
          onClick={handleToggle}
          title={open ? 'Hide map controls' : 'Show map controls'}
          aria-label={open ? 'Hide map controls' : 'Show map controls'}
          aria-expanded={open}
        >
          {open ? '✕' : '⚙'}
        </button>
      )}

      {open && (
        <div className="map-controls-body">
          <div className="map-controls-section">
            <div className="map-controls-label">Map type</div>
            <div className="map-type-grid">
              {[
                { key: 'roadmap', label: 'Map' },
                { key: 'satellite', label: 'Satellite' },
                { key: 'terrain', label: 'Terrain' },
                { key: 'hybrid', label: 'Hybrid' }
              ].map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`map-type-btn ${mapType === t.key ? 'active' : ''}`}
                  onClick={() => setMapType(t.key)}
                  aria-pressed={mapType === t.key}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="map-controls-section">
            <div className="map-controls-label">Layers</div>
            <ToggleRow
              label="🚆 Transit"
              checked={transitOn}
              onChange={() => setTransitOn((v) => !v)}
            />
            <ToggleRow
              label={hotelsLoading ? '🛏 Hotels (loading…)' : '🛏 Hotels'}
              checked={hotelsOn}
              onChange={toggleHotels}
              disabled={hotelsLoading}
            />
          </div>

          {hotelsOn && (
            <div className="map-controls-hint muted">
              Tap a hotel marker to see attractions within 2 km.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <label className={`toggle-row ${disabled ? 'disabled' : ''}`}>
      <span className="toggle-row-label">{label}</span>
      <span
        className={`toggle-switch ${checked ? 'on' : ''}`}
        role="switch"
        aria-checked={checked}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
        />
        <span className="toggle-thumb" />
      </span>
    </label>
  );
}
