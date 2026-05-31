import { haversineKm } from '../../utils/geo';
import { DENSITY_RADIUS_KM, BOX_INSET_FRAC, GRID_CELLS } from './constants';

// Centroid of the densest pin cluster within DENSITY_RADIUS_KM.
export function densestCentroid(pins) {
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

// Shrink a { low:{lat,lng}, high:{lat,lng} } rectangle inward by `frac` on
// each side, so pins near the visible edge stay comfortably inside the box.
// Returns the bounds unchanged when they're missing/malformed.
export function insetBounds(bounds, frac = BOX_INSET_FRAC) {
  if (!bounds || !bounds.low || !bounds.high) return bounds;
  const { low, high } = bounds;
  const dLat = (high.lat - low.lat) * frac;
  const dLng = (high.lng - low.lng) * frac;
  return {
    low: { lat: low.lat + dLat, lng: low.lng + dLng },
    high: { lat: high.lat - dLat, lng: high.lng - dLng }
  };
}

// Grid-cap declutter: distribute pins across a cells x cells grid over the
// given bounds, keeping at most `capPerCell` per cell so pins don't bunch.
// `items` is assumed pre-sorted by popularity (input order = priority).
// Returns up to `max` items. No marker-cluster bubbles — pure spread.
export function gridSpread(items, bounds, cells = GRID_CELLS, capPerCell = 1, max = 5) {
  if (!items || items.length === 0) return [];
  if (!bounds || !bounds.low || !bounds.high || items.length <= max) {
    return items.slice(0, max);
  }

  const { low, high } = bounds;
  const EPS = 1e-9;
  const latSpan = (high.lat - low.lat) || EPS;
  const lngSpan = (high.lng - low.lng) || EPS;

  const counts = new Map(); // cellKey -> count
  const picked = [];
  const overflow = [];

  for (const item of items) {
    if (picked.length >= max) break;
    if (!Number.isFinite(item?.lat) || !Number.isFinite(item?.lng)) continue;

    let cx = Math.floor(((item.lng - low.lng) / lngSpan) * cells);
    let cy = Math.floor(((item.lat - low.lat) / latSpan) * cells);
    cx = Math.min(cells - 1, Math.max(0, cx));
    cy = Math.min(cells - 1, Math.max(0, cy));
    const key = `${cx},${cy}`;

    const count = counts.get(key) || 0;
    if (count < capPerCell) {
      counts.set(key, count + 1);
      picked.push(item);
    } else {
      overflow.push(item);
    }
  }

  if (picked.length < max) {
    for (const item of overflow) {
      if (picked.length >= max) break;
      picked.push(item);
    }
  }

  return picked.slice(0, max);
}
