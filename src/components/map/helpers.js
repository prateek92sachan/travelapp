import { haversineKm } from '../../utils/geo';
import { DENSITY_RADIUS_KM } from './constants';

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
