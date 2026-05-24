import { useState, useRef, useEffect } from 'react';
import { Settings, X } from 'lucide-react';
import { useMapStore } from '../stores/mapStore';

export default function MapControlsPanel({ open: openProp, onToggle: onToggleProp }) {
  const mapType = useMapStore((s) => s.mapType);
  const setMapType = useMapStore((s) => s.setMapType);
  const transitOn = useMapStore((s) => s.transitOn);
  const setTransitOn = useMapStore((s) => s.setTransitOn);

  const [localOpen, setLocalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : localOpen;
  const handleToggle = controlled ? onToggleProp : () => setLocalOpen((o) => !o);

  const panelRef = useRef(null);
  useEffect(() => {
    if (controlled || !localOpen) return;
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setLocalOpen(false);
      }
    }
    document.addEventListener('pointerdown', handleClickOutside, true);
    return () => document.removeEventListener('pointerdown', handleClickOutside, true);
  }, [localOpen, controlled]);

  return (
    <div className={`map-controls ${open ? 'open' : 'closed'}`} ref={panelRef}>
      {!controlled && (
        <button
          type="button"
          className="map-controls-toggle"
          onClick={handleToggle}
          title={open ? 'Hide map controls' : 'Show map controls'}
          aria-label={open ? 'Hide map controls' : 'Show map controls'}
          aria-expanded={open}
        >
          {open ? <X size={18} strokeWidth={2} /> : <Settings size={18} strokeWidth={1.75} />}
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
          </div>
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
