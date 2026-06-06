import { LogIn, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';

const FIREBASE_CONFIGURED = !!import.meta.env.VITE_FIREBASE_API_KEY;

/**
 * Access gate: the app is usable only by signed-in users. Renders a
 * sign-in screen until a Firebase user is present, then the app.
 *
 * When Firebase isn't configured (local dev without VITE_FIREBASE_* env)
 * the gate is bypassed so the app stays runnable — same graceful
 * degradation useAuth already follows.
 */
export default function AuthGate({ children }) {
  const { user, authReady, signIn } = useAuth();

  if (!FIREBASE_CONFIGURED) return children;

  if (!authReady) {
    return (
      <div className="auth-gate">
        <Loader2 className="auth-gate-spinner" size={28} strokeWidth={1.75} aria-label="Loading" />
      </div>
    );
  }

  if (user) return children;

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
