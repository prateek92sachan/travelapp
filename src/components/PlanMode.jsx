import { memo, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  BedDouble,
  Plus,
  X,
  Sun,
  Sunset,
  Moon,
  Heart,
  Check,
  Compass,
  Utensils,
  Leaf,
  Gem,
  Trash2,
} from 'lucide-react';
import { useSearchStore } from '../stores/searchStore';
import { useMapStore } from '../stores/mapStore';
import { useWishlistStore, selectLists } from '../stores/wishlistStore';
import { useTabQuery } from '../hooks/queries/useTabQuery';
import { useViewportQuery } from '../hooks/queries/useViewportQuery';
import {
  PHASES,
  PHASE_LABEL,
  ensurePlan,
  setDays,
  removeDayAt,
  addSession,
  updateSession,
  removeSession,
  setHotelsForDay,
  setPlaceSnapshot,
  durationMinutes,
  formatDuration,
} from '../utils/plan';
import { formatCount } from '../utils/format';

const PICKER_TABS = [
  { key: 'activities',  label: 'Activities',  Icon: Compass,   color: '#f97316' },
  { key: 'restaurants', label: 'Restaurants', Icon: Utensils,  color: '#ef4444' },
  { key: 'nature',      label: 'Nature',      Icon: Leaf,      color: '#22c55e' },
  { key: 'gems',        label: 'Hidden gems', Icon: Gem,       color: '#6366f1' },
  { key: 'hotels',      label: 'Hotels',      Icon: BedDouble, color: '#0ea5e9' },
];
const SESSION_TABS = PICKER_TABS.filter((t) => t.key !== 'hotels');
const TAB_BY_KEY = Object.fromEntries(PICKER_TABS.map((t) => [t.key, t]));

const PHASE_ICON = { morning: Sun, evening: Sunset, night: Moon };
const PHASE_COLOR = { morning: '#f59e0b', evening: '#f97316', night: '#6366f1' };

export default function PlanMode({ list }) {
  const activeTab = useSearchStore((s) => s.activeTab);
  const viewportTarget = useMapStore((s) => s.viewportTarget);
  const wUpdatePlan = useWishlistStore((s) => s.updatePlan);
  const wAddPlaceSmart = useWishlistStore((s) => s.addPlaceSmart);
  const wRemovePlace = useWishlistStore((s) => s.removePlace);
  const wishlistLists = useWishlistStore(selectLists);

  // Plan-mode lists hold the itinerary; saved places belong to the matching
  // Saved-mode list for the same city. Look it up (may not exist until the
  // user actually saves a place — addPlaceSmart will lazily create it).
  const savedListIdForCity = useMemo(() => {
    if (!list?.destination) return null;
    const norm = list.destination.toLowerCase();
    return (
      wishlistLists.find(
        (l) => l.mode === 'saved' && l.destination?.toLowerCase() === norm
      )?.id || null
    );
  }, [wishlistLists, list?.destination]);

  // Tab data — one useTabQuery per category, assembled into the same shape
  // PlanMode's existing memos expect.
  const activitiesQ = useTabQuery('activities');
  const restaurantsQ = useTabQuery('restaurants');
  const natureQ = useTabQuery('nature');
  const gemsQ = useTabQuery('gems');
  const hotelsQ = useTabQuery('hotels');
  const tabData = useMemo(
    () => ({
      activities: activitiesQ.data ?? null,
      restaurants: restaurantsQ.data ?? null,
      nature: natureQ.data ?? null,
      gems: gemsQ.data ?? null,
      hotels: hotelsQ.data ?? null
    }),
    [activitiesQ.data, restaurantsQ.data, natureQ.data, gemsQ.data, hotelsQ.data]
  );
  const tabLoading = useMemo(
    () => ({
      activities: activitiesQ.isFetching,
      restaurants: restaurantsQ.isFetching,
      nature: natureQ.isFetching,
      gems: gemsQ.isFetching,
      hotels: hotelsQ.isFetching
    }),
    [
      activitiesQ.isFetching,
      restaurantsQ.isFetching,
      natureQ.isFetching,
      gemsQ.isFetching,
      hotelsQ.isFetching
    ]
  );
  // Viewport overrides for pickers (when user has panned the map).
  const vpActQ = useViewportQuery({ target: viewportTarget, category: 'activities' });
  const vpRestQ = useViewportQuery({ target: viewportTarget, category: 'restaurants' });
  const vpNatQ = useViewportQuery({ target: viewportTarget, category: 'nature' });
  const vpGemsQ = useViewportQuery({ target: viewportTarget, category: 'gems' });
  const vpHotelsQ = useViewportQuery({ target: viewportTarget, category: 'hotels' });
  const viewportItems = useMemo(() => {
    if (!viewportTarget) return null;
    return {
      activities: vpActQ.data ?? null,
      restaurants: vpRestQ.data ?? null,
      nature: vpNatQ.data ?? null,
      gems: vpGemsQ.data ?? null,
      hotels: vpHotelsQ.data ?? null
    };
  }, [viewportTarget, vpActQ.data, vpRestQ.data, vpNatQ.data, vpGemsQ.data, vpHotelsQ.data]);

  // Adapter wrappers preserving the legacy callback shapes.
  const updateListPlan = (listId, p) => wUpdatePlan({ listId, plan: p });
  const addPlaceToWishlist = (place, category) =>
    wAddPlaceSmart({
      place,
      category,
      viewportCity: list?.destination,
      fallbackListId: savedListIdForCity,
    });
  const removePlaceFromWishlist = (placeId) => {
    if (!savedListIdForCity) return;
    wRemovePlace({ listId: savedListIdForCity, placeId });
  };
  const isWishlisted = (placeId) => {
    if (!savedListIdForCity) return false;
    return useWishlistStore.getState().isWishlisted(savedListIdForCity, placeId);
  };
  const fetchTabIfNeeded = () => {}; // queries auto-fetch; noop for compat
  const plan = useMemo(() => ensurePlan(list?.plan), [list?.plan]);

  const items = list?.items || [];
  const itemById = useMemo(() => {
    const map = { ...(plan.placeSnapshots || {}) };
    // list.items wins over snapshots (more up-to-date fields like wiki enrichment).
    for (const it of items) map[it.placeId] = it;
    return map;
  }, [items, plan.placeSnapshots]);

  // Precomputed set of placeIds present in the plan. O(1) lookup per row in
  // the picker instead of an O(days × phases × sessions) scan via isPlacePlanned().
  const plannedSet = useMemo(() => {
    const s = new Set();
    for (const day of plan.itinerary) {
      for (const phase of PHASES) {
        for (const sess of day.phases[phase]) s.add(sess.placeId);
      }
    }
    return s;
  }, [plan]);

  // Live data sources for the pickers — viewport takes precedence over city tabData.
  const liveDataByCategory = useMemo(() => {
    const out = {};
    for (const t of PICKER_TABS) {
      out[t.key] = (viewportItems && viewportItems[t.key]) || tabData?.[t.key] || null;
    }
    return out;
  }, [viewportItems, tabData]);

  const initialSessionPill = useMemo(() => {
    if (activeTab && activeTab !== 'wishlist' && activeTab !== 'hotels') return activeTab;
    return 'activities';
  }, [activeTab]);

  const apply = useCallback(
    (next) => updateListPlan(list.id, next),
    [updateListPlan, list?.id]
  );

  const [picker, setPicker] = useState(null); // { dayIndex, phase } | null
  const [hotelPicker, setHotelPicker] = useState(null); // { dayIndex } | null
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // Clamp active day if days shrinks.
  useEffect(() => {
    if (activeDayIndex >= plan.days) setActiveDayIndex(Math.max(0, plan.days - 1));
  }, [plan.days, activeDayIndex]);

  if (!list) return null;

  const addDay = () => {
    const next = setDays(plan, plan.days + 1);
    apply(next);
    setActiveDayIndex(next.days - 1);
  };

  const removeActiveDay = () => {
    if (plan.days <= 1) return;
    const label = `Day ${activeDayIndex + 1}`;
    if (!window.confirm(`Delete ${label}? Sessions and hotels in this day will be removed.`)) return;
    const next = removeDayAt(plan, activeDayIndex);
    apply(next);
    setActiveDayIndex((idx) => Math.max(0, Math.min(idx, next.days - 1)));
  };

  const activeDay = plan.itinerary[activeDayIndex];

  const dayTabStrip = (
    <div className="plan-header">
      <div className="plan-day-tabs">
        <div className="plan-day-tabs-scroll" role="tablist" aria-label="Days">
          {plan.itinerary.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === activeDayIndex}
              className={`plan-day-tab ${i === activeDayIndex ? 'active' : ''}`}
              onClick={() => setActiveDayIndex(i)}
            >
              Day {i + 1}
            </button>
          ))}
        </div>
        <div className="plan-day-tabs-actions">
          <button
            type="button"
            className="plan-day-tab plan-day-add"
            onClick={addDay}
            disabled={plan.days >= 30}
            aria-label="Add day"
            title="Add day"
          >
            <Plus size={13} strokeWidth={2.25} aria-hidden />
          </button>
          {plan.days > 1 && (
            <button
              type="button"
              className="plan-day-tab plan-day-remove"
              onClick={removeActiveDay}
              aria-label={`Delete Day ${activeDayIndex + 1}`}
              title={`Delete Day ${activeDayIndex + 1}`}
            >
              <Trash2 size={13} strokeWidth={1.75} aria-hidden />
            </button>
          )}
        </div>
      </div>
      <div className="plan-total-line">
        {totalExpenseLabel(plan)}
      </div>
    </div>
  );

  return (
    <div className="plan-mode">
      {activeDay && (
        <DayBlock
          dayIndex={activeDayIndex}
          day={activeDay}
          itemById={itemById}
          tabStrip={dayTabStrip}
          onOpenPicker={(phase) => setPicker({ dayIndex: activeDayIndex, phase })}
          onOpenHotelPicker={() => setHotelPicker({ dayIndex: activeDayIndex })}
          onUpdateSession={(args) => apply(updateSession(plan, args))}
          onRemoveSession={(args) => apply(removeSession(plan, args))}
          onRemoveHotel={(hotelId) => {
            const next = activeDay.hotels.filter((id) => id !== hotelId);
            apply(setHotelsForDay(plan, { dayIndex: activeDayIndex, hotels: next }));
          }}
        />
      )}

      {picker && createPortal(
        <PlacePickerModal
          plannedSet={plannedSet}
          tabs={SESSION_TABS}
          initialTab={initialSessionPill}
          liveDataByCategory={liveDataByCategory}
          tabLoading={tabLoading}
          fetchTabIfNeeded={fetchTabIfNeeded}
          isSavedFn={(id) => isWishlisted(id)}
          onToggleSave={(place, category) => {
            if (isWishlisted(place.placeId)) {
              removePlaceFromWishlist(place.placeId);
            } else {
              addPlaceToWishlist(place, category);
            }
          }}
          onClose={() => setPicker(null)}
          onPick={({ place, category }) => {
            let nextPlan = setPlaceSnapshot(plan, place, category);
            nextPlan = addSession(nextPlan, { ...picker, placeId: place.placeId });
            apply(nextPlan);
            setPicker(null);
          }}
          title={`Add to ${PHASE_LABEL[picker.phase]} — Day ${picker.dayIndex + 1}`}
        />,
        document.body
      )}

      {hotelPicker && createPortal(
        <HotelPickerModal
          plan={plan}
          currentDayHotels={plan.itinerary[hotelPicker.dayIndex]?.hotels || []}
          hotels={liveDataByCategory.hotels || []}
          hotelsLoading={!!tabLoading?.hotels}
          fetchTabIfNeeded={fetchTabIfNeeded}
          isSavedFn={(id) => isWishlisted(id)}
          onToggleSave={(place) => {
            if (isWishlisted(place.placeId)) {
              removePlaceFromWishlist(place.placeId);
            } else {
              addPlaceToWishlist(place, 'hotels');
            }
          }}
          onClose={() => setHotelPicker(null)}
          onPick={({ place }) => {
            const current = plan.itinerary[hotelPicker.dayIndex].hotels;
            const next = current.includes(place.placeId)
              ? current.filter((id) => id !== place.placeId)
              : [...current, place.placeId];
            let nextPlan = setPlaceSnapshot(plan, place, 'hotels');
            nextPlan = setHotelsForDay(nextPlan, { dayIndex: hotelPicker.dayIndex, hotels: next });
            apply(nextPlan);
            setHotelPicker(null);
          }}
          title={`Hotel — Day ${hotelPicker.dayIndex + 1}`}
        />,
        document.body
      )}
    </div>
  );
}

function DayBlock({
  dayIndex,
  day,
  itemById,
  tabStrip,
  onOpenPicker,
  onOpenHotelPicker,
  onUpdateSession,
  onRemoveSession,
  onRemoveHotel,
}) {
  const dayTotal = useMemo(() => {
    let sum = 0;
    for (const phase of PHASES) {
      for (const s of day.phases[phase]) {
        const n = parseFloat(s.expense);
        if (!Number.isNaN(n)) sum += n;
      }
    }
    return sum;
  }, [day]);

  return (
    <section className="plan-day">
      {tabStrip}
      {dayTotal > 0 && (
        <header className="plan-day-head">
          <div className="plan-day-total">≈ {dayTotal.toFixed(0)}</div>
        </header>
      )}

      <div className="plan-hotels-row">
        <BedDouble size={14} strokeWidth={1.75} aria-hidden />
        <div className="plan-hotels-chips">
          {day.hotels.length === 0 && (
            <span className="plan-hotels-empty">No hotel set</span>
          )}
          {day.hotels.map((hotelId) => {
            const hotel = itemById[hotelId];
            if (!hotel) return null;
            return (
              <span key={hotelId} className="plan-hotel-chip">
                <span className="plan-hotel-chip-name">{hotel.name}</span>
                <button
                  type="button"
                  className="plan-chip-x"
                  aria-label={`Remove ${hotel.name}`}
                  onClick={() => onRemoveHotel(hotelId)}
                >
                  <X size={11} strokeWidth={2} aria-hidden />
                </button>
              </span>
            );
          })}
          {day.hotels.length < 2 && (
            <button
              type="button"
              className="plan-add-hotel-btn"
              onClick={onOpenHotelPicker}
            >
              <Plus size={12} strokeWidth={2} aria-hidden />
              {day.hotels.length === 0 ? 'Add hotel' : 'Add 2nd hotel'}
            </button>
          )}
        </div>
      </div>

      {PHASES.map((phase) => {
        const Icon = PHASE_ICON[phase];
        const sessions = day.phases[phase];
        return (
          <div key={phase} className="plan-phase">
            <div className="plan-phase-head">
              <Icon size={13} strokeWidth={1.75} color={PHASE_COLOR[phase]} aria-hidden />
              <span className="plan-phase-label">{PHASE_LABEL[phase]}</span>
              <span className="plan-phase-count">{sessions.length}</span>
            </div>
            <div className="plan-phase-body">
              {sessions.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  place={itemById[session.placeId]}
                  onChange={(patch) =>
                    onUpdateSession({ dayIndex, phase, sessionId: session.id, patch })
                  }
                  onRemove={() =>
                    onRemoveSession({ dayIndex, phase, sessionId: session.id })
                  }
                />
              ))}
              <button
                type="button"
                className="plan-add-session-btn"
                onClick={() => onOpenPicker(phase)}
              >
                <Plus size={13} strokeWidth={2} aria-hidden />
                Add session
              </button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

function SessionCard({ session, place, onChange, onRemove }) {
  const mins = durationMinutes(session.startTime, session.endTime);
  // Tap-to-edit: time + expense render as plain text (no clipping boxes) and
  // only swap to an input on tap. 'start' | 'end' | 'expense' | null.
  const [editing, setEditing] = useState(null);
  const editRef = useRef(null);

  useEffect(() => {
    const el = editRef.current;
    if (!el) return;
    el.focus();
    // Open the native time picker straight away when editing a time field.
    if (editing === 'start' || editing === 'end') el.showPicker?.();
  }, [editing]);

  return (
    <div className="plan-session">
      {place?.photoUrl && (
        <img
          className="plan-session-photo"
          src={place.photoUrl}
          alt=""
          loading="lazy"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
      <div className="plan-session-body">
        <div className="plan-session-head">
          <div className="plan-session-name">{place?.name || '(removed from list)'}</div>
          <button
            type="button"
            className="plan-chip-x"
            aria-label="Remove session"
            onClick={onRemove}
          >
            <X size={12} strokeWidth={2} aria-hidden />
          </button>
        </div>
        {place?.address && (
          <div className="plan-session-addr">{place.address}</div>
        )}
        <div className="plan-session-row">
          {editing === 'start' ? (
            <input
              ref={editRef}
              className="plan-inline-input"
              type="time"
              value={session.startTime}
              onChange={(e) => onChange({ startTime: e.target.value })}
              onBlur={() => setEditing(null)}
              aria-label="Start time"
            />
          ) : (
            <button
              type="button"
              className="plan-time-text"
              onClick={() => setEditing('start')}
              aria-label={`Start time ${session.startTime || 'not set'}, tap to edit`}
            >
              {session.startTime || '--:--'}
            </button>
          )}
          <span className="plan-inline-sep">→</span>
          {editing === 'end' ? (
            <input
              ref={editRef}
              className="plan-inline-input"
              type="time"
              value={session.endTime}
              onChange={(e) => onChange({ endTime: e.target.value })}
              onBlur={() => setEditing(null)}
              aria-label="End time"
            />
          ) : (
            <button
              type="button"
              className="plan-time-text"
              onClick={() => setEditing('end')}
              aria-label={`End time ${session.endTime || 'not set'}, tap to edit`}
            >
              {session.endTime || '--:--'}
            </button>
          )}
          <span className="plan-inline-dur">{formatDuration(mins)}</span>
          {editing === 'expense' ? (
            <input
              ref={editRef}
              className="plan-inline-input plan-inline-expense"
              type="text"
              inputMode="decimal"
              placeholder="₹"
              value={session.expense || ''}
              onChange={(e) => onChange({ expense: e.target.value })}
              onBlur={() => setEditing(null)}
              aria-label="Expense"
            />
          ) : (
            <button
              type="button"
              className="plan-price-text"
              onClick={() => setEditing('expense')}
              aria-label={`Expense ${session.expense ? `₹${session.expense}` : 'not set'}, tap to edit`}
            >
              {session.expense ? `₹${session.expense}` : '₹—'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const LightPickerRow = memo(function LightPickerRow({ place, category, planned, selected, saved, onToggleSave, onPick, showCategoryChip }) {
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
      <button
        type="button"
        className={`picker-fav-toggle ${saved ? 'on' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        title={saved ? 'Saved to wishlist (tap to remove)' : 'Save to wishlist'}
      >
        <Heart size={14} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden />
      </button>
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
  title,
}) {
  const [activePill, setActivePill] = useState(initialTab);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!fetchTabIfNeeded) return;
    if (liveDataByCategory[activePill] == null) fetchTabIfNeeded(activePill);
  }, [activePill, fetchTabIfNeeded, liveDataByCategory]);

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
        <div className="picker-pill-row" role="tablist" aria-label="Browse by category">
          {tabs.map((t) => {
            const isActive = activePill === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
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
                saved={isSavedFn(p.placeId)}
                onToggleSave={() => onToggleSave(p, activePill)}
                onPick={() => onPick({ place: p, category: activePill })}
                showCategoryChip
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

const PlacePickerModal = memo(PlacePickerModalImpl, (p, n) =>
  p.plannedSet === n.plannedSet &&
  p.tabs === n.tabs &&
  p.initialTab === n.initialTab &&
  p.liveDataByCategory === n.liveDataByCategory &&
  p.tabLoading === n.tabLoading &&
  p.isSavedFn === n.isSavedFn &&
  p.title === n.title
);

function HotelPickerModalImpl({
  plan,
  hotels,
  hotelsLoading,
  currentDayHotels,
  fetchTabIfNeeded,
  isSavedFn,
  onToggleSave,
  onClose,
  onPick,
  title,
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!fetchTabIfNeeded) return;
    if (hotels == null || hotels.length === 0) fetchTabIfNeeded('hotels');
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = hotelsLoading && (!hotels || hotels.length === 0);
  const filtered = useMemo(() => {
    const list = hotels || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) => p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)
    );
  }, [hotels, query]);

  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="plan-modal-head">
          <div className="plan-modal-title">{title}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <input
          className="input plan-modal-search"
          placeholder="Filter hotels…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="plan-modal-list">
          {loading ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              Loading hotels…
            </div>
          ) : filtered.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {(hotels || []).length === 0 ? 'No hotels found here yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((p) => {
              const selected = currentDayHotels.includes(p.placeId);
              return (
                <LightPickerRow
                  key={p.placeId}
                  place={p}
                  category="hotels"
                  selected={selected}
                  saved={isSavedFn(p.placeId)}
                  onToggleSave={() => onToggleSave(p)}
                  onPick={() => onPick({ place: p })}
                />
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

const HotelPickerModal = memo(HotelPickerModalImpl, (p, n) =>
  p.hotels === n.hotels &&
  p.hotelsLoading === n.hotelsLoading &&
  p.currentDayHotels === n.currentDayHotels &&
  p.isSavedFn === n.isSavedFn &&
  p.title === n.title
);

function totalExpenseLabel(plan) {
  let sum = 0;
  for (const day of plan.itinerary) {
    for (const phase of PHASES) {
      for (const s of day.phases[phase]) {
        const n = parseFloat(s.expense);
        if (!Number.isNaN(n)) sum += n;
      }
    }
  }
  if (sum === 0) return '';
  return `Total ≈ ${sum.toFixed(0)}`;
}
