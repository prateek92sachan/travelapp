import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Utensils, Leaf, Gem, BedDouble, Heart, Map } from 'lucide-react';
import TabbedPlacesWidget from './TabbedPlacesWidget';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useTrip } from '../hooks/useTrip';
import { useEscapeKey } from '../hooks/useEscapeKey';

const MOBILE_TABS = [
  { key: 'activities',  Icon: Compass,   label: 'Activities',  color: '#f97316' },
  { key: 'restaurants', Icon: Utensils,  label: 'Restaurants', color: '#ef4444' },
  { key: 'nature',      Icon: Leaf,      label: 'Nature',      color: '#22c55e' },
  { key: 'gems',        Icon: Gem,       label: 'Hidden gems', color: '#6366f1' },
  { key: 'hotels',      Icon: BedDouble, label: 'Hotels',      color: '#0ea5e9' },
  { key: 'wishlist',    Icon: Heart,     label: 'Wishlist',    color: '#ff385c', dividerBefore: true },
];

export default function PlacesDrawer() {
  const isDesktop = useIsDesktop();
  const { activeTab, switchTab } = useTrip();
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const drawerRef = useRef(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const mobileTabsRef = useRef(null);

  useEffect(() => {
    const nav = mobileTabsRef.current;
    if (!nav) return;
    const btn = nav.querySelector(`[data-tab="${activeTab}"]`);
    if (btn) btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  // Close desktop drawer on outside click — but ignore clicks on portaled
  // overlays (detail panel backdrop, plan picker modals), since those live
  // outside drawerRef and would otherwise collapse the drawer when the user
  // dismisses a detail card.
  useEffect(() => {
    function onClick(e) {
      if (!drawerRef.current) return;
      if (drawerRef.current.contains(e.target)) return;
      if (e.target.closest('.detail-backdrop, .detail-panel, .plan-modal-overlay')) return;
      setDesktopExpanded(false);
    }
    if (desktopExpanded) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [desktopExpanded]);

  useEscapeKey(mobileExpanded, () => setMobileExpanded(false));

  // Open the mobile overlay when a map marker is clicked
  useEffect(() => {
    function onOpenPlaces() {
      if (!isDesktop) setMobileExpanded(true);
    }
    window.addEventListener('travelapp:openPlaces', onOpenPlaces);
    return () => window.removeEventListener('travelapp:openPlaces', onOpenPlaces);
  }, [isDesktop]);

  // Push a history entry when overlay opens so swipe-back closes it
  // instead of navigating away from the site.
  useEffect(() => {
    if (!mobileExpanded) return;
    history.pushState({ placesOverlay: true }, '');

    // iOS PWA fires a spurious popstate on app resume from background.
    // Track visibility changes so we can ignore those ghost events.
    let resumingFromBackground = false;
    let clearResumeTimer = null;

    function onVisibilityChange() {
      if (document.hidden) {
        resumingFromBackground = true;
        clearTimeout(clearResumeTimer);
      } else {
        clearResumeTimer = setTimeout(() => { resumingFromBackground = false; }, 400);
      }
    }

    function onPop() {
      if (resumingFromBackground) return;
      setMobileExpanded(false);
    }

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('popstate', onPop);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('popstate', onPop);
      clearTimeout(clearResumeTimer);
      // If overlay closes programmatically (not via back), clean up the
      // extra history entry so the back button still works normally.
      if (history.state?.placesOverlay) history.back();
    };
  }, [mobileExpanded]);

  if (!isDesktop) {
    return (
      <div className="places-mobile-card">
        <div className="mobile-places-tabs" role="toolbar" aria-label="Place categories" ref={mobileTabsRef}>
          {MOBILE_TABS.map((t) => (
            <div key={t.key} className="mobile-tab-slot">
              {t.dividerBefore && (
                <div className="mobile-bar-divider" aria-hidden="true" />
              )}
              <button
                type="button"
                data-tab={t.key}
                className={`mobile-tab-btn ${activeTab === t.key ? 'active' : ''}`}
                aria-label={t.label}
                title={t.label}
                style={activeTab === t.key
                  ? { background: t.color + '18', borderRadius: '999px' }
                  : undefined}
                onClick={() => { switchTab(t.key); setMobileExpanded(true); }}
              >
                <t.Icon
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden
                  color={t.color}
                />
              </button>
            </div>
          ))}
        </div>
        {mobileExpanded && createPortal(
          <div className="places-mobile-overlay">
            <div
              className="places-mobile-overlay-backdrop"
              onClick={() => setMobileExpanded(false)}
            />
            <div className="places-mobile-overlay-panel">
              <TabbedPlacesWidget expandable={false} />
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // Desktop view: render collapsible drawer or pill
  return (
    <div ref={drawerRef} className={`places-drawer ${desktopExpanded ? 'open' : 'closed'}`}>
      {!desktopExpanded ? (
        <button
          type="button"
          className="places-drawer-pill"
          onClick={() => setDesktopExpanded(true)}
          title="Show places list"
          aria-label="Expand places details"
        >
          <Map size={16} strokeWidth={1.75} aria-hidden className="places-drawer-icon" />
          <span className="places-drawer-label">Places</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            className="places-drawer-handle"
            onClick={() => setDesktopExpanded((o) => !o)}
            aria-label={desktopExpanded ? 'Hide places list' : 'Show places list'}
            aria-expanded={desktopExpanded}
            title={desktopExpanded ? 'Hide places list' : 'Show places list'}
          >
            {'›'}
          </button>
          <div className="places-drawer-body">
            <TabbedPlacesWidget />
          </div>
        </>
      )}
    </div>
  );
}
