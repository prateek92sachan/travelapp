import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PHASES, PHASE_LABEL } from '../utils/plan';

const MAX_DAYS = 30;

// Bottom-sheet slot chooser. Presentational: parent wires onCommit to the
// store. `dayCount` is the existing plan's day count (>= 1). `hotelFullDays`
// is a Set of dayIndexes that already hold 2 hotels. onCommit receives
// { dayIndex, phase, newDay } — when newDay is true the store appends a day.
export default function PlanSlotChooser({
  placeName,
  dayCount = 1,
  isHotel = false,
  hotelFullDays,
  onCommit,
  onClose,
}) {
  const days = Math.max(1, dayCount);
  const [day, setDay] = useState(0);
  const [useNewDay, setUseNewDay] = useState(false);
  const atCap = days >= MAX_DAYS;

  const hotelFull = isHotel && !useNewDay && !!hotelFullDays?.has(day);

  const commit = (phase) =>
    onCommit({ dayIndex: useNewDay ? -1 : day, phase, newDay: useNewDay });

  const dayLabel = useNewDay ? 'new day' : `Day ${day + 1}`;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="plan-slot-sheet-backdrop" onClick={onClose}>
      <div
        className="plan-slot-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add to plan"
      >
        <div className="plan-slot-sheet-head">
          <span className="plan-slot-sheet-title">
            Add {placeName ? `"${placeName}"` : 'place'} to plan
          </span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        <div className="plan-slot-section-label">Day</div>
        <div className="plan-slot-chip-row">
          {Array.from({ length: days }, (_, i) => (
            <button
              key={i}
              type="button"
              className={`plan-slot-chip ${!useNewDay && day === i ? 'active' : ''}`}
              aria-pressed={!useNewDay && day === i}
              onClick={() => { setUseNewDay(false); setDay(i); }}
            >
              Day {i + 1}
            </button>
          ))}
          <button
            type="button"
            className={`plan-slot-chip ${useNewDay ? 'active' : ''}`}
            aria-pressed={useNewDay}
            disabled={atCap}
            title={atCap ? 'Max 30 days' : 'Add a new day'}
            onClick={() => setUseNewDay(true)}
          >
            + New day
          </button>
        </div>

        {isHotel ? (
          <>
            <div className="plan-slot-section-label">Hotel</div>
            <button
              type="button"
              className="btn plan-slot-commit"
              disabled={hotelFull}
              onClick={() => commit(null)}
            >
              {hotelFull ? `${dayLabel} already has 2 hotels` : `Set as hotel · ${dayLabel}`}
            </button>
          </>
        ) : (
          <>
            <div className="plan-slot-section-label">Time of day</div>
            <div className="plan-slot-chip-row">
              {PHASES.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="plan-slot-chip phase"
                  onClick={() => commit(p)}
                >
                  {PHASE_LABEL[p]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
