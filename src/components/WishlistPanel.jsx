import { directionsUrl } from '../services/googleMaps';
import { formatCount, formatPrice } from '../utils/format';
import { shortenAddress } from '../utils/shortenAddress';

export function SavedPlaceCard({ item, onRemove }) {
  return (
    <div className="wishlist-place-card">
      {item.photoUrl && (
        <div className="wishlist-place-photo">
          <img
            src={item.photoUrl}
            alt={item.name}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
      )}
      <div className="wishlist-place-body">
        <div className="wishlist-place-top">
          <div>
            <div className="wishlist-place-name">{item.name}</div>
            {item.address && <div className="wishlist-place-address">{shortenAddress(item.address)}</div>}
          </div>
          <button
            type="button"
            className="wishlist-remove"
            onClick={onRemove}
            aria-label={`Remove ${item.name} from wishlist`}
            title="Remove from wishlist"
          >
            ✕
          </button>
        </div>

        {item.summary && <div className="wishlist-place-summary">{item.summary}</div>}

        <div className="activity-tags">
          {item.category && <span className="tag">{categoryLabel(item.category)}</span>}
          {item.estDuration && <span className="tag">{item.estDuration}</span>}
          {item.estCost && <span className="tag">{formatPrice(item.estCost)}</span>}
          {item.rating != null && (
            <span className="tag">
              {item.rating}
              {item.reviewCount > 0 && (
                <span style={{ opacity: 0.7, marginLeft: 4 }}>
                  ({formatCount(item.reviewCount)})
                </span>
              )}
            </span>
          )}
        </div>

        {Number.isFinite(item.lat) && Number.isFinite(item.lng) && (
          <a
            className="wishlist-directions"
            href={directionsUrl(item)}
            target="_blank"
            rel="noopener noreferrer"
          >
            Get directions
          </a>
        )}
      </div>
    </div>
  );
}

function categoryLabel(key) {
  const labels = {
    activities: 'Activity',
    restaurants: 'Restaurant',
    nature: 'Nature',
    gems: 'Hidden gem'
  };
  return labels[key] || 'Place';
}
