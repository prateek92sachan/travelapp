// One-shot migration from v3 (single doc with wishlist + recentTrips
// blobs) to v4 (subcollections). Idempotent — keyed by schemaVersion on
// the parent doc.

import {
  deleteField,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import {
  SCHEMA_VERSION,
  itemDocRef,
  listDocRef,
  recentTripDocRef,
  tripIdFor,
  userDocRef,
} from './firestoreSchema';

const FIRESTORE_BATCH_LIMIT = 450; // hard cap is 500; leave headroom

async function commitInChunks(ops) {
  const db = getDb();
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const slice = ops.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    slice.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

function modeOf(list) {
  return list?.mode === 'plan' ? 'plan' : 'saved';
}

export async function migrateLegacyUserDoc(uid) {
  if (!uid) return { migrated: false, reason: 'no-uid' };
  const ref = userDocRef(uid);
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;

  if (data?.schemaVersion >= SCHEMA_VERSION) {
    return { migrated: false, reason: 'already-v4' };
  }

  const wishlist = data?.wishlist;
  const recentTrips = data?.recentTrips;
  const hasLegacy =
    (wishlist && Array.isArray(wishlist.lists)) ||
    (Array.isArray(recentTrips) && recentTrips.length > 0);

  // Fresh user (no legacy blob): just stamp schemaVersion so we skip next time.
  if (!hasLegacy) {
    await setDoc(
      ref,
      {
        schemaVersion: SCHEMA_VERSION,
        migratedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
    return { migrated: false, reason: 'no-legacy' };
  }

  const ops = [];

  if (wishlist && Array.isArray(wishlist.lists)) {
    for (const list of wishlist.lists) {
      if (!list?.id) continue;
      const mode = modeOf(list);
      const { items = [], ...metaRaw } = list;
      const meta = { ...metaRaw };
      delete meta.items;
      ops.push({
        ref: listDocRef(uid, mode, list.id),
        data: {
          ...meta,
          mode,
          updatedAt: serverTimestamp(),
          updatedAtMs: list.updatedAt || Date.now(),
        },
      });
      for (const item of items) {
        if (!item?.placeId) continue;
        const { placeId, ...rest } = item;
        ops.push({
          ref: itemDocRef(uid, mode, list.id, placeId),
          data: {
            ...rest,
            updatedAt: serverTimestamp(),
            updatedAtMs: item.savedAt || Date.now(),
          },
        });
      }
    }
  }

  if (Array.isArray(recentTrips)) {
    for (const trip of recentTrips) {
      if (!trip?.destination) continue;
      const id = tripIdFor({ destination: trip.destination, date: trip.date });
      ops.push({
        ref: recentTripDocRef(uid, id),
        data: {
          destination: trip.destination,
          date: trip.date || null,
          formattedAddress: trip.formattedAddress || null,
          savedAt: trip.savedAt || Date.now(),
          updatedAt: serverTimestamp(),
          updatedAtMs: trip.savedAt || Date.now(),
        },
      });
    }
  }

  await commitInChunks(ops);

  // Stamp parent doc + drop legacy fields. Done after subcollection writes
  // so a partial failure leaves the legacy blob intact for retry.
  await setDoc(
    ref,
    {
      schemaVersion: SCHEMA_VERSION,
      activeListId: wishlist?.activeListId ?? null,
      migratedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      wishlist: deleteField(),
      recentTrips: deleteField(),
    },
    { merge: true }
  );

  return { migrated: true, listCount: wishlist?.lists?.length || 0, tripCount: recentTrips?.length || 0 };
}
