import { useEffect, useState } from 'react';
import { Compass, Utensils, Leaf, Gem, Heart } from 'lucide-react';
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

  const selected = activeTabItems.find((a) => a.placeId === selectedPlaceId);
  const isWishlistTab = activeTab === 'wishlist';
  const savedCount = activeWishlist?.items?.length || 0;

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

function WishlistTab({
  lists,
  activeList,
  activeListId,
  onSelect,
  onRename,
  onDelete,
  onRemove
}) {
  const [renameValue, setRenameValue] = useState(activeList?.name || '');

  useEffect(() => {
    setRenameValue(activeList?.name || '');
  }, [activeList?.id, activeList?.name]);

  return (
    <div className="wishlist-workspace">
      <div className="wishlist-workspace-head">
        <div>
          <div className="wishlist-workspace-title">Wishlist workspace</div>
          <div className="wishlist-workspace-copy">
            The current search owns the active wishlist. Rename it here, then save cards from Activities, Restaurants, Nature, or Hidden gems.
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
              onClick={() => onSelect(list.id)}
            >
              <span>{shortListName(list.name)}</span>
              <span>{list.items.length}</span>
            </button>
          ))}
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
          className={`btn ${saved ? 'btn-ghost' : ''}`}
          onClick={toggleWishlist}
        >
          {saved
            ? 'Remove from wishlist'
            : `Save to ${activeListName || 'wishlist'}`}
        </button>
        <a
          className="btn"
          href={directionsUrl(place)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Get directions
        </a>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
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
