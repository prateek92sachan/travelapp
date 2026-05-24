// Manage the user's recent trip searches in localStorage.
// Cloud mirror is wired by useTrip via setRecentTripsCloudWriter — keeps
// this util free of auth/firebase imports.
const KEY = 'travel-app:recent';
const MAX = 5;

let cloudWriter = null;
let syncing = false;

export function setRecentTripsCloudWriter(writer) {
  cloudWriter = writer || null;
}

export function setRecentTripsSyncing(v) {
  syncing = !!v;
}

function emit(method, ...args) {
  if (syncing) return;
  if (!cloudWriter?.[method]) return;
  Promise.resolve(cloudWriter[method](...args)).catch((err) =>
    console.warn(`[recentTripsSync] ${method} failed:`, err)
  );
}

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
  const trip = { destination, date, formattedAddress, savedAt: Date.now() };
  const next = [trip, ...filtered].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // quota exceeded — silently fail
  }
  // Track drops so the cloud mirror stays bounded too.
  const droppedTrips = [...filtered].slice(MAX - 1);
  emit('upsertTrip', trip);
  droppedTrips.forEach((t) => emit('deleteTrip', t));
}

export function replaceRecentTrips(trips) {
  if (!Array.isArray(trips)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(trips.slice(0, MAX)));
  } catch {}
}
