import { useMemo } from 'react';
import { useTrip } from '../hooks/useTrip';
import { directionsUrl } from '../services/googleMaps';
import { withinRadius } from '../utils/geo';
import { formatCount } from '../utils/format';

const PROXIMITY_KM = 2;

/**
 * Floating info card for the currently-selected hotel.
 * Shows hotel meta + counts of attractions/restaurants within 2 km.
 * Renders nothing when no hotel is selected.
 */
export default function HotelInfoCard() {
  const {
    hotels,
    selectedHotelId,
    selectHotel,
    tabData
  } = useTrip();

  const hotel = useMemo(
    () => hotels.find((h) => h.placeId === selectedHotelId),
    [hotels, selectedHotelId]
  );

  // Proximity counts pull from whatever tab data is currently loaded.
  // Activities and restaurants are the most travel-relevant signals.
  // Distinguish "not loaded yet" (show —) from "loaded but zero" (show 0).
  // tabData[key] is null until that tab first loads; an empty array means
  // we asked Google and got nothing back.
  const counts = useMemo(() => {
    if (!hotel) return null;
    return {
      activities:
        tabData.activities == null
          ? null
          : withinRadius(tabData.activities, hotel, PROXIMITY_KM).length,
      restaurants:
        tabData.restaurants == null
          ? null
          : withinRadius(tabData.restaurants, hotel, PROXIMITY_KM).length
    };
  }, [hotel, tabData]);

  if (!hotel) return null;

  return (
    <div className="hotel-info-card" role="dialog" aria-label="Hotel details">
      <div className="detail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="detail-title">🛏 {hotel.name}</h4>
          <p className="detail-address">{hotel.address}</p>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => selectHotel(null)}
          aria-label="Close hotel details"
          style={{ width: 32, height: 32 }}
        >
          ✕
        </button>
      </div>

      {hotel.photoUrl && (
        <div className="detail-photo">
          <img
            src={hotel.photoUrl}
            alt={hotel.name}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      <div className="proximity-stats">
        <div className="proximity-stat">
          <div className="proximity-stat-value">
            {counts?.activities == null ? '—' : counts.activities}
          </div>
          <div className="proximity-stat-label">
            {counts?.activities == null
              ? 'load Activities tab to see'
              : 'attractions within 2 km'}
          </div>
        </div>
        <div className="proximity-stat">
          <div className="proximity-stat-value">
            {counts?.restaurants == null ? '—' : counts.restaurants}
          </div>
          <div className="proximity-stat-label">
            {counts?.restaurants == null
              ? 'load Restaurants tab to see'
              : 'restaurants within 2 km'}
          </div>
        </div>
      </div>

      <div className="detail-stats">
        {hotel.rating != null && (
          <div className="detail-stat">
            <div className="k">Rating</div>
            <div className="v">
              ★ {hotel.rating}
              {hotel.reviewCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({formatCount(hotel.reviewCount)})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <a
          className="btn"
          href={directionsUrl(hotel)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Get directions →
        </a>
        <button type="button" className="btn btn-ghost" onClick={() => selectHotel(null)}>
          Close
        </button>
      </div>
    </div>
  );
}
