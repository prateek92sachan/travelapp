import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useTrip } from '../hooks/useTrip';
import { useAuth } from '../hooks/useAuth';
import { SavedPlaceCard } from './WishlistPanel';

export default function WishlistOverlay({ onClose }) {
  const {
    wishlistLists,
    activeWishlist,
    activeWishlistId,
    selectWishlistById,
    removePlaceFromWishlist,
  } = useTrip();
  const { user } = useAuth();

  const totalItems = useMemo(
    () => wishlistLists.reduce((sum, l) => sum + (l.items?.length ?? 0), 0),
    [wishlistLists]
  );

  return createPortal(
    <div className="wishlist-overlay" role="dialog" aria-label="My Wishlist" aria-modal="true">
      <div className="wishlist-overlay-backdrop" onClick={onClose} />
      <div className="wishlist-overlay-panel">
        <div className="wishlist-overlay-head">
          <span className="wishlist-overlay-title">My Wishlist</span>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close wishlist">
            ✕
          </button>
        </div>

        {!user && totalItems > 0 && (
          <div className="wishlist-sync-banner">Sign in to sync across devices</div>
        )}

        {wishlistLists.length > 1 && (
          <div className="wishlist-overlay-lists">
            {wishlistLists.map((list) => (
              <button
                key={list.id}
                type="button"
                className={`wishlist-list-tab ${list.id === activeWishlistId ? 'active' : ''}`}
                onClick={() => selectWishlistById(list.id)}
              >
                {list.name}
                <span className="wishlist-list-count">{list.items.length}</span>
              </button>
            ))}
          </div>
        )}

        <div className="wishlist-overlay-items">
          {wishlistLists.length === 0 ? (
            <div className="wishlist-overlay-empty">
              Search a destination and save places to start your wishlist.
            </div>
          ) : !activeWishlist || activeWishlist.items.length === 0 ? (
            <div className="wishlist-overlay-empty">No places saved in this list yet.</div>
          ) : (
            activeWishlist.items.map((item) => (
              <SavedPlaceCard
                key={item.placeId}
                item={item}
                onRemove={() => removePlaceFromWishlist(item.placeId, activeWishlistId)}
              />
            ))
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
