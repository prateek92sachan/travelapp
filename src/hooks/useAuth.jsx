import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  saveUserData,
  loadUserData,
} from '../services/firebase';


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    if (!import.meta.env.VITE_FIREBASE_API_KEY) {
      setAuthReady(true);
      return;
    }
    let unsubscribe;
    try {
      const auth = getAuth();
      // Consume the redirect result on page load (mobile sign-in flow)
      getRedirectResult(auth).catch((err) => console.warn('Redirect result error:', err));
      unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        setUser(firebaseUser);
        setAuthReady(true);
      });
    } catch (err) {
      console.warn('Firebase auth init failed:', err);
      setAuthReady(true);
    }
    return () => unsubscribe?.();
  }, []);

  const signIn = useCallback(async () => {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    try {
      return await signInWithPopup(auth, provider);
    } catch (err) {
      // Only fall back to redirect if the popup was explicitly blocked by the browser
      if (err.code === 'auth/popup-blocked') {
        return signInWithRedirect(auth, provider);
      }
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getAuth());
  }, []);

  const saveToCloud = useCallback(
    async (data) => {
      if (!user) return;
      try {
        await saveUserData(user.uid, data);
      } catch (err) {
        console.warn('Cloud save failed:', err);
      }
    },
    [user]
  );

  const loadFromCloud = useCallback(async () => {
    if (!user) return null;
    try {
      return await loadUserData(user.uid);
    } catch (err) {
      if (err.name === 'AbortError') return null;
      console.warn('Cloud load failed:', err);
      return null;
    }
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, authReady, signIn, signOut, saveToCloud, loadFromCloud }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
