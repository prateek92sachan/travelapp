import { Pencil, Trash2 } from 'lucide-react';
import { countPlannedPlaces } from '../../utils/plan';
import { cityCountryLabel } from './helpers';

export function WishlistListPicker({
  lists,
  activeListId,
  mode,
  ghostCity,
  ghostCountry,
  onGhostClick,
  editingName,
  editValue,
  editInputRef,
  setEditValue,
  setEditingName,
  onChipPointerDown,
  onChipPointerUp,
  onChipClick,
  onCommitRename,
  onCancelRename,
  onConfirmDelete,
}) {
  if (lists.length === 0 && !ghostCity) return null;
  return (
    <div className="wishlist-list-picker" role="tablist" aria-label="Wishlist lists">
      {lists.map((list) => {
        const isActive = activeListId === list.id;
        const { city, country } = cityCountryLabel(list.name, list.destination, list.country);
        return (
          <div
            key={list.id}
            role="tab"
            tabIndex={0}
            aria-selected={isActive}
            className={`wishlist-list-chip ${isActive ? 'active' : ''}`}
            onPointerDown={onChipPointerDown}
            onPointerUp={onChipPointerUp}
            onPointerLeave={onChipPointerUp}
            onContextMenu={(e) => e.preventDefault()}
            onClick={() => onChipClick(list.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChipClick(list.id);
              }
            }}
          >
            {isActive && editingName ? (
              <input
                ref={editInputRef}
                className="wishlist-list-chip-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={onCommitRename}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); onCommitRename(); }
                  else if (e.key === 'Escape') { e.preventDefault(); onCancelRename(); }
                }}
                aria-label="List name"
              />
            ) : (
              <>
                <span className="wishlist-list-chip-label">
                  <span className="wishlist-list-chip-city">{city}</span>
                  {country && <span className="wishlist-list-chip-country">{country}</span>}
                </span>
                <span>
                  {mode === 'plan'
                    ? countPlannedPlaces(list.plan)
                    : list.items.length}
                </span>
                {isActive && !editingName && (
                  <span className="wishlist-list-chip-actions">
                    <button
                      type="button"
                      className="wishlist-chip-action"
                      onClick={(e) => { e.stopPropagation(); setEditingName(true); }}
                      aria-label="Rename list"
                      title="Rename list"
                    >
                      <Pencil size={12} strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="wishlist-chip-action"
                      onClick={(e) => { e.stopPropagation(); onConfirmDelete(); }}
                      aria-label="Delete list"
                      title="Delete list"
                    >
                      <Trash2 size={12} strokeWidth={1.75} aria-hidden />
                    </button>
                  </span>
                )}
              </>
            )}
          </div>
        );
      })}
      {ghostCity && (
        <div
          role="tab"
          tabIndex={0}
          aria-selected={!activeListId}
          className={`wishlist-list-chip ghost ${!activeListId ? 'active' : ''}`}
          onClick={onGhostClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onGhostClick();
            }
          }}
          title={`Add ${ghostCity} to ${mode === 'plan' ? 'Plan' : 'Saved'}`}
        >
          {(() => {
            const { city, country } = cityCountryLabel(ghostCity, ghostCity, ghostCountry);
            return (
              <span className="wishlist-list-chip-label">
                <span className="wishlist-list-chip-city">{city}</span>
                {country && <span className="wishlist-list-chip-country">{country}</span>}
              </span>
            );
          })()}
          <span className="wishlist-list-chip-ghost-hint">+</span>
        </div>
      )}
    </div>
  );
}
