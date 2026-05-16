import { useEffect, useRef, useState } from 'react';
import { Compass, Utensils, Leaf, Gem, Heart, Navigation } from 'lucide-react';
import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { directionsUrl } from '../services/googleMaps';
import { SavedPlaceCard } from './WishlistPanel';
import { formatCount } from '../utils/format';
import { shortenAddress } from '../utils/shortenAddress';

const shortListName = shortenAddress;

const PLACE_TABS = [
  { key: 'activities',  label: 'Activities',  Icon: Compass,  color: '#f97316' },
  { key: 'restaurants', label: 'Restaurants', Icon: Utensils, color: '#ef4444' },
  { key: 'nature',      label: 'Nature',      Icon: Leaf,     color: '#22c55e' },
  { key: 'gems',        label: 'Hidden gems', Icon: Gem,      color: '#6366f1' },
];

export default function TabbedPlacesWidget({ expandable = true }) {
  const {
    activeTab,
    switchTab,
    activeTabItems,
    activeTabLoading,
    selectedPlaceId,
    selectedPlace,
    selectPlace,
    wishlistLists,
    activeWishlist,
    activeWishlistId,
    selectWishlistById,
    renameWishlistById,
    deleteWishlistById,
    addPlaceToWishlist,
    removePlaceFromWishlist,
    isWishlisted
  } = useTrip();

  // Use selectedPlace directly — avoids the card vanishing when tab switches
  // before activeTabItems updates, or when data hasn't loaded yet.
  const selected = selectedPlace;
  const isWishlistTab = activeTab === 'wishlist';
  const savedCount = activeWishlist?.items?.length || 0;

  useEffect(() => {
    if (!selectedPlaceId) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedPlaceId]);

  return (
    <>
      <Card
        icon="📍"
        title="What to do here"
        expandable={expandable}
        extraHeader={
          <div className="wishlist-header-controls">
            {activeWishlist && (
              <span className="wishlist-count" title="Active wishlist">
                {shortListName(activeWishlist.name)} · {savedCount}
              </span>
            )}
            <button
              type="button"
              className={`wishlist-header-tab ${isWishlistTab ? 'active' : ''}`}
              onClick={() => switchTab('wishlist')}
              aria-pressed={isWishlistTab}
              aria-label="My wishlist"
            >
              <Heart
                size={16}
                strokeWidth={2}
                aria-hidden
                fill={isWishlistTab ? 'currentColor' : 'none'}
              />
              <span>My wishlist</span>
            </button>
          </div>
        }
        stickyNav={
          <div className="tab-nav" role="tablist">
            {PLACE_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                type="button"
                aria-selected={activeTab === t.key}
                className={`tab-button ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => switchTab(t.key)}
              >
                <t.Icon size={14} strokeWidth={2} aria-hidden color={t.color} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        }
      >
        <div className="tab-panel" role="tabpanel">
          {isWishlistTab ? (
            <WishlistTab
              lists={wishlistLists}
              activeList={activeWishlist}
              activeListId={activeWishlistId}
              onSelect={selectWishlistById}
              onRename={renameWishlistById}
              onDelete={deleteWishlistById}
              onRemove={removePlaceFromWishlist}
            />
          ) : activeTabLoading && activeTabItems.length === 0 ? (
            <Skeleton />
          ) : activeTabItems.length === 0 ? (
            <div className="muted" style={{ padding: 24, textAlign: 'center' }}>
              Nothing found for this category yet.
            </div>
          ) : (
            <div className="activity-list">
              {activeTabItems.map((a, i) => (
                <PlaceRow
                  key={a.placeId}
                  place={a}
                  index={i}
                  selected={selectedPlaceId === a.placeId}
                  onSelect={() => selectPlace(a)}
                  category={activeTab}
                  saved={isWishlisted(a.placeId)}
                  activeListName={shortListName(activeWishlist?.name)}
                  onSave={() => addPlaceToWishlist(a, activeTab)}
                  onRemove={() => removePlaceFromWishlist(a.placeId)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {selected && !isWishlistTab && (
        <PlaceDetail
          place={selected}
          onClose={() => selectPlace(null)}
          category={activeTab}
          saved={isWishlisted(selected.placeId)}
          activeListName={shortListName(activeWishlist?.name)}
          onSave={() => addPlaceToWishlist(selected, activeTab)}
          onRemove={() => removePlaceFromWishlist(selected.placeId)}
        />
      )}
    </>
  );
}

const CATEGORY_OPTIONS = [
  { value: 'activities', label: 'Activity' },
  { value: 'restaurants', label: 'Restaurant' },
  { value: 'nature', label: 'Nature' },
  { value: 'gems', label: 'Hidden gem' },
];

const EMPTY_ADD_FORM = { name: '', location: '', category: 'activities', duration: '', cost: '' };

function WishlistTab({
  lists,
  activeList,
  activeListId,
  onSelect,
  onRename,
  onDelete,
  onRemove
}) {
  const { addPlaceToWishlist, activeWishlistId } = useTrip();
  const [renameValue, setRenameValue] = useState(activeList?.name || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_ADD_FORM);

  const longPressTimer = useRef(null);
  const didLongPress = useRef(false);
  const addFormRef = useRef(null);

  useEffect(() => {
    if (showAddForm && addFormRef.current) {
      addFormRef.current.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }, [showAddForm]);

  useEffect(() => {
    setRenameValue(activeList?.name || '');
  }, [activeList?.id, activeList?.name]);

  function handleChipPointerDown() {
    didLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setPickerOpen(true);
    }, 500);
  }

  function handleChipPointerUp() {
    clearTimeout(longPressTimer.current);
  }

  function handleChipClick(listId) {
    if (!didLongPress.current) onSelect(listId);
  }

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
      <div className="wishlist-workspace-head">
        <div>
          <div className="wishlist-workspace-title">Wishlist workspace</div>
          <div className="wishlist-workspace-copy">
            Tap a list to switch. Hold to see all. Save cards from Activities, Restaurants, Nature, or Hidden gems — or add places manually.
          </div>
        </div>
      </div>

      {lists.length > 0 && (
        <div className="wishlist-list-picker" aria-label="Wishlist lists">
          {lists.map((list) => (
            <button
              key={list.id}
              type="button"
              className={`wishlist-list-chip ${activeListId === list.id ? 'active' : ''}`}
              onPointerDown={handleChipPointerDown}
              onPointerUp={handleChipPointerUp}
              onPointerLeave={handleChipPointerUp}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => handleChipClick(list.id)}
            >
              <span>{shortListName(list.name)}</span>
              <span>{list.items.length}</span>
            </button>
          ))}
        </div>
      )}

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
          Search a place to start a wishlist automatically.
        </div>
      ) : (
        <div className="wishlist-active-panel">
          <div className="wishlist-active-head">
            <div>
              <div className="wishlist-active-title">{shortListName(activeList.name)}</div>
              <div className="wishlist-active-meta">
                {activeList.items.length} saved place{activeList.items.length === 1 ? '' : 's'}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost wishlist-delete-btn"
              onClick={() => onDelete(activeList.id)}
            >
              Delete list
            </button>
          </div>
          <form
            className="wishlist-rename-row"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(activeList.id, renameValue);
            }}
          >
            <input
              className="input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              aria-label="Wishlist name"
            />
            <button type="submit" className="btn btn-ghost">Rename</button>
          </form>

          {activeList.items.length === 0 ? (
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

          <button
            type="button"
            className={`wishlist-add-trigger ${showAddForm ? 'open' : ''}`}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? '✕' : '+ Add'}
          </button>

          {showAddForm && (
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
      )}
    </div>
  );
}

function PlaceRow({
  place: a,
  index: i,
  selected,
  onSelect,
  category,
  saved,
  activeListName,
  onSave,
  onRemove
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
          <span className="tag">{a.estCost}</span>
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
        </div>
        <button
          type="button"
          className={`wishlist-action ${saved ? 'saved' : ''}`}
          onClick={toggleWishlist}
          aria-label={`${saved ? 'Remove' : 'Save'} ${a.name} ${saved ? 'from' : 'to'} wishlist`}
          title={`${saved ? 'Remove from' : 'Save to'} ${activeListName || 'wishlist'}`}
        >
          <span aria-hidden>{saved ? '✓' : '+'}</span>
          <span>{saved ? 'Saved' : `Save to ${activeListName || 'wishlist'}`}</span>
        </button>
      </div>
    </div>
  );
}

function PlaceDetail({
  place,
  onClose,
  category,
  saved,
  activeListName,
  onSave,
  onRemove
}) {
  const description = place.wiki?.extract || place.summary;
  const toggleWishlist = () => {
    if (saved) onRemove();
    else onSave();
  };

  return (
    <div className="detail-panel" role="dialog" aria-label="Place details">
      <div className="detail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="detail-title">{place.name}</h4>
          <p className="detail-address">{place.address}</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          aria-label="Close details"
          style={{ width: 32, height: 32 }}
        >
          ✕
        </button>
      </div>

      {place.photoUrl && (
        <div className="detail-photo">
          <img
            src={place.photoUrl}
            alt={place.name}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
        {description}
      </p>

      {place.wiki?.url && (
        <a
          href={place.wiki.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: 'var(--accent)',
            textDecoration: 'none',
            marginTop: 4,
            display: 'inline-block'
          }}
        >
          Read more on Wikipedia
        </a>
      )}

      <div className="detail-stats">
        <div className="detail-stat">
          <div className="k">Duration</div>
          <div className="v">{place.estDuration}</div>
        </div>
        <div className="detail-stat">
          <div className="k">Cost</div>
          <div className="v">{place.estCost}</div>
        </div>
        {place.rating != null && (
          <div className="detail-stat">
            <div className="k">Rating</div>
            <div className="v">
              {place.rating}
              {place.reviewCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({formatCount(place.reviewCount)} reviews)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <button
          type="button"
          className={`btn detail-save-btn ${saved ? 'btn-ghost' : ''}`}
          onClick={toggleWishlist}
        >
          <Heart size={14} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden />
          {saved ? 'Saved' : 'Save'}
        </button>
        <a
          className="btn btn-outline detail-dir-btn"
          href={directionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none' }}
        >
          <Navigation size={14} strokeWidth={2} aria-hidden />
          Directions
        </a>
        <button type="button" className="btn btn-ghost detail-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton skeleton-block" style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}
