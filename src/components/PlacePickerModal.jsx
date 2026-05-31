import { memo, useMemo, useState, useEffect, useRef } from 'react';
import {
  BedDouble,
  X,
  Star,
  Check,
  Compass,
  Utensils,
  Leaf,
  Gem,
  CalendarPlus,
} from 'lucide-react';
import { formatCount } from '../utils/format';

export const PICKER_TABS = [
  { key: 'activities',  label: 'Activities',  Icon: Compass,   color: '#f97316' },
  { key: 'restaurants', label: 'Restaurants', Icon: Utensils,  color: '#ef4444' },
  { key: 'nature',      label: 'Nature',      Icon: Leaf,      color: '#22c55e' },
  { key: 'gems',        label: 'Hidden gems', Icon: Gem,       color: '#6366f1' },
  { key: 'hotels',      label: 'Hotels',      Icon: BedDouble, color: '#0ea5e9' },
];
export const SESSION_TABS = PICKER_TABS.filter((t) => t.key !== 'hotels');
export const TAB_BY_KEY = Object.fromEntries(PICKER_TABS.map((t) => [t.key, t]));

export const LightPickerRow = memo(function LightPickerRow({ place, category, planned, selected, saved, onToggleSave, onPick, onAddToPlan, showCategoryChip }) {
  const tab = TAB_BY_KEY[category];
  const description = place.wiki?.extract || place.summary;
  const truncatedDesc = description?.length > 110
    ? description.slice(0, 110).trim() + '…'
    : description;
  return (
    <div
      className={`plan-modal-row light ${selected ? 'selected' : ''} ${planned ? 'planned' : ''}`}
    >
      <button type="button" className="plan-modal-row-body" onClick={onPick}>
        {place.photoUrl ? (
          <img
            className="plan-modal-row-photo"
            src={place.photoUrl}
            alt=""
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        ) : (
          <div className="plan-modal-row-photo placeholder" aria-hidden />
        )}
        <div className="plan-modal-row-main">
          <div className="plan-modal-row-name">{place.name}</div>
          {truncatedDesc && (
            <div className="plan-modal-row-meta">{truncatedDesc}</div>
          )}
          <div className="plan-modal-row-foot">
            {place.rating != null && (
              <span className="plan-modal-row-rating">
                ★ {place.rating}
                {place.reviewCount > 0 && (
                  <span className="plan-modal-row-reviews">({formatCount(place.reviewCount)})</span>
                )}
              </span>
            )}
            {showCategoryChip && tab && (
              <span className="plan-modal-row-cat-chip" style={{ color: tab.color, borderColor: tab.color + '55', background: tab.color + '14' }}>
                <tab.Icon size={11} strokeWidth={2} aria-hidden />
                {tab.label}
              </span>
            )}
            {planned && (
              <span className="plan-modal-row-in-plan">
                <Check size={11} strokeWidth={2.25} aria-hidden />
                In plan
              </span>
            )}
            {selected && !planned && (
              <span className="plan-modal-row-in-plan">
                <Check size={11} strokeWidth={2.25} aria-hidden />
                Chosen
              </span>
            )}
          </div>
        </div>
      </button>
      <div className="picker-row-actions">
        {onAddToPlan && (
          <button
            type="button"
            className="picker-plan-add"
            onClick={(e) => { e.stopPropagation(); onAddToPlan(place, category); }}
            aria-label="Add to plan"
            title="Add to plan"
          >
            <CalendarPlus size={14} strokeWidth={2} aria-hidden />
          </button>
        )}
        <button
          type="button"
          className={`picker-fav-toggle ${saved ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
          aria-pressed={saved}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          title={saved ? 'Saved to wishlist (tap to remove)' : 'Save to wishlist'}
        >
          <Star size={14} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden />
        </button>
      </div>
    </div>
  );
}, (prev, next) =>
  prev.place === next.place &&
  prev.category === next.category &&
  prev.planned === next.planned &&
  prev.selected === next.selected &&
  prev.saved === next.saved &&
  prev.showCategoryChip === next.showCategoryChip
);

function PlacePickerModalImpl({
  plannedSet,
  tabs,
  initialTab,
  liveDataByCategory,
  tabLoading,
  fetchTabIfNeeded,
  isSavedFn,
  onToggleSave,
  onClose,
  onPick,
  onAddToPlan,
  title,
  footerSlot,
}) {
  const [activePill, setActivePill] = useState(initialTab);
  const [query, setQuery] = useState('');
  const pillRowRef = useRef(null);

  useEffect(() => {
    if (!fetchTabIfNeeded) return;
    if (liveDataByCategory[activePill] == null) fetchTabIfNeeded(activePill);
  }, [activePill, fetchTabIfNeeded, liveDataByCategory]);

  // Scroll active pill into view. Strip is overflow-x:auto and starts at
  // scrollLeft 0, so a 5-tab (Saved) strip clips a right-side initialTab
  // (e.g. Hotels/Hidden gems) until scrolled. 4-tab (plan) strip fits and
  // hid the bug.
  useEffect(() => {
    const row = pillRowRef.current;
    if (!row) return;
    const btn = row.querySelector(`[data-pill="${activePill}"]`);
    if (btn) btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activePill]);

  const data = liveDataByCategory[activePill];
  const loading = !!tabLoading?.[activePill] && (data == null || data.length === 0);

  const filtered = useMemo(() => {
    const list = data || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)
    );
  }, [data, query]);

  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="plan-modal-head">
          <div className="plan-modal-title">{title}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="picker-pill-row" role="tablist" aria-label="Browse by category" ref={pillRowRef}>
          {tabs.map((t) => {
            const isActive = activePill === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                data-pill={t.key}
                aria-selected={isActive}
                title={t.label}
                className={`picker-pill ${isActive ? 'active' : ''}`}
                style={isActive ? {
                  color: t.color,
                  borderColor: t.color + '55',
                  background: t.color + '14',
                } : undefined}
                onClick={() => setActivePill(t.key)}
              >
                <t.Icon size={14} strokeWidth={2} aria-hidden color={isActive ? t.color : 'currentColor'} />
                {isActive && <span>{t.label}</span>}
              </button>
            );
          })}
        </div>
        <input
          className="input plan-modal-search"
          placeholder="Filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="plan-modal-list">
          {loading ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              Loading {TAB_BY_KEY[activePill]?.label?.toLowerCase()}…
            </div>
          ) : filtered.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {(data || []).length === 0 ? 'Nothing in this category yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((p) => (
              <LightPickerRow
                key={p.placeId}
                place={p}
                category={activePill}
                planned={plannedSet.has(p.placeId)}
                saved={isSavedFn(p)}
                onToggleSave={() => onToggleSave(p, activePill)}
                onPick={() => onPick({ place: p, category: activePill })}
                onAddToPlan={onAddToPlan}
                showCategoryChip
              />
            ))
          )}
        </div>
        {footerSlot}
      </div>
    </div>
  );
}

export const PlacePickerModal = memo(PlacePickerModalImpl, (p, n) =>
  p.plannedSet === n.plannedSet &&
  p.tabs === n.tabs &&
  p.initialTab === n.initialTab &&
  p.liveDataByCategory === n.liveDataByCategory &&
  p.tabLoading === n.tabLoading &&
  p.isSavedFn === n.isSavedFn &&
  p.title === n.title &&
  p.footerSlot === n.footerSlot &&
  p.onAddToPlan === n.onAddToPlan
);
