import { useEffect, useState } from 'react';
import { useWishlistStore, selectActiveListId } from '../../stores/wishlistStore';
import PlanMode from '../PlanMode';
import { SavedPlaceCard } from '../WishlistPanel';
import { SavedPlacePicker } from './SavedPlacePicker';
import { CATEGORY_OPTIONS, EMPTY_ADD_FORM } from './constants';

export function WishlistBody({
  lists,
  activeList,
  activeListId,
  onRemove,
  mode,
  ghostCity,
  onPromoteGhost,
  pickerOpen,
  setPickerOpen,
  showAddForm,
  setShowAddForm,
  addForm,
  setAddForm,
  addFormRef,
  onSelect,
}) {
  const [livePickerOpen, setLivePickerOpen] = useState(false);
  const wAddPlace = useWishlistStore((s) => s.addPlace);
  const activeWishlistId = useWishlistStore(selectActiveListId);
  const addPlaceToWishlist = (place, category, listId = activeWishlistId) =>
    wAddPlace({ listId, place, category });

  // Both modes: skip the "+ Add city" empty state. When the current
  // destination has no list yet in this mode, auto-create it and drop the
  // user straight in (Plan → Day 1, Saved → active list). The promoted list
  // renders among the real chips, so the active highlight sits up front
  // instead of on the trailing ghost chip.
  useEffect(() => {
    if (!activeList && ghostCity) {
      onPromoteGhost();
    }
  }, [mode, activeList, ghostCity, onPromoteGhost]);

  function handleAddSubmit(e) {
    e.preventDefault();
    if (!addForm.name.trim() || !activeWishlistId) return;
    const place = {
      placeId: 'manual-' + Date.now() + '-' + Math.random().toString(36).slice(2),
      name: addForm.name.trim(),
      address: addForm.location.trim() || undefined,
      estDuration: addForm.duration.trim() || undefined,
      estCost: addForm.cost.trim() || undefined,
    };
    addPlaceToWishlist(place, addForm.category);
    setAddForm(EMPTY_ADD_FORM);
    setShowAddForm(false);
  }

  return (
    <div className="wishlist-workspace">
      {pickerOpen && (
        <div className="wishlist-picker-overlay">
          <div className="wishlist-picker-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="wishlist-picker-panel">
            <div className="wishlist-picker-title">Your wishlists</div>
            {lists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`wishlist-picker-item ${activeListId === list.id ? 'active' : ''}`}
                onClick={() => { onSelect(list.id); setPickerOpen(false); }}
              >
                <span className="wishlist-picker-item-name">{list.name}</span>
                <span className="wishlist-picker-item-count">{list.items.length} saved</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!activeList ? (
        <div className="wishlist-empty-panel">
          {ghostCity ? (
            <>
              <div>No {mode === 'plan' ? 'plan' : 'saved'} list yet for <strong>{ghostCity}</strong>.</div>
              <button
                type="button"
                className="wishlist-add-city-btn"
                onClick={onPromoteGhost}
              >
                + Add {ghostCity} to {mode === 'plan' ? 'Plan' : 'Saved'}
              </button>
            </>
          ) : (
            <>Search a city to start a {mode === 'plan' ? 'plan' : 'wishlist'}.</>
          )}
        </div>
      ) : (
        <div className="wishlist-active-panel">
          {ghostCity && (
            <button
              type="button"
              className="wishlist-add-city-btn inline"
              onClick={onPromoteGhost}
            >
              + Add {ghostCity} to {mode === 'plan' ? 'Plan' : 'Saved'}
            </button>
          )}
          {mode === 'plan' ? (
            <PlanMode list={activeList} />
          ) : activeList.items.length === 0 ? (
            <div className="wishlist-empty-panel">
              This list is empty. Go back to Activities, Restaurants, Nature, or Hidden gems and save cards.
            </div>
          ) : (
            <div className="wishlist-card-list">
              {activeList.items.map((item) => (
                <SavedPlaceCard
                  key={item.placeId}
                  item={item}
                  onRemove={() => onRemove(item.placeId, activeList.id)}
                />
              ))}
            </div>
          )}

          {mode === 'saved' && (
            <button
              type="button"
              className="wishlist-add-trigger"
              onClick={() => {
                if (!activeWishlistId) onPromoteGhost();
                setShowAddForm(false);
                setLivePickerOpen(true);
              }}
            >
              + Add
            </button>
          )}

          {mode === 'saved' && livePickerOpen && activeWishlistId && (
            <SavedPlacePicker
              listId={activeWishlistId}
              onClose={() => { setLivePickerOpen(false); setShowAddForm(false); }}
              footerSlot={
                <div className="wishlist-picker-footer">
                  {!showAddForm ? (
                    <button
                      type="button"
                      className="wishlist-manual-link"
                      onClick={() => setShowAddForm(true)}
                    >
                      Can't find it? Add manually
                    </button>
                  ) : (
                    <form ref={addFormRef} className="wishlist-add-form" onSubmit={handleAddSubmit}>
                      <input
                        className="input"
                        placeholder="Place name *"
                        required
                        value={addForm.name}
                        onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                      />
                      <input
                        className="input"
                        placeholder="Location / city"
                        value={addForm.location}
                        onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))}
                      />
                      <select
                        className="input"
                        value={addForm.category}
                        onChange={(e) => setAddForm((f) => ({ ...f, category: e.target.value }))}
                      >
                        {CATEGORY_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <div className="wishlist-add-form-row">
                        <input
                          className="input"
                          placeholder="Duration (e.g. 2 hrs)"
                          value={addForm.duration}
                          onChange={(e) => setAddForm((f) => ({ ...f, duration: e.target.value }))}
                        />
                        <input
                          className="input"
                          placeholder="Cost (e.g. $$)"
                          value={addForm.cost}
                          onChange={(e) => setAddForm((f) => ({ ...f, cost: e.target.value }))}
                        />
                      </div>
                      <button type="submit" className="btn" style={{ width: '100%' }}>Add to list</button>
                    </form>
                  )}
                </div>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
