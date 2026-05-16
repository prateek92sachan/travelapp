import { initializeApp } from 'firebase/app';
import {
  getAuth as _getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let _app = null;
let _auth = null;
let _db = null;

function ensureApp() {
  if (_app) return _app;
  if (!firebaseConfig.apiKey) throw new Error('Firebase not configured — set VITE_FIREBASE_* env vars');
  _app = initializeApp(firebaseConfig);
  return _app;
}

export function getAuth() {
  if (!_auth) _auth = _getAuth(ensureApp());
  return _auth;
}

export function getDb() {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged };

export async function saveUserData(uid, { wishlist, recentTrips }) {
  const db = getDb();
  await setDoc(
    doc(db, 'users', uid),
    { wishlist, recentTrips, updatedAt: Date.now() },
    { merge: true }
  );
}

export async function loadUserData(uid) {
  const db = getDb();
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}
