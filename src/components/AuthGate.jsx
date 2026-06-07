import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { LogIn, Loader2, ShieldX } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';
import { getDb } from '../services/firebase';

const FIREBASE_CONFIGURED = !!import.meta.env.VITE_FIREBASE_API_KEY;

/**
 * Access gate. The app is usable only by allowlisted, signed-in users:
 *   loading → sign-in → (allowlist check) → app | not-authorized
 *
 * Allowlist = a doc at allowlist/{email} (managed in the Firebase Console).
 * The client reads only its own entry; Firestore rules + the Cloud
 * Functions enforce the same allowlist server-side.
 *
 * Bypassed when Firebase isn't configured (local dev without VITE_* env).
 */
export default function AuthGate({ children }) {
  const { user, authReady, signIn, signOut } = useAuth();
  // null = unknown/checking, true = allowed, false = denied
  const [allowed, setAllowed] = useState(null);

  useEffect(() => {
    if (!FIREBASE_CONFIGURED || !user?.email) {
      setAllowed(null);
      return;
    }
    let cancelled = false;
    setAllowed(null);
    getDoc(doc(getDb(), 'allowlist', user.email.toLowerCase()))
      .then((snap) => { if (!cancelled) setAllowed(snap.exists()); })
      .catch(() => { if (!cancelled) setAllowed(false); });
    return () => { cancelled = true; };
  }, [user?.email]);

  if (!FIREBASE_CONFIGURED) return children;

  if (!authReady || (user && allowed === null)) {
    return (
      <div className="auth-gate">
        <Loader2 className="auth-gate-spinner" size={28} strokeWidth={1.75} aria-label="Loading" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-icon" aria-hidden>🌍</div>
          <h1 className="auth-gate-title">Travel App</h1>
          <p className="auth-gate-sub">Sign in to plan and save your trips.</p>
          <button
            type="button"
            className="auth-gate-btn"
            onClick={() => signIn().catch((err) => toast.error('Sign in failed: ' + (err.code || err.message)))}
          >
            <LogIn size={16} strokeWidth={2} aria-hidden />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <div className="auth-gate-icon auth-gate-icon-deny" aria-hidden>
            <ShieldX size={44} strokeWidth={1.5} />
          </div>
          <h1 className="auth-gate-title">Access not authorized</h1>
          <p className="auth-gate-sub">
            <strong>{user.email}</strong> isn’t on the access list. Ask the owner to add you.
          </p>
          <button type="button" className="auth-gate-btn-ghost" onClick={() => signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return children;
}
