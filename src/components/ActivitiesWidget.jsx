import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { directionsUrl } from '../services/googleMaps';

export default function ActivitiesWidget() {
  const { activities, loading, selectedActivityId, selectActivity } = useTrip();
  const selected = activities.find((a) => a.placeId === selectedActivityId);

  return (
    <>
      <Card icon="🎯" title="Top activities">
        {loading && activities.length === 0 ? (
          <Skeleton />
        ) : activities.length === 0 ? (
          <div className="muted">No activities found yet.</div>
        ) : (
          <div className="activity-list">
            {activities.map((a, i) => (
              <ActivityRow
                key={a.placeId}
                activity={a}
                index={i}
                selected={selectedActivityId === a.placeId}
                onSelect={() => selectActivity(a)}
              />
            ))}
          </div>
        )}
      </Card>

      {selected && <ActivityDetail activity={selected} onClose={() => selectActivity(null)} />}
    </>
  );
}

function ActivityRow({ activity: a, index: i, selected, onSelect }) {
  // Prefer Wikipedia extract when available; fall back to type-derived summary.
  const description = a.wiki?.extract || a.summary;
  const truncated =
    description?.length > 140 ? description.slice(0, 140).trim() + '…' : description;

  return (
    <button
      className={`activity-item ${selected ? 'selected' : ''}`}
      onClick={onSelect}
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
          <span className="tag">⏱ {a.estDuration}</span>
          <span className="tag">💰 {a.estCost}</span>
          {a.rating && (
            <span className="tag">
              ★ {a.rating}
              {a.reviewCount > 0 && (
                <span style={{ opacity: 0.7, marginLeft: 4 }}>
                  ({formatCount(a.reviewCount)})
                </span>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function ActivityDetail({ activity, onClose }) {
  const description = activity.wiki?.extract || activity.summary;

  return (
    <div className="detail-panel" role="dialog" aria-label="Activity details">
      <div className="detail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="detail-title">{activity.name}</h4>
          <p className="detail-address">{activity.address}</p>
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

      {activity.photoUrl && (
        <div className="detail-photo">
          <img
            src={activity.photoUrl}
            alt={activity.name}
            onError={(e) => (e.currentTarget.style.display = 'none')}
          />
        </div>
      )}

      <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.5 }}>
        {description}
      </p>

      {activity.wiki?.url && (
        <a
          href={activity.wiki.url}
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
          Read more on Wikipedia →
        </a>
      )}

      <div className="detail-stats">
        <div className="detail-stat">
          <div className="k">Duration</div>
          <div className="v">{activity.estDuration}</div>
        </div>
        <div className="detail-stat">
          <div className="k">Cost</div>
          <div className="v">{activity.estCost}</div>
        </div>
        {activity.rating && (
          <div className="detail-stat">
            <div className="k">Rating</div>
            <div className="v">
              ★ {activity.rating}
              {activity.reviewCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({formatCount(activity.reviewCount)} reviews)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <a
          className="btn"
          href={directionsUrl(activity)}
          target="_blank"
          rel="noopener noreferrer"
          style={{ textDecoration: 'none', display: 'inline-block' }}
        >
          Get directions →
        </a>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function formatCount(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
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
