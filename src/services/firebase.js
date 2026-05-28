import { initializeApp } from 'firebase/app';
import {
  getAuth as _getAuth,
  setPersistence,
  browserLocalPersistence,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  browserPopupRedirectResolver,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions as _getFunctions, httpsCallable } from 'firebase/functions';

// Use the current origin as authDomain when on a Firebase-Hosting domain so
// the OAuth redirect handler runs same-origin (avoids Chrome 117+ storage
// partitioning swallowing the session on mobile redirect).
function resolveAuthDomain() {
  const envDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  if (typeof window === 'undefined') return envDomain;
  const host = window.location.host;
  if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) return host;
  return envDomain;
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: resolveAuthDomain(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let _app = null;
let _auth = null;
let _db = null;
let _functions = null;

function ensureApp() {
  if (_app) return _app;
  if (!firebaseConfig.apiKey) throw new Error('Firebase not configured — set VITE_FIREBASE_* env vars');
  _app = initializeApp(firebaseConfig);
  return _app;
}

export function getAuth() {
  if (!_auth) {
    _auth = _getAuth(ensureApp());
    // IndexedDB persistence — needed so mobile redirect survives navigation.
    setPersistence(_auth, browserLocalPersistence).catch((err) =>
      console.warn('setPersistence failed:', err)
    );
  }
  return _auth;
}

export function getDb() {
  if (!_db) _db = getFirestore(ensureApp());
  return _db;
}

export function getFunctions() {
  if (!_functions) _functions = _getFunctions(ensureApp(), 'us-central1');
  return _functions;
}

export function callable(name) {
  return httpsCallable(getFunctions(), name);
}

export { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, browserPopupRedirectResolver };
