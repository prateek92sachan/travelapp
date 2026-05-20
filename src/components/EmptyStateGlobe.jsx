import { useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { useTrip } from '../hooks/useTrip';

const Globe = lazy(() => import('react-globe.gl'));

const ACCENT = '#ff385c';
const GLOBE_IMG_DAY = 'https://unpkg.com/three-globe/example/img/earth-day.jpg';
const GLOBE_IMG_NIGHT = 'https://unpkg.com/three-globe/example/img/earth-night.jpg';
const BUMP_IMG = 'https://unpkg.com/three-globe/example/img/earth-topology.png';

function isDarkTheme() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export default function EmptyStateGlobe() {
  const { wishlistLists, setDestination } = useTrip();
  const containerRef = useRef(null);
  const globeRef = useRef(null);
  const [selectedListId, setSelectedListId] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [size, setSize] = useState({ w: 320, h: 320 });
  const [dark, setDark] = useState(isDarkTheme());

  // Track theme changes
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  // Track container size for responsive globe
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      const w = Math.max(220, Math.floor(r.width));
      const h = Math.max(220, Math.floor(r.height));
      setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Collect markers from all wishlist + plan snapshot places
  const allPoints = useMemo(() => {
    const out = [];
    for (const list of wishlistLists) {
      const seen = new Set();
      for (const it of list.items || []) {
        if (it.placeId && !seen.has(it.placeId) && Number.isFinite(it.lat) && Number.isFinite(it.lng)) {
          out.push({
            placeId: it.placeId,
            name: it.name,
            lat: it.lat,
            lng: it.lng,
            listId: list.id,
            listName: list.name,
            destination: list.destination || list.name,
          });
          seen.add(it.placeId);
        }
      }
      const snapshots = list.plan?.placeSnapshots || {};
      for (const placeId of Object.keys(snapshots)) {
        if (seen.has(placeId)) continue;
        const s = snapshots[placeId];
        if (!s || !Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
        out.push({
          placeId,
          name: s.name,
          lat: s.lat,
          lng: s.lng,
          listId: list.id,
          listName: list.name,
          destination: list.destination || list.name,
        });
        seen.add(placeId);
      }
    }
    return out;
  }, [wishlistLists]);

  const filteredPoints = useMemo(() => {
    if (selectedListId === 'all') return allPoints;
    return allPoints.filter((p) => p.listId === selectedListId);
  }, [allPoints, selectedListId]);

  // Center globe on filtered point set
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    if (filteredPoints.length === 0) return;
    let avgLat = 0, avgLng = 0;
    for (const p of filteredPoints) { avgLat += p.lat; avgLng += p.lng; }
    avgLat /= filteredPoints.length;
    avgLng /= filteredPoints.length;
    try {
      g.pointOfView({ lat: avgLat, lng: avgLng, altitude: filteredPoints.length === 1 ? 1.6 : 2.2 }, 1200);
    } catch {}
  }, [filteredPoints]);

  // Auto-rotate controls
  useEffect(() => {
    const g = globeRef.current;
    if (!g) return;
    const controls = g.controls?.();
    if (!controls) return;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.enableZoom = expanded;
  }, [expanded, size.w, size.h]);

  const handlePointClick = (pt) => {
    if (!pt) return;
    const dest = pt.destination || pt.name;
    if (dest) setDestination(dest);
  };

  if (allPoints.length === 0) {
    return (
      <div className="empty-globe empty-globe-stub">
        <h2>Plan your next trip in seconds</h2>
        <p>Enter a destination and a date above to see weather, top spots, and activities.</p>
      </div>
    );
  }

  return (
    <div className={`empty-globe ${expanded ? 'expanded' : ''}`}>
      <div className="globe-chip-strip" role="tablist" aria-label="Filter by wishlist">
        <button
          type="button"
          role="tab"
          aria-selected={selectedListId === 'all'}
          className={`globe-chip ${selectedListId === 'all' ? 'active' : ''}`}
          onClick={() => setSelectedListId('all')}
        >
          All <span className="globe-chip-count">{allPoints.length}</span>
        </button>
        {wishlistLists.map((list) => {
          const count = allPoints.filter((p) => p.listId === list.id).length;
          if (count === 0) return null;
          return (
            <button
              key={list.id}
              type="button"
              role="tab"
              aria-selected={selectedListId === list.id}
              className={`globe-chip ${selectedListId === list.id ? 'active' : ''}`}
              onClick={() => setSelectedListId(list.id)}
            >
              {list.name} <span className="globe-chip-count">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="globe-stage" ref={containerRef}>
        <Suspense fallback={<div className="globe-loading">Loading globe…</div>}>
          <Globe
            ref={globeRef}
            width={size.w}
            height={size.h}
            globeImageUrl={dark ? GLOBE_IMG_NIGHT : GLOBE_IMG_DAY}
            bumpImageUrl={BUMP_IMG}
            backgroundColor="rgba(0,0,0,0)"
            atmosphereColor={ACCENT}
            atmosphereAltitude={0.18}
            pointsData={filteredPoints}
            pointLat={(d) => d.lat}
            pointLng={(d) => d.lng}
            pointColor={() => ACCENT}
            pointAltitude={0.03}
            pointRadius={0.45}
            pointLabel={(d) => `<div class="globe-marker-label"><b>${d.name}</b><br><span>${d.destination}</span></div>`}
            onPointClick={handlePointClick}
            animateIn={false}
          />
        </Suspense>
        <button
          type="button"
          className="globe-resize-btn"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? 'Shrink globe' : 'Expand globe'}
          title={expanded ? 'Shrink' : 'Expand'}
        >
          {expanded ? (
            <Minimize2 size={15} strokeWidth={1.75} aria-hidden />
          ) : (
            <Maximize2 size={15} strokeWidth={1.75} aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
