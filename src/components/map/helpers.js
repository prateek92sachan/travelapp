import { haversineKm } from '../../utils/geo';
import { DENSITY_RADIUS_KM } from './constants';

// Polygon ring approximating a geodesic circle around `center` with radius
// `radiusKm`. Used by MapboxMapInner to draw the proximity ring (no turf dep).
export function geodesicCirclePolygon(center, radiusKm, steps = 64) {
  const coords = [];
  const earthRadiusKm = 6371;
  const angular = radiusKm / earthRadiusKm;
  const latRad = (center.lat * Math.PI) / 180;
  const lngRad = (center.lng * Math.PI) / 180;
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing)
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2)
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

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
