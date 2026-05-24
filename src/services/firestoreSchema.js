// Firestore paths + schema constants for user data v4.
//
// v3 (legacy): single users/{uid} doc with wishlist + recentTrips blobs.
// v4 (this):   subcollections per mode/list + per-item docs, bounded writes.

import { collection, doc } from 'firebase/firestore';
import { getDb } from './firebase';

export const SCHEMA_VERSION = 4;

const SAVED_LISTS = 'savedLists';
const PLAN_LISTS = 'planLists';
const ITEMS = 'items';
const RECENT_TRIPS = 'recentTrips';

export function userDocRef(uid) {
  return doc(getDb(), 'users', uid);
}

function listsCollectionName(mode) {
  return mode === 'plan' ? PLAN_LISTS : SAVED_LISTS;
}

export function listsCol(uid, mode) {
  return collection(getDb(), 'users', uid, listsCollectionName(mode));
}

export function listDocRef(uid, mode, listId) {
  return doc(getDb(), 'users', uid, listsCollectionName(mode), listId);
}

export function itemsCol(uid, mode, listId) {
  return collection(getDb(), 'users', uid, listsCollectionName(mode), listId, ITEMS);
}

export function itemDocRef(uid, mode, listId, placeId) {
  return doc(getDb(), 'users', uid, listsCollectionName(mode), listId, ITEMS, placeId);
}

export function recentTripsCol(uid) {
  return collection(getDb(), 'users', uid, RECENT_TRIPS);
}

export function recentTripDocRef(uid, tripId) {
  return doc(getDb(), 'users', uid, RECENT_TRIPS, tripId);
}

// Stable doc id derived from destination + date. Lets saveRecentTrip
// upsert by content rather than generating a fresh id (matches legacy dedup).
export function tripIdFor({ destination, date }) {
  const slug = (destination || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${slug || 'trip'}__${date || 'nodate'}`;
}
