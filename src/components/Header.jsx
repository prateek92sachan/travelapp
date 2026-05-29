import { useState, useEffect, useRef } from 'react';
import { Clock, Link2, Menu, Moon, Sun, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTripSearch } from '../hooks/useTrip';
import { useSearchStore } from '../stores/searchStore';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { getRecentTrips } from '../utils/recentTrips';
import SmartSearchInput from './SmartSearchInput';
import WishlistOverlay from './WishlistOverlay';
import ErrorBoundary from './ErrorBoundary';
import { useClickOutside } from '../hooks/useClickOutside';
import { useEscapeKey } from '../hooks/useEscapeKey';

export default function Header() {
  const destination = useSearchStore((s) => s.destination);
  const setDestination = useSearchStore((s) => s.setDestination);
  const date = useSearchStore((s) => s.date);
  const setDate = useSearchStore((s) => s.setDate);
  const loading = useSearchStore((s) => s.loading);
  const coords = useSearchStore((s) => s.coords);
  const search = useTripSearch();
  const placeArea = useSearchStore((s) => s.placeArea);
  const placeCity = useSearchStore((s) => s.placeCity);
  const { theme, toggle } = useTheme();
  const { user, authReady, signIn, signOut } = useAuth();
  const isDesktop = useIsDesktop();
  const [recentOpen, setRecentOpen] = useState(false);
  const [recents, setRecents] = useState([]);
  const [searchOpen, setSearchOpen] = useState(true);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [placePickerOpen, setPlacePickerOpen] = useState(false);
  const recentRef = useRef(null);
  const authMenuRef = useRef(null);
  const hamburgerRef = useRef(null);
  const headerRef = useRef(null);
  const popoverSearchRef = useRef(null);
  const placePopoverRef = useRef(null);
  const hiddenDateRef = useRef(null);

  useEffect(() => {
    if (recentOpen) setRecents(getRecentTrips());
  }, [recentOpen]);

  useClickOutside(recentRef, recentOpen, () => setRecentOpen(false));
  useClickOutside(authMenuRef, authMenuOpen, () => setAuthMenuOpen(false));
  useClickOutside(hamburgerRef, hamburgerOpen, () => setHamburgerOpen(false));
  useClickOutside(placePopoverRef, placePickerOpen, () => setPlacePickerOpen(false));
  useEscapeKey(wishlistOpen, () => setWishlistOpen(false));
  useEscapeKey(placePickerOpen, () => setPlacePickerOpen(false));

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

  // Focus search input when place picker opens
  useEffect(() => {
    if (!placePickerOpen) return;
    const id = requestAnimationFrame(() => popoverSearchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [placePickerOpen]);

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
      showToast('Could not copy link');
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
                <Link
                  to="/dashboard"
                  className="hamburger-item"
                  onClick={() => setHamburgerOpen(false)}
                >
                  <BarChart3 size={14} strokeWidth={2} aria-hidden />
                  <span>Dashboard</span>
                </Link>
              </div>
            )}
          </div>
        </div>

        {showSummary && (() => {
          const area = placeArea || destination || 'Where to?';
          const city = placeCity || '';
          // Date: row 1 = "Wed, 20"; row 2 = "May '26".
          let line1 = '';
          let line2 = '';
          if (date) {
            const d = new Date(date);
            if (!Number.isNaN(d.getTime())) {
              const weekday = d.toLocaleDateString('en-US', { weekday: 'short' });
              const day = d.toLocaleDateString('en-US', { day: '2-digit' });
              const month = d.toLocaleDateString('en-US', { month: 'short' });
              const yy = String(d.getFullYear()).slice(-2);
              line1 = `${weekday} ${day}`;
              line2 = `${month} '${yy}`;
            } else {
              line1 = date;
            }
          }
          const openDatePicker = () => {
            const el = hiddenDateRef.current;
            if (!el) return;
            el.focus();
            try { el.showPicker?.(); } catch {}
          };
          return (
            <div className="search-summary-wrap" ref={placePopoverRef}>
              <div className="search-summary" role="group" aria-label="Edit search">
                <button
                  type="button"
                  className="search-summary-btn search-summary-place"
                  onClick={() => setPlacePickerOpen(true)}
                  aria-label="Edit destination"
                >
                  <span className="search-summary-area">{area}</span>
                  <span className="search-summary-city">{city || '\u200b'}</span>
                </button>
                {date && (
                  <button
                    type="button"
                    className="search-summary-btn search-summary-date"
                    onClick={openDatePicker}
                    aria-label="Edit date"
                  >
                    <span className="search-summary-date-line">{line1}</span>
                    <span className="search-summary-year">{line2}</span>
                  </button>
                )}
              </div>
              <input
                ref={hiddenDateRef}
                className="hidden-date-input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Trip date"
                tabIndex={-1}
              />
              {placePickerOpen && (
                <>
                  <div
                    className="search-summary-backdrop"
                    onMouseDown={() => setPlacePickerOpen(false)}
                    onTouchStart={() => setPlacePickerOpen(false)}
                  />
                  <div className="search-summary-popover">
                    <SmartSearchInput
                      ref={popoverSearchRef}
                      value={destination}
                      onChange={setDestination}
                      onSelect={(dest) => {
                        setPlacePickerOpen(false);
                        search({ destination: dest });
                      }}
                      placeholder="Where to?"
                    />
                  </div>
                </>
              )}
            </div>
          );
        })()}

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

      {wishlistOpen && (
        <ErrorBoundary label="Wishlist" fallback={(err, reset) => (
          <div style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
            <div style={{ background: 'var(--bg-elevated)', borderRadius: 12, padding: 24, maxWidth: 320, textAlign: 'center' }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>Wishlist error</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>{String(err?.message || err)}</div>
              <button className="btn btn-ghost" onClick={() => { reset(); setWishlistOpen(false); }}>Close</button>
            </div>
          </div>
        )}>
          <WishlistOverlay onClose={() => setWishlistOpen(false)} />
        </ErrorBoundary>
      )}
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
