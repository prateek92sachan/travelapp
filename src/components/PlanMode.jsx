import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { BedDouble, Plus, X, Sun, Sunset, Moon, AlertCircle } from 'lucide-react';
import { useTrip } from '../hooks/useTrip';
import {
  PHASES,
  PHASE_LABEL,
  ensurePlan,
  setDays,
  addSession,
  updateSession,
  removeSession,
  setHotelsForDay,
  durationMinutes,
  formatDuration,
  isPlacePlanned,
} from '../utils/plan';

const PHASE_ICON = { morning: Sun, evening: Sunset, night: Moon };
const PHASE_COLOR = { morning: '#f59e0b', evening: '#f97316', night: '#6366f1' };

export default function PlanMode({ list }) {
  const { updateListPlan } = useTrip();
  const plan = useMemo(() => ensurePlan(list?.plan), [list?.plan]);

  const items = list?.items || [];
  const hotelItems = useMemo(() => items.filter((p) => p.category === 'hotels'), [items]);
  const nonHotelItems = useMemo(() => items.filter((p) => p.category !== 'hotels'), [items]);
  const itemById = useMemo(() => {
    const map = {};
    for (const it of items) map[it.placeId] = it;
    return map;
  }, [items]);

  const apply = useCallback(
    (next) => updateListPlan(list.id, next),
    [updateListPlan, list?.id]
  );

  const [picker, setPicker] = useState(null); // { dayIndex, phase } | null
  const [hotelPicker, setHotelPicker] = useState(null); // { dayIndex } | null

  if (!list) return null;

  const onDaysChange = (n) => apply(setDays(plan, n));

  return (
    <div className="plan-mode">
      <div className="plan-header">
        <div className="plan-days-control">
          <label className="plan-days-label">Days</label>
          <div className="plan-days-stepper">
            <button
              type="button"
              className="plan-step-btn"
              onClick={() => onDaysChange(plan.days - 1)}
              disabled={plan.days <= 1}
              aria-label="Fewer days"
            >−</button>
            <span className="plan-days-count">{plan.days}</span>
            <button
              type="button"
              className="plan-step-btn"
              onClick={() => onDaysChange(plan.days + 1)}
              disabled={plan.days >= 30}
              aria-label="More days"
            >+</button>
          </div>
        </div>
        <div className="plan-total-line">
          {totalExpenseLabel(plan)}
        </div>
      </div>

      {nonHotelItems.length === 0 && (
        <div className="plan-empty-hint">
          Save activities, restaurants, nature, or hidden gems to this list first — then add them to days here.
        </div>
      )}

      {plan.itinerary.map((day, dayIndex) => (
        <DayBlock
          key={dayIndex}
          dayIndex={dayIndex}
          day={day}
          itemById={itemById}
          onOpenPicker={(phase) => setPicker({ dayIndex, phase })}
          onOpenHotelPicker={() => setHotelPicker({ dayIndex })}
          onUpdateSession={(args) => apply(updateSession(plan, args))}
          onRemoveSession={(args) => apply(removeSession(plan, args))}
          onRemoveHotel={(hotelId) => {
            const next = day.hotels.filter((id) => id !== hotelId);
            apply(setHotelsForDay(plan, { dayIndex, hotels: next }));
          }}
        />
      ))}

      {picker && createPortal(
        <PlacePickerModal
          items={nonHotelItems}
          plan={plan}
          onClose={() => setPicker(null)}
          onPick={(place) => {
            apply(addSession(plan, { ...picker, placeId: place.placeId }));
            setPicker(null);
          }}
          title={`Add to ${PHASE_LABEL[picker.phase]} — Day ${picker.dayIndex + 1}`}
        />,
        document.body
      )}

      {hotelPicker && createPortal(
        <HotelPickerModal
          hotels={hotelItems}
          currentDayHotels={plan.itinerary[hotelPicker.dayIndex]?.hotels || []}
          onClose={() => setHotelPicker(null)}
          onPick={(hotelId) => {
            const current = plan.itinerary[hotelPicker.dayIndex].hotels;
            const next = current.includes(hotelId)
              ? current.filter((id) => id !== hotelId)
              : [...current, hotelId];
            apply(setHotelsForDay(plan, { dayIndex: hotelPicker.dayIndex, hotels: next }));
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
      <header className="plan-day-head">
        <div className="plan-day-title">Day {dayIndex + 1}</div>
        {dayTotal > 0 && (
          <div className="plan-day-total">≈ {dayTotal.toFixed(0)}</div>
        )}
      </header>

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
  return (
    <div className="plan-session">
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
      <div className="plan-session-grid">
        <label className="plan-field">
          <span>Start</span>
          <input
            type="time"
            value={session.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
          />
        </label>
        <label className="plan-field">
          <span>End</span>
          <input
            type="time"
            value={session.endTime}
            onChange={(e) => onChange({ endTime: e.target.value })}
          />
        </label>
        <div className="plan-field">
          <span>Duration</span>
          <div className="plan-field-readout">{formatDuration(mins)}</div>
        </div>
        <label className="plan-field">
          <span>Expense</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={session.expense || ''}
            onChange={(e) => onChange({ expense: e.target.value })}
          />
        </label>
      </div>
    </div>
  );
}

function PlacePickerModal({ items, plan, onClose, onPick, title }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (p) =>
        p.name?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q)
    );
  }, [items, query]);
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
          autoFocus
          placeholder="Filter saved places…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="plan-modal-list">
          {filtered.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              {items.length === 0 ? 'No saved places yet.' : 'No matches.'}
            </div>
          ) : (
            filtered.map((p) => {
              const planned = isPlacePlanned(plan, p.placeId);
              return (
                <button
                  key={p.placeId}
                  type="button"
                  className="plan-modal-row"
                  onClick={() => onPick(p)}
                >
                  <div className="plan-modal-row-main">
                    <div className="plan-modal-row-name">{p.name}</div>
                    {p.category && (
                      <div className="plan-modal-row-meta">{p.category}</div>
                    )}
                  </div>
                  {planned && (
                    <span className="plan-modal-row-warn" title="Already in plan">
                      <AlertCircle size={11} strokeWidth={2} aria-hidden />
                      planned
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function HotelPickerModal({ hotels, currentDayHotels, onClose, onPick, title }) {
  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="plan-modal-head">
          <div className="plan-modal-title">{title}</div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>
        <div className="plan-modal-list">
          {hotels.length === 0 ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>
              No hotels saved to this list yet.
            </div>
          ) : (
            hotels.map((h) => {
              const selected = currentDayHotels.includes(h.placeId);
              return (
                <button
                  key={h.placeId}
                  type="button"
                  className={`plan-modal-row ${selected ? 'selected' : ''}`}
                  onClick={() => onPick(h.placeId)}
                >
                  <div className="plan-modal-row-main">
                    <div className="plan-modal-row-name">{h.name}</div>
                    {h.address && (
                      <div className="plan-modal-row-meta">{h.address}</div>
                    )}
                  </div>
                  {selected && <span className="plan-modal-row-warn">✓ chosen</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

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
