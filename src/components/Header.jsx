import { useState, useEffect, useRef } from 'react';
import { Clock, Link2, Heart, Menu, Moon, Sun, LogOut } from 'lucide-react';
import { useTrip } from '../hooks/useTrip';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { getRecentTrips } from '../utils/recentTrips';
import SmartSearchInput from './SmartSearchInput';
import WishlistOverlay from './WishlistOverlay';

export default function Header() {
  const { destination, setDestination, date, setDate, search, loading, coords } = useTrip();
  const { theme, toggle } = useTheme();
  const { user, authReady, signIn, signOut } = useAuth();
  const isDesktop = useIsDesktop();
  const [recentOpen, setRecentOpen] = useState(false);
  const [recents, setRecents] = useState([]);
  const [searchOpen, setSearchOpen] = useState(true);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const recentRef = useRef(null);
  const authMenuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const headerRef = useRef(null);

  useEffect(() => {
    if (recentOpen) setRecents(getRecentTrips());
  }, [recentOpen]);

  useEffect(() => {
    function onClick(e) {
      if (recentRef.current && !recentRef.current.contains(e.target)) setRecentOpen(false);
    }
    if (recentOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [recentOpen]);

  useEffect(() => {
    function onClick(e) {
      if (authMenuRef.current && !authMenuRef.current.contains(e.target)) setAuthMenuOpen(false);
    }
    if (authMenuOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [authMenuOpen]);

  useEffect(() => {
    function onClick(e) {
      if (hamburgerRef.current && !hamburgerRef.current.contains(e.target)) setHamburgerOpen(false);
    }
    if (hamburgerOpen) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [hamburgerOpen]);

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') setWishlistOpen(false);
    }
    if (wishlistOpen) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [wishlistOpen]);

  // Auto-collapse search on mobile after a successful search
  useEffect(() => {
    if (coords && !isDesktop) setSearchOpen(false);
  }, [coords, isDesktop]);

  // Always show full search on desktop
  useEffect(() => {
    if (isDesktop) setSearchOpen(true);
  }, [isDesktop]);

  // Track header height so pills can sit just below it on mobile
  useEffect(() => {
    if (!headerRef.current || isDesktop) return;
    const el = headerRef.current;
    function update() {
      document.documentElement.style.setProperty('--mobile-header-h', `${el.offsetHeight}px`);
    }
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  // Collapse search when tapping outside the header on mobile
  useEffect(() => {
    if (isDesktop || !searchOpen || !coords) return;
    function handleOutside(e) {
      if (headerRef.current && !headerRef.current.contains(e.target)) setSearchOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [searchOpen, isDesktop, coords]);

  const onSubmit = (e) => {
    e.preventDefault();
    search();
  };

  const handleShare = async () => {
    const u = new URL(window.location.href);
    u.searchParams.delete('date');
    const url = u.toString();
    if (navigator.share) {
      try {
        await navigator.share({ url });
        return;
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied to clipboard');
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Link copied to clipboard');
      } catch {
        showToast('Could not copy link');
      }
    }
  };

  const pickRecent = (trip) => {
    setRecentOpen(false);
    search({ destination: trip.destination, date: trip.date });
  };

  const showSearch = isDesktop || searchOpen || !coords;
  const showSummary = !isDesktop && !searchOpen && !!coords;

  return (
    <header ref={headerRef} className={`header${showSummary ? ' header-compact' : ''}`}>
      <div className="header-row">

        {/* Brand + hamburger menu */}
        <div className="brand">
          <div className="hamburger-wrap" ref={hamburgerRef}>
            <button
              type="button"
              className="hamburger-btn"
              onClick={() => setHamburgerOpen((o) => !o)}
              aria-label="Menu"
              aria-expanded={hamburgerOpen}
            >
              <Menu size={15} strokeWidth={2} aria-hidden />
            </button>
            {hamburgerOpen && (
              <div className="hamburger-menu">
                <button
                  type="button"
                  className="hamburger-item"
                  onClick={() => { toggle(); setHamburgerOpen(false); }}
                >
                  {theme === 'dark'
                    ? <Sun size={14} strokeWidth={2} aria-hidden />
                    : <Moon size={14} strokeWidth={2} aria-hidden />}
                  <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>
              </div>
            )}
          </div>
          <span>Travel</span>
        </div>

        {showSummary && (
          <button
            type="button"
            className="search-summary"
            onClick={() => setSearchOpen(true)}
            aria-label="Edit search"
          >
            <span className="search-summary-dest">{destination || 'Where to?'}</span>
            {date && <span className="search-summary-sep">·</span>}
            {date && <span className="search-summary-date">{date}</span>}
            <span className="search-summary-edit">✎</span>
          </button>
        )}

        {showSearch && (
          <form className="search-row" onSubmit={onSubmit}>
            <SmartSearchInput
              value={destination}
              onChange={setDestination}
              onSelect={(dest) => search({ destination: dest })}
              placeholder="Where to? e.g. Tokyo, Paris, Bali"
            />
            <input
              className="date-input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Trip date"
            />
            <div className="search-row-actions">
              {!isDesktop && !!coords && (
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                >
                  ✕
                </button>
              )}
              <button type="submit" className="btn" disabled={loading}>
                {loading ? 'Searching…' : 'Plan trip'}
              </button>
            </div>
          </form>
        )}

        <div className="recent-wrap" ref={recentRef}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRecentOpen((o) => !o)}
            title="Recent trips"
            aria-label="Recent trips"
          >
            <Clock size={16} strokeWidth={1.75} aria-hidden />
          </button>
          {recentOpen && (
            <div className="recent-menu" role="menu">
              {recents.length === 0 ? (
                <div className="recent-empty">No recent trips yet.</div>
              ) : (
                recents.map((t) => (
                  <button
                    key={`${t.destination}-${t.date}-${t.savedAt}`}
                    className="recent-item"
                    onClick={() => pickRecent(t)}
                  >
                    <span className="dest">{t.destination}</span>
                    <span className="meta">{t.date}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <button
          type="button"
          className="icon-btn"
          onClick={handleShare}
          title="Copy share link"
          aria-label="Share trip"
        >
          <Link2 size={16} strokeWidth={1.75} aria-hidden />
        </button>

        <button
          type="button"
          className="icon-btn"
          onClick={() => setWishlistOpen(true)}
          title="My wishlist"
          aria-label="My wishlist"
        >
          <Heart size={16} strokeWidth={1.75} aria-hidden />
        </button>

        {authReady && (
          <div className="auth-wrap" ref={authMenuRef}>
            {!user ? (
              <button
                className="auth-sign-in-btn"
                onClick={() => signIn().catch((err) => showToast('Sign in failed: ' + (err.code || err.message)))}
                title="Sign in with Google"
              >
                Sign in
              </button>
            ) : (
              <button
                className="auth-avatar-btn"
                onClick={() => setAuthMenuOpen((o) => !o)}
                aria-label="Account menu"
                title={user.displayName || user.email}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || 'User'} referrerPolicy="no-referrer" />
                ) : (
                  (user.displayName?.[0] || user.email?.[0] || '?').toUpperCase()
                )}
              </button>
            )}
            {authMenuOpen && user && (
              <div className="auth-menu">
                <div className="auth-menu-user">
                  <div className="auth-menu-name">{user.displayName || 'User'}</div>
                  <div className="auth-menu-email">{user.email}</div>
                </div>
                <button
                  className="auth-menu-signout"
                  onClick={() => { signOut(); setAuthMenuOpen(false); }}
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {wishlistOpen && <WishlistOverlay onClose={() => setWishlistOpen(false)} />}
    </header>
  );
}

function showToast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
