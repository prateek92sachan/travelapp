import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Utensils, Leaf, Gem, Heart, Map } from 'lucide-react';
import TabbedPlacesWidget from './TabbedPlacesWidget';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useTrip } from '../hooks/useTrip';

const MOBILE_TABS = [
  { key: 'activities',  Icon: Compass,  label: 'Activities',  color: '#f97316' },
  { key: 'restaurants', Icon: Utensils, label: 'Restaurants', color: '#ef4444' },
  { key: 'nature',      Icon: Leaf,     label: 'Nature',      color: '#22c55e' },
  { key: 'gems',        Icon: Gem,      label: 'Hidden gems', color: '#6366f1' },
  { key: 'wishlist',    Icon: Heart,    label: 'Wishlist',    color: '#ff385c', dividerBefore: true },
];

export default function PlacesDrawer() {
  const isDesktop = useIsDesktop();
  const { activeTab, switchTab } = useTrip();
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const drawerRef = useRef(null);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Close desktop drawer on outside click
  useEffect(() => {
    function onClick(e) {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setDesktopExpanded(false);
      }
    }
    if (desktopExpanded) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [desktopExpanded]);

  // Esc closes mobile overlay
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setMobileExpanded(false); }
    if (mobileExpanded) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileExpanded]);

  // Push a history entry when overlay opens so swipe-back closes it
  // instead of navigating away from the site.
  useEffect(() => {
    if (!mobileExpanded) return;
    history.pushState({ placesOverlay: true }, '');
    function onPop() { setMobileExpanded(false); }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // If overlay closes programmatically (not via back), clean up the
      // extra history entry so the back button still works normally.
      if (history.state?.placesOverlay) history.back();
    };
  }, [mobileExpanded]);

  if (!isDesktop) {
    return (
      <div className="places-mobile-card">
        <div className="mobile-places-tabs" role="toolbar" aria-label="Place categories">
          {MOBILE_TABS.map((t) => (
            <div key={t.key} className="mobile-tab-slot">
              {t.dividerBefore && (
                <div className="mobile-bar-divider" aria-hidden="true" />
              )}
              <button
                type="button"
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
