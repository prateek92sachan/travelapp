// Small geographic utilities (distance math used by map density centering and
// move thresholds). Pure functions — no React, no async — easy to test.

const EARTH_RADIUS_KM = 6371;

/**
 * Great-circle distance between two lat/lng points in kilometers.
 * Haversine formula — accurate enough for short distances at city scale.
 *
 * @param {{lat: number, lng: number}} a
 * @param {{lat: number, lng: number}} b
 * @returns {number} distance in kilometers
 */
export function haversineKm(a, b) {
  if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(b.lat)) return Infinity;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}
