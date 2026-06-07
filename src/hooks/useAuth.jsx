import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  browserPopupRedirectResolver,
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
    return signInWithPopup(auth, provider, browserPopupRedirectResolver);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getAuth());
  }, []);

  const value = useMemo(
    () => ({ user, authReady, signIn, signOut }),
    [user, authReady, signIn, signOut]
  );
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
