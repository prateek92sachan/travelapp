import { useEffect, useMemo, useState } from 'react';
import { useTrip } from '../hooks/useTrip';
import { useWishlistStore, selectLists } from '../stores/wishlistStore';
import { useSearchStore } from '../stores/searchStore';

const ACCENT = '#ff385c';
const COUNTRIES_URL = '/world-countries.geojson';

function isDarkTheme() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

// Equirectangular: lng -> x in [0,360], lat -> y in [0,180]. viewBox 0 0 360 180.
function featureToPath(feature) {
  const geom = feature.geometry;
  if (!geom) return '';
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  let d = '';
  for (const poly of polys) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const lng = ring[i][0];
        const lat = ring[i][1];
        const x = (lng + 180).toFixed(2);
        const y = (90 - lat).toFixed(2);
        d += (i === 0 ? 'M' : 'L') + x + ',' + y + ' ';
      }
      d += 'Z ';
    }
  }
  return d;
}

export default function EmptyStateGlobe() {
  const wishlistLists = useWishlistStore(selectLists);
  const setDestination = useSearchStore((s) => s.setDestination);
  // `search` is still a cross-domain orchestrator on TripContext; everything
  // else this component needs is served directly by stores.
  const { search } = useTrip();
  const [selectedListId, setSelectedListId] = useState('all');
  const [countries, setCountries] = useState([]);
  const [dark, setDark] = useState(isDarkTheme());

  useEffect(() => {
    const obs = new MutationObserver(() => setDark(isDarkTheme()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(COUNTRIES_URL)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setCountries(data.features || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const worldPath = useMemo(() => countries.map(featureToPath).join(' '), [countries]);

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

  const handlePinClick = (pt) => {
    if (!pt) return;
    const dest = pt.destination || pt.name;
    if (!dest) return;
    setDestination(dest);
    if (typeof search === 'function') {
      try { search({ destination: dest }); } catch {}
    }
  };

  if (allPoints.length === 0) {
    return (
      <div className="empty-globe empty-globe-stub">
        <h2>Plan your next trip in seconds</h2>
        <p>Enter a destination and a date above to see weather, top spots, and activities.</p>
      </div>
    );
  }

  const landFill = dark ? '#1f2227' : '#eceef1';
  const landStroke = dark ? '#2a2d33' : '#dadde2';

  return (
    <div className="empty-globe">
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

      <div className="worldmap-stage">
        <svg
          className="worldmap-svg"
          viewBox="0 0 360 180"
          preserveAspectRatio="xMidYMid meet"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path d={worldPath} fill={landFill} stroke={landStroke} strokeWidth={0.3} strokeLinejoin="round" />
        </svg>
        {filteredPoints.map((pt) => {
          const left = ((pt.lng + 180) / 360) * 100;
          const top = ((90 - pt.lat) / 180) * 100;
          return (
            <button
              key={pt.placeId}
              type="button"
              className="worldmap-pin"
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => handlePinClick(pt)}
              aria-label={`${pt.name} — ${pt.destination}`}
              title={`${pt.name} — ${pt.destination}`}
            >
              <svg width="18" height="24" viewBox="0 0 18 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
                <path
                  d="M9 23.5 C9 23.5 1 14 1 8 A8 8 0 1 1 17 8 C17 14 9 23.5 9 23.5 Z"
                  fill={ACCENT}
                  stroke="#fff"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                <circle cx="9" cy="8" r="3" fill="#fff" />
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}
