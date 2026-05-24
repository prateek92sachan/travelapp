// User preferences cloud sync. Stores small UI prefs (e.g. mapProvider) on
// the existing users/{uid} parent doc under a `prefs` map. Merge writes only —
// never overwrites sibling fields owned by wishlistSync / recentTripsSync.

import { getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { userDocRef } from './firestoreSchema';

export async function loadPrefs(uid) {
  if (!uid) return null;
  const snap = await getDoc(userDocRef(uid));
  if (!snap.exists()) return null;
  return snap.data().prefs || null;
}

export async function setMapProvider(uid, provider) {
  if (!uid || !provider) return;
  await setDoc(
    userDocRef(uid),
    { prefs: { mapProvider: provider }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}
