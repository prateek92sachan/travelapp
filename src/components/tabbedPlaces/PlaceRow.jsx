import { memo } from 'react';
import { Star, CalendarPlus } from 'lucide-react';
import { formatCount, formatPrice } from '../../utils/format';

export const PlaceRow = memo(function PlaceRow({
  place: a,
  index: i,
  selected,
  onSelect,
  saved,
  activeListName,
  onSave,
  onRemove,
  onAddToPlan,
}) {
  const description = a.wiki?.extract || a.summary;
  const truncated =
    description?.length > 140 ? description.slice(0, 140).trim() + '...' : description;

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const toggleWishlist = (e) => {
    e.stopPropagation();
    if (saved) onRemove();
    else onSave();
  };

  const addToPlan = (e) => {
    e.stopPropagation();
    onAddToPlan?.();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`activity-item ${selected ? 'selected' : ''}`}
      data-place-id={a.placeId}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      aria-pressed={selected}
    >
      {a.photoUrl && (
        <div className="activity-photo">
          <img
            src={a.photoUrl}
            alt={a.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="activity-content">
        <div className="activity-row-top">
          <span className="activity-num">{i + 1}</span>
          <div className="activity-name">{a.name}</div>
        </div>
        <div className="activity-summary">{truncated}</div>
        <div className="activity-tags">
          <span className="tag">{a.estDuration}</span>
          <span className="tag">{formatPrice(a.estCost)}</span>
          {a.rating != null && (
            <span className="tag">
              {a.rating}
              {a.reviewCount > 0 && (
                <span style={{ opacity: 0.7, marginLeft: 4 }}>
                  ({formatCount(a.reviewCount)})
                </span>
              )}
            </span>
          )}
          <div className="activity-actions">
            {onAddToPlan && (
              <button
                type="button"
                className="activity-plan-btn"
                onClick={addToPlan}
                aria-label={`Add ${a.name} to plan`}
                title="Add to plan"
              >
                <CalendarPlus size={16} strokeWidth={2} aria-hidden />
              </button>
            )}
            <button
              type="button"
              className={`activity-save-star ${saved ? 'saved' : ''}`}
              onClick={toggleWishlist}
              aria-label={`${saved ? 'Remove' : 'Save'} ${a.name} ${saved ? 'from' : 'to'} wishlist`}
              title={`${saved ? 'Remove from' : 'Save to'} ${activeListName || 'wishlist'}`}
            >
              <Star size={16} strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
// Ignore callback prop identity changes — functions are stable in behavior.
// Only re-render when data or selection state changes.
}, (prev, next) =>
  prev.place === next.place &&
  prev.index === next.index &&
  prev.selected === next.selected &&
  prev.saved === next.saved &&
  prev.activeListName === next.activeListName &&
  !!prev.onAddToPlan === !!next.onAddToPlan
);
