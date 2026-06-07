import { memo, useEffect, useRef } from 'react';
import { Compass, Utensils, Leaf, Gem, BedDouble } from 'lucide-react';

export const PLACE_TABS = [
  { key: 'activities',  label: 'Activities',  Icon: Compass,   color: '#f97316' },
  { key: 'restaurants', label: 'Restaurants', Icon: Utensils,  color: '#ef4444' },
  { key: 'nature',      label: 'Nature',      Icon: Leaf,      color: '#22c55e' },
  { key: 'gems',        label: 'Hidden gems', Icon: Gem,       color: '#6366f1' },
  { key: 'hotels',      label: 'Hotels',      Icon: BedDouble, color: '#0ea5e9' },
];

export const TabNav = memo(function TabNav({ activeTab, tabs, onSwitch }) {
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector(`[data-tab="${activeTab}"]`);
    if (btn) btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <div className="tab-nav" role="tablist" ref={navRef}>
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            data-tab={t.key}
            aria-selected={isActive}
            className={`tab-button ${isActive ? 'active' : ''}`}
            title={t.label}
            onClick={() => onSwitch(t.key)}
          >
            <t.Icon size={19} strokeWidth={2} aria-hidden color={t.color} />
            {isActive && <span>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}, (prev, next) => prev.activeTab === next.activeTab && prev.tabs === next.tabs);
