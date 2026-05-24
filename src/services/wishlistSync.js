// Wishlist cloud sync. Per-mutation writes against the v4 subcollection
// schema (see firestoreSchema.js). Each write runs in a transaction that
// skips when the remote doc's updatedAt is newer than the local action —
// the conflict policy chosen for multi-tab/cross-device edits.

import {
  deleteDoc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { getDb } from './firebase';
import {
  itemDocRef,
  itemsCol,
  listDocRef,
  listsCol,
  userDocRef,
} from './firestoreSchema';

function modeOf(list) {
  return list?.mode === 'plan' ? 'plan' : 'saved';
}

function itemPayload(item) {
  const { placeId, ...rest } = item || {};
  return rest;
}

// Strip the items array — items live in a subcollection in v4.
function listMetaPayload(list) {
  const { items: _omit, ...meta } = list || {};
  return meta;
}

async function txnWriteIfFresher(ref, payload, localTs) {
  await runTransaction(getDb(), async (txn) => {
    const snap = await txn.get(ref);
    const remote = snap.exists() ? snap.data() : null;
    const remoteTs = remote?.updatedAt?.toMillis?.() ?? remote?.updatedAtMs ?? 0;
    if (remote && localTs && remoteTs > localTs) return; // remote newer — skip
    txn.set(
      ref,
      { ...payload, updatedAt: serverTimestamp(), updatedAtMs: Date.now() },
      { merge: true }
    );
  });
}

export async function upsertList(uid, list) {
  if (!uid || !list?.id) return;
  const ref = listDocRef(uid, modeOf(list), list.id);
  await txnWriteIfFresher(ref, listMetaPayload(list), list.updatedAt || Date.now());
}

export async function deleteList(uid, list) {
  if (!uid || !list?.id) return;
  const mode = modeOf(list);
  // Delete items subcollection first (Firestore doesn't cascade).
  const itemSnap = await getDocs(itemsCol(uid, mode, list.id));
  if (!itemSnap.empty) {
    const batch = writeBatch(getDb());
    itemSnap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  await deleteDoc(listDocRef(uid, mode, list.id));
}

export async function upsertItem(uid, list, item) {
  if (!uid || !list?.id || !item?.placeId) return;
  const ref = itemDocRef(uid, modeOf(list), list.id, item.placeId);
  await txnWriteIfFresher(ref, itemPayload(item), item.savedAt || Date.now());
}

export async function removeItem(uid, list, placeId) {
  if (!uid || !list?.id || !placeId) return;
  await deleteDoc(itemDocRef(uid, modeOf(list), list.id, placeId));
}

export async function updatePlan(uid, list) {
  if (!uid || !list?.id || modeOf(list) !== 'plan') return;
  const ref = listDocRef(uid, 'plan', list.id);
  await txnWriteIfFresher(
    ref,
    { plan: list.plan ?? null, name: list.name, destination: list.destination, mode: 'plan' },
    list.updatedAt || Date.now()
  );
}

export async function setActiveListId(uid, listId) {
  if (!uid) return;
  await updateDoc(userDocRef(uid), {
    activeListId: listId ?? null,
    updatedAt: serverTimestamp(),
  });
}

// Load entire wishlist (both modes + all items) into the v3 in-memory shape
// used by wishlistStore. Used on sign-in.
export async function loadAllWishlist(uid) {
  if (!uid) return { version: 3, activeListId: null, lists: [] };
  const [savedSnap, planSnap, parentSnap] = await Promise.all([
    getDocs(listsCol(uid, 'saved')),
    getDocs(listsCol(uid, 'plan')),
    getDoc(userDocRef(uid)),
  ]);

  async function hydrate(snap, mode) {
    return Promise.all(
      snap.docs.map(async (d) => {
        const meta = d.data() || {};
        const itemSnap = await getDocs(itemsCol(uid, mode, d.id));
        const items = itemSnap.docs.map((i) => ({ placeId: i.id, ...i.data() }));
        return {
          id: d.id,
          name: meta.name || '',
          destination: meta.destination || '',
          mode,
          createdAt: meta.createdAt || Date.now(),
          updatedAt: meta.updatedAtMs || meta.updatedAt?.toMillis?.() || Date.now(),
          items,
          plan: mode === 'plan' ? meta.plan ?? null : null,
        };
      })
    );
  }

  const [saved, plan] = await Promise.all([hydrate(savedSnap, 'saved'), hydrate(planSnap, 'plan')]);
  const lists = [...saved, ...plan].sort((a, b) => b.updatedAt - a.updatedAt);
  const parent = parentSnap.exists() ? parentSnap.data() : null;
  const activeListId =
    parent?.activeListId && lists.some((l) => l.id === parent.activeListId)
      ? parent.activeListId
      : lists[0]?.id || null;
  return { version: 3, activeListId, lists };
}
