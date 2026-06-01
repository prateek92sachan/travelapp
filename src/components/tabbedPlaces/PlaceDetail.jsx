import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigation, Star, Sparkles, RotateCw, CalendarPlus } from 'lucide-react';
import { useSearchStore } from '../../stores/searchStore';
import { directionsUrl } from '../../services/googleMaps';
import { fetchWikiSummary, isWikiMatch } from '../../services/wikipedia';
import { usePlaceSummary } from '../../hooks/usePlaceSummary';
import { formatCount, formatPrice } from '../../utils/format';
import { ExpandableDescription } from './ExpandableDescription';

export const PlaceDetail = memo(function PlaceDetail({
  place,
  onClose,
  saved,
  activeListName,
  onSave,
  onRemove,
  onAddToPlan,
}) {
  const destination = useSearchStore((s) => s.destination);
  const isManual = place.placeId?.startsWith('manual-');

  const [wikiData, setWikiData] = useState(undefined);
  const [descExpanded, setDescExpanded] = useState(false);

  // Descriptions come from Wikipedia only (free) — no Google Place Details or
  // Gemini calls. The fetch is debounced 300ms so skimming through places
  // (rapid pin/row clicks) doesn't fire a lookup for each one passed over.
  useEffect(() => {
    if (isManual) return undefined;
    setDescExpanded(false);
    if (place.wiki) {
      setWikiData(place.wiki);
      return undefined;
    }
    setWikiData(undefined);
    let cancelled = false;
    const t = setTimeout(() => {
      fetchWikiSummary(place.name, destination)
        .then((w) => { if (!cancelled) setWikiData(isWikiMatch(place, w) ? w : null); })
        .catch(() => { if (!cancelled) setWikiData(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [place.placeId, place.wiki, place.name, destination, isManual]);

  const wikiExtract = wikiData?.extract ?? place.wiki?.extract ?? null;
  const wikiUrl = wikiData?.url ?? place.wiki?.url ?? null;
  const richDescription = wikiExtract;

  const hasWiki = typeof wikiExtract === 'string' && wikiExtract.trim().length >= 30;
  const { summary: aiSummary, state: aiState, retry: aiRetry } =
    usePlaceSummary(isManual ? null : place.placeId, place.name, hasWiki);

  const toggleWishlist = () => { if (saved) onRemove(); else onSave(); };

  return createPortal(
    <>
      <div className="detail-backdrop" onClick={onClose} aria-hidden />
    <div className="detail-panel" role="dialog" aria-label="Place details">
      <div className="detail-header">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h4 className="detail-title">{place.name}</h4>
          <p className="detail-address">{place.address}</p>
        </div>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close details" style={{ width: 32, height: 32 }}>
          ✕
        </button>
      </div>

      {place.photoUrl && (
        <div className="detail-photo">
          <img src={place.photoUrl} alt={place.name} loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      )}

      {/* AI summary (Claude Haiku) — appears above the Wikipedia block */}
      {aiState !== 'idle' && (
        <div className="detail-ai-summary">
          <div className="detail-ai-summary-head">
            <Sparkles size={12} strokeWidth={2} aria-hidden />
            <span>AI summary</span>
            {aiState === 'ready' && (
              <span className="detail-ai-summary-source">· Web</span>
            )}
          </div>
          {aiState === 'ready' && <p className="detail-ai-summary-text">{aiSummary}</p>}
          {aiState === 'loading' && (
            <div className="detail-ai-summary-skel">
              <span className="skeleton skeleton-block" />
              <span className="skeleton skeleton-block" />
            </div>
          )}
          {aiState === 'error' && (
            <button type="button" className="detail-ai-summary-retry" onClick={aiRetry}>
              <RotateCw size={12} strokeWidth={2} aria-hidden />
              Generate summary
            </button>
          )}
        </div>
      )}

      {/* Description (Wikipedia) */}
      {richDescription && (
        <ExpandableDescription
          text={richDescription}
          expanded={descExpanded}
          onToggle={() => setDescExpanded((v) => !v)}
          wikiUrl={wikiUrl}
        />
      )}

      {/* Stats */}
      <div className="detail-stats">
        <div className="detail-stat">
          <div className="k">Duration</div>
          <div className="v">{place.estDuration}</div>
        </div>
        <div className="detail-stat">
          <div className="k">Cost</div>
          <div className="v">{formatPrice(place.estCost)}</div>
        </div>
        {place.rating != null && (
          <div className="detail-stat">
            <div className="k">Rating</div>
            <div className="v">
              {place.rating}
              {place.reviewCount > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                  ({formatCount(place.reviewCount)})
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="detail-actions">
        <button type="button" className={`btn detail-save-btn ${saved ? 'btn-ghost' : ''}`} onClick={toggleWishlist}>
          <Star size={14} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden />
          {saved ? 'Saved' : 'Save'}
        </button>
        {onAddToPlan && (
          <button type="button" className="btn btn-outline detail-plan-btn" onClick={onAddToPlan}>
            <CalendarPlus size={14} strokeWidth={2} aria-hidden />
            Add to plan
          </button>
        )}
        <a className="btn btn-outline detail-dir-btn" href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
          <Navigation size={14} strokeWidth={2} aria-hidden />
          Directions
        </a>
        <button type="button" className="btn btn-ghost detail-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
    </>,
    document.body
  );
}, (prev, next) =>
  prev.place === next.place &&
  prev.saved === next.saved &&
  prev.activeListName === next.activeListName &&
  !!prev.onAddToPlan === !!next.onAddToPlan
);
