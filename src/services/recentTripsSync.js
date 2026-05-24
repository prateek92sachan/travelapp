// Recent-trips cloud sync. Same conflict policy as wishlistSync:
// skip when remote updatedAt newer than local action.

import {
  deleteDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import {
  recentTripDocRef,
  recentTripsCol,
  tripIdFor,
} from './firestoreSchema';

const MAX = 5;

async function txnWriteIfFresher(ref, payload, localTs) {
  await runTransaction(getDb(), async (txn) => {
    const snap = await txn.get(ref);
    const remote = snap.exists() ? snap.data() : null;
    const remoteTs = remote?.updatedAt?.toMillis?.() ?? remote?.updatedAtMs ?? 0;
    if (remote && localTs && remoteTs > localTs) return;
    txn.set(
      ref,
      { ...payload, updatedAt: serverTimestamp(), updatedAtMs: Date.now() },
      { merge: true }
    );
  });
}

export async function upsertTrip(uid, trip) {
  if (!uid || !trip?.destination) return;
  const id = tripIdFor({ destination: trip.destination, date: trip.date });
  await txnWriteIfFresher(
    recentTripDocRef(uid, id),
    {
      destination: trip.destination,
      date: trip.date || null,
      formattedAddress: trip.formattedAddress || null,
      savedAt: trip.savedAt || Date.now(),
    },
    trip.savedAt || Date.now()
  );
  await pruneOldest(uid);
}

export async function deleteTrip(uid, { destination, date }) {
  if (!uid || !destination) return;
  await deleteDoc(recentTripDocRef(uid, tripIdFor({ destination, date })));
}

export async function loadAllTrips(uid) {
  if (!uid) return [];
  const snap = await getDocs(recentTripsCol(uid));
  const trips = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  trips.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  return trips.slice(0, MAX).map(({ id: _id, updatedAt: _u, updatedAtMs: _ums, ...rest }) => rest);
}

// Keep cloud bounded mirror of the MAX cap. Local util already prunes;
// this guards against drift if a write lands while local was ahead.
async function pruneOldest(uid) {
  const snap = await getDocs(recentTripsCol(uid));
  if (snap.size <= MAX) return;
  const docs = snap.docs
    .map((d) => ({ ref: d.ref, savedAt: d.data().savedAt || 0 }))
    .sort((a, b) => a.savedAt - b.savedAt);
  const drop = docs.slice(0, snap.size - MAX);
  if (!drop.length) return;
  const batch = writeBatch(getDb());
  drop.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
