// Manage the user's recent trip searches in localStorage.
const KEY = 'travel-app:recent';
const MAX = 5;

export function getRecentTrips() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecentTrip({ destination, date, formattedAddress }) {
  if (!destination) return;
  const current = getRecentTrips();
  const filtered = current.filter(
    (t) =>
      !(
        t.destination?.toLowerCase() === destination.toLowerCase() &&
        t.date === date
      )
  );
  const next = [
    { destination, date, formattedAddress, savedAt: Date.now() },
    ...filtered
  ].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — silently fail
  }
}

export function replaceRecentTrips(trips) {
  if (!Array.isArray(trips)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(trips.slice(0, MAX)));
  } catch {}
}
