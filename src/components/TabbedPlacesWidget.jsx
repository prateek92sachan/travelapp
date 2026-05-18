import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Compass, Utensils, Leaf, Gem, BedDouble, Heart, Navigation, Phone, Globe } from 'lucide-react';
import Card from './Card';
import { useTrip } from '../hooks/useTrip';
import { directionsUrl, fetchPlaceDetails } from '../services/googleMaps';
import { fetchWikiSummary } from '../services/wikipedia';
import { fetchPlaceDescription } from '../services/gemini';
import { SavedPlaceCard } from './WishlistPanel';
import { formatCount } from '../utils/format';
import { shortenAddress } from '../utils/shortenAddress';

const shortListName = shortenAddress;

const TabNav = memo(function TabNav({ activeTab, tabs, onSwitch }) {
  const navRef = useRef(null);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const btn = nav.querySelector(`[data-tab="${activeTab}"]`);
    if (btn) btn.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }, [activeTab]);

  return (
    <div className="tab-nav" role="tablist" ref={navRef}>
      {tabs.map((t) => {
        const isActive = activeTab === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            type="button"
            data-tab={t.key}
            aria-selected={isActive}
            className={`tab-button ${isActive ? 'active' : ''}`}
            title={t.label}
            onClick={() => onSwitch(t.key)}
          >
            <t.Icon size={14} strokeWidth={2} aria-hidden color={t.color} />
            {isActive && <span>{t.label}</span>}
          </button>
        );
      })}
    </div>
  );
}, (prev, next) => prev.activeTab === next.activeTab && prev.tabs === next.tabs);

const PLACE_TABS = [
  { key: 'activities',  label: 'Activities',  Icon: Compass,   color: '#f97316' },
  { key: 'restaurants', label: 'Restaurants', Icon: Utensils,  color: '#ef4444' },
  { key: 'nature',      label: 'Nature',      Icon: Leaf,      color: '#22c55e' },
  { key: 'gems',        label: 'Hidden gems', Icon: Gem,       color: '#6366f1' },
  { key: 'hotels',      label: 'Hotels',      Icon: BedDouble, color: '#0ea5e9' },
];

function TabbedPlacesWidget({ expandable = true }) {
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
    addPlaceToSmartWishlist,
    removePlaceFromWishlist,
    isWishlisted,
    effectiveListId,
    viewportCity,
  } = useTrip();

  const saveListName = viewportCity
    ? shortListName(viewportCity)
    : shortListName(activeWishlist?.name);

  // Use selectedPlace directly — avoids the card vanishing when tab switches
  // before activeTabItems updates, or when data hasn't loaded yet.
  const selected = selectedPlace;
  const isWishlistTab = activeTab === 'wishlist';
  const savedCount = activeWishlist?.items?.length || 0;

  // Refs so the re-anchor effect can read current values without them being deps.
  const selectedPlaceIdRef = useRef(selectedPlaceId);
  const selectedPlaceRef = useRef(selectedPlace);
  useEffect(() => {
    selectedPlaceIdRef.current = selectedPlaceId;
    selectedPlaceRef.current = selectedPlace;
  }, [selectedPlaceId, selectedPlace]);

  // Scroll selected item to top when selection changes.
  useEffect(() => {
    if (!selectedPlaceId) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-place-id="${selectedPlaceId}"]`);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(raf);
  }, [selectedPlaceId]);

  // Re-anchor scroll when list data changes while detail card is open.
  // Prevents async writes (Phase 2, wiki enrichment, fetchTabIfNeeded completing)
  // from resetting scroll to 0 and showing a different place than selected.
  useEffect(() => {
    const placeId = selectedPlaceIdRef.current;
    if (!placeId || !selectedPlaceRef.current) return;
    if (activeTabItems.length === 0) return;
    if (!activeTabItems.some((a) => a.placeId === placeId)) return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-place-id="${placeId}"]`);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeTabItems]);

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
          <TabNav activeTab={activeTab} tabs={PLACE_TABS} onSwitch={switchTab} />
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
                  saved={isWishlisted(a.placeId, effectiveListId)}
                  activeListName={saveListName}
                  onSave={() => addPlaceToSmartWishlist(a, activeTab)}
                  onRemove={() => removePlaceFromWishlist(a.placeId, effectiveListId)}
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
          saved={isWishlisted(selected.placeId, effectiveListId)}
          activeListName={saveListName}
          onSave={() => addPlaceToSmartWishlist(selected, activeTab)}
          onRemove={() => removePlaceFromWishlist(selected.placeId, effectiveListId)}
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

  useEffect(() => () => clearTimeout(longPressTimer.current), []);

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

const PlaceRow = memo(function PlaceRow({
  place: a,
  index: i,
  selected,
  onSelect,
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
// Ignore callback prop identity changes — functions are stable in behavior.
// Only re-render when data or selection state changes.
}, (prev, next) =>
  prev.place === next.place &&
  prev.index === next.index &&
  prev.selected === next.selected &&
  prev.saved === next.saved &&
  prev.activeListName === next.activeListName
);

function hostnameOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

const PlaceDetail = memo(function PlaceDetail({
  place,
  onClose,
  saved,
  activeListName,
  onSave,
  onRemove
}) {
  const { destination } = useTrip();
  const isManual = place.placeId?.startsWith('manual-');

  const [details, setDetails] = useState(null);
  const [wikiData, setWikiData] = useState(undefined);
  const [geminiDesc, setGeminiDesc] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(!isManual);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    if (isManual) return;
    let cancelled = false;
    setDetails(null);
    setWikiData(undefined);
    setGeminiDesc(null);
    setDescExpanded(false);
    setDetailsLoading(true);

    const p1 = fetchPlaceDetails(place.placeId)
      .then((d) => { if (!cancelled) setDetails(d); })
      .catch(() => { if (!cancelled) setDetails(null); });

    const p2 = place.wiki
      ? Promise.resolve(setWikiData(place.wiki))
      : fetchWikiSummary(place.name, destination)
          .then((w) => { if (!cancelled) setWikiData(w); })
          .catch(() => { if (!cancelled) setWikiData(null); });

    const p3 = fetchPlaceDescription(place)
      .then((d) => { if (!cancelled) setGeminiDesc(d); })
      .catch(() => { if (!cancelled) setGeminiDesc(null); });

    Promise.all([p1, p2, p3]).then(() => { if (!cancelled) setDetailsLoading(false); });

    return () => { cancelled = true; };
  }, [place.placeId, destination]);

  const wikiExtract = wikiData?.extract ?? place.wiki?.extract ?? null;
  const wikiUrl = wikiData?.url ?? place.wiki?.url ?? null;
  // Gemini primary → wiki full extract fallback → editorial summary last resort
  const richDescription = geminiDesc || wikiExtract || details?.editorialSummary || null;

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
          <img src={place.photoUrl} alt={place.name} onError={(e) => (e.currentTarget.style.display = 'none')} />
        </div>
      )}

      {/* Open now badge + hours */}
      {detailsLoading ? (
        <div className="skeleton" style={{ height: 22, width: 72, margin: '10px 0 0', borderRadius: 999 }} />
      ) : details?.openNow != null && (
        <div className="detail-open-row">
          <span className={`detail-open-badge ${details.openNow ? 'open' : 'closed'}`}>
            {details.openNow ? 'Open now' : 'Closed'}
          </span>
          {details.weekdayHours.length > 0 && (
            <button type="button" className="detail-hours-toggle" onClick={() => setHoursOpen((v) => !v)}>
              {hoursOpen ? 'Hide hours' : 'See hours'}
            </button>
          )}
        </div>
      )}
      {hoursOpen && details?.weekdayHours.length > 0 && (
        <div className="detail-hours">
          {details.weekdayHours.map((h, i) => (
            <div key={i} className="detail-hour-row">{h}</div>
          ))}
        </div>
      )}

      {/* Description */}
      {richDescription && (
        <ExpandableDescription
          text={richDescription}
          expanded={descExpanded}
          onToggle={() => setDescExpanded((v) => !v)}
          wikiUrl={!geminiDesc ? wikiUrl : null}
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
          <div className="v">{details?.priceLevel || place.estCost}</div>
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

      {/* Contact: phone + website */}
      {!detailsLoading && (details?.phone || details?.website) && (
        <div className="detail-contact">
          {details.phone && (
            <a href={`tel:${details.phone}`} className="detail-contact-item">
              <Phone size={12} strokeWidth={2} aria-hidden />
              {details.phone}
            </a>
          )}
          {details.website && (
            <a href={details.website} target="_blank" rel="noopener noreferrer" className="detail-contact-item">
              <Globe size={12} strokeWidth={2} aria-hidden />
              {hostnameOf(details.website)}
            </a>
          )}
        </div>
      )}

      {/* Reviews */}
      {details?.reviews?.length > 0 && (
        <div className="detail-reviews">
          <div className="detail-section-label">Reviews</div>
          {details.reviews.map((r, i) => (
            <div key={i} className="detail-review">
              <div className="detail-review-header">
                <span className="detail-review-author">{r.author}</span>
                <span className="detail-review-meta">
                  {'★'.repeat(Math.floor(r.rating ?? 0))}{r.time ? ` · ${r.time}` : ''}
                </span>
              </div>
              {r.text && (
                <p className="detail-review-text">
                  {r.text.length > 200 ? r.text.slice(0, 200) + '…' : r.text}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="detail-actions">
        <button type="button" className={`btn detail-save-btn ${saved ? 'btn-ghost' : ''}`} onClick={toggleWishlist}>
          <Heart size={14} strokeWidth={2} fill={saved ? 'currentColor' : 'none'} aria-hidden />
          {saved ? 'Saved' : 'Save'}
        </button>
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
  prev.activeListName === next.activeListName
);

function first30Words(text) {
  const words = text.trim().split(/\s+/);
  if (words.length <= 30) return { preview: text, hasMore: false };
  return { preview: words.slice(0, 30).join(' ') + '…', hasMore: true };
}

const ExpandableDescription = memo(function ExpandableDescription({ text, expanded, onToggle, wikiUrl }) {
  const { preview, hasMore } = useMemo(() => first30Words(text), [text]);
  return (
    <div className="detail-description-block">
      <p className="detail-description">
        {expanded ? text : preview}
      </p>
      {hasMore && (
        <button type="button" className="detail-see-more" onClick={onToggle}>
          {expanded ? 'See less' : 'See more'}
        </button>
      )}
      {wikiUrl && expanded && (
        <a href={wikiUrl} target="_blank" rel="noopener noreferrer" className="detail-wiki-link">
          Read more on Wikipedia
        </a>
      )}
    </div>
  );
});

function Skeleton() {
  return (
    <div>
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="skeleton skeleton-block" style={{ marginBottom: 8 }} />
      ))}
    </div>
  );
}

export default memo(TabbedPlacesWidget);
