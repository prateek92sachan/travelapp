// Pure geo math shared by the Places search pipeline.

export const EARTH_M_PER_DEG = 111320; // metres per degree latitude (≈ at equator)

// Build a lat/lng rectangle circumscribing the circle of `radiusMeters`
// around (lat,lng). Used as a hard locationRestriction so text-search can't
// return strong name-matches far outside the searched area. Corners sit at
// ~1.41× radius; the haversine post-filter then trims them to the true circle.
export function rectFromCenterRadius(lat, lng, radiusMeters) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !(radiusMeters > 0)) {
    return null;
  }
  const latDelta = radiusMeters / EARTH_M_PER_DEG;
  const cos = Math.cos((lat * Math.PI) / 180);
  const lngDelta = radiusMeters / (EARTH_M_PER_DEG * Math.max(0.01, Math.abs(cos)));
  return {
    low:  { lat: lat - latDelta, lng: lng - lngDelta },
    high: { lat: lat + latDelta, lng: lng + lngDelta }
  };
}

// Haversine distance in metres between two lat/lng points.
export function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
