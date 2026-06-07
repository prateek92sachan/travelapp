import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import Card from './Card';
import { useSearchStore } from '../stores/searchStore';
import { useMapStore } from '../stores/mapStore';
import {
  useWishlistStore,
  selectLists,
  selectActiveListId,
  selectGhostCity,
  selectGhostCountry,
  resolveActiveForMode,
} from '../stores/wishlistStore';
import { useTabQuery, TAB_KEYS } from '../hooks/queries/useTabQuery';
import { useViewportQuery } from '../hooks/queries/useViewportQuery';
import PlanSlotChooser from './PlanSlotChooser';
import { toast } from 'sonner';
import { ensurePlan, PHASE_LABEL } from '../utils/plan';
import { shortListName, cityKey } from './tabbedPlaces/helpers';
import { TabNav, PLACE_TABS } from './tabbedPlaces/TabNav';
import { Skeleton } from './tabbedPlaces/Skeleton';
import { PlaceRow } from './tabbedPlaces/PlaceRow';
import { PlaceDetail } from './tabbedPlaces/PlaceDetail';
import { useWishlistTabState } from './tabbedPlaces/useWishlistTabState';
import { WishlistHead } from './tabbedPlaces/WishlistHead';
import { WishlistListPicker } from './tabbedPlaces/WishlistListPicker';
import { WishlistBody } from './tabbedPlaces/WishlistBody';

function TabbedPlacesWidget({ expandable = true }) {
  // Search domain
  const activeTab = useSearchStore((s) => s.activeTab);
  const switchTab = useSearchStore((s) => s.switchTab);
  const selectedPlaceId = useSearchStore((s) => s.selectedPlaceId);
  const selectedPlace = useSearchStore((s) => s.selectedPlace);
  const detailPlace = useSearchStore((s) => s.detailPlace);
  const selectPlace = useSearchStore((s) => s.selectPlace);
  const closeDetail = useSearchStore((s) => s.closeDetail);
  const loading = useSearchStore((s) => s.loading);

  // Map domain (mode overrides drive activeTabItems priority)
  const viewportTarget = useMapStore((s) => s.viewportTarget);
  const viewportCity = useMapStore((s) => s.viewportCity);
  const viewportCountry = useMapStore((s) => s.viewportCountry);

  // Wishlist domain
  const wishlistLists = useWishlistStore(selectLists);
  const activeWishlistId = useWishlistStore(selectActiveListId);
  const ghostCity = useWishlistStore(selectGhostCity);
  const ghostCountry = useWishlistStore(selectGhostCountry);
  const wAddPlace = useWishlistStore((s) => s.addPlace);
  const wAddPlaceSmart = useWishlistStore((s) => s.addPlaceSmart);
  const wRemovePlace = useWishlistStore((s) => s.removePlace);
  const wSelectList = useWishlistStore((s) => s.selectList);
  const wRenameList = useWishlistStore((s) => s.renameList);
  const wDeleteList = useWishlistStore((s) => s.deleteList);
  const wPromoteGhost = useWishlistStore((s) => s.promoteGhost);
  const wSetGhostCity = useWishlistStore((s) => s.setGhostCity);
  const wishlist = useWishlistStore((s) => s.wishlist);

  // Derive active items per priority: viewport > city tab.
  const tabQ = useTabQuery(activeTab);
  const vpQ = useViewportQuery({ target: viewportTarget, category: activeTab });
  const activeTabItems = useMemo(() => {
    if (!TAB_KEYS.includes(activeTab)) return [];
    if (viewportTarget) return vpQ.data || [];
    return tabQ.data || [];
  }, [activeTab, viewportTarget, tabQ.data, vpQ.data]);
  const activeTabLoading =
    TAB_KEYS.includes(activeTab) &&
    ((viewportTarget && vpQ.isFetching) ||
      tabQ.isFetching ||
      loading);

  // Active list resolution: lists are mode-scoped now. When the toggle
  // switches Plan↔Saved, we look up the corresponding list for the active
  // city's destination in the target mode (or fall back to first list in
  // that mode).
  const isWishlistTab = activeTab === 'wishlist';
  const [wishlistMode, setWishlistMode] = useState('plan');

  // When ghostCity is set, the wishlist follows the focused city:
  //   - if a real list for ghostCity exists in current mode → that list is active
  //   - else → null (body falls into the "+ Add {ghostCity}" CTA)
  // Without a ghost we fall back to the existing same-destination resolution.
  const activeWishlist = useMemo(() => {
    if (ghostCity) {
      const norm = cityKey(ghostCity);
      const match = (wishlist.lists || []).find(
        (l) => l.mode === wishlistMode && cityKey(l.destination) === norm
      );
      return match || null;
    }
    return resolveActiveForMode(wishlist, wishlistMode);
  }, [wishlist, wishlistMode, ghostCity]);

  // Lifted from WishlistTab so head (workspace + city tabs) can render as
  // sticky topBands above stickyNav while body stays in card-body.
  const wishlistState = useWishlistTabState({
    activeList: activeWishlist,
    mode: wishlistMode,
    setMode: setWishlistMode,
    onRename: (id, n) => wRenameList({ listId: id, name: n }),
    onDelete: (id) => wDeleteList(id),
    // Chip click also realigns ghostCity to the chip's destination so the
    // ghost-aware activeWishlist memo picks up the clicked list as active.
    onSelect: (id) => {
      wSelectList(id);
      const list = (wishlistLists || []).find((l) => l.id === id);
      if (list?.destination) wSetGhostCity(list.destination, list.country || null);
    },
  });

  // Visible chips: only lists matching current mode.
  const visibleLists = useMemo(
    () => wishlistLists.filter((l) => l.mode === wishlistState.mode),
    [wishlistLists, wishlistState.mode]
  );

  // Ghost chip: viewport-or-search city with no real list in this mode.
  const showGhost = useMemo(() => {
    if (!ghostCity) return false;
    const norm = cityKey(ghostCity);
    return !visibleLists.some((l) => cityKey(l.destination) === norm);
  }, [ghostCity, visibleLists]);

  // Active-by-mode might differ from store's activeListId. Keep them in
  // sync so chip strip highlight + downstream selectors agree.
  useEffect(() => {
    if (!isWishlistTab) return;
    if (!activeWishlist) return;
    if (activeWishlist.id !== activeWishlistId) {
      wSelectList(activeWishlist.id);
    }
  }, [isWishlistTab, activeWishlist, activeWishlistId, wSelectList]);

  // Adapter wrappers preserving the legacy useTrip() callback shapes.
  const effectiveActiveId = activeWishlist?.id || null;
  const addPlaceToWishlist = (place, category, listId = effectiveActiveId) =>
    wAddPlace({ listId, place, category });
  const addPlaceToSmartWishlist = (place, category) =>
    wAddPlaceSmart({ place, category, viewportCity, viewportCountry, fallbackListId: effectiveActiveId });
  const removePlaceFromWishlist = (placeId, listId = effectiveActiveId) =>
    wRemovePlace({ listId, placeId });
  const selectWishlistById = (listId) => wSelectList(listId);
  const renameWishlistById = (listId, name) => wRenameList({ listId, name });
  const deleteWishlistById = (listId) => wDeleteList(listId);
  const isWishlisted = (placeId, listId = effectiveActiveId) =>
    useWishlistStore.getState().isWishlisted(listId, placeId);

  // Saves on non-wishlist tabs always target the Saved-mode list for the
  // viewport city (created on the fly if needed).
  const effectiveListId = useMemo(() => {
    if (!viewportCity) return effectiveActiveId;
    const norm = viewportCity.toLowerCase();
    return wishlistLists.find(
      (l) => l.mode === 'saved' && l.destination?.toLowerCase() === norm
    )?.id || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewportCity, wishlistLists, effectiveActiveId, wishlist]);

  const saveListName = viewportCity
    ? shortListName(viewportCity)
    : shortListName(activeWishlist?.name || ghostCity);

  // Detail card renders from `detailPlace` (set only on row tap / restore),
  // NOT from `selectedPlace` (which now also reflects pin-tap highlight).
  // Reading `detailPlace` directly avoids the card vanishing when tab
  // switches before activeTabItems updates, or when data hasn't loaded yet.
  const selected = detailPlace;
  const savedCount = activeWishlist?.items?.length || 0;

  const wAddToPlanSlot = useWishlistStore((s) => s.addToPlanSlot);
  const [detailPlanFor, setDetailPlanFor] = useState(null); // place | null
  const detailPlanList = useMemo(
    () =>
      viewportCity
        ? wishlistLists.find(
            (l) => l.mode === 'plan' && l.destination?.toLowerCase() === viewportCity.toLowerCase()
          )
        : null,
    [wishlistLists, viewportCity]
  );
  const { detailPlanDayCount, detailHotelFullDays } = useMemo(() => {
    const p = ensurePlan(detailPlanList?.plan);
    const full = new Set();
    p.itinerary.forEach((d, i) => { if ((d.hotels?.length || 0) >= 2) full.add(i); });
    return { detailPlanDayCount: p.days, detailHotelFullDays: full };
  }, [detailPlanList]);

  const commitDetailPlan = ({ dayIndex, phase, newDay }) => {
    if (!detailPlanFor || !viewportCity) { setDetailPlanFor(null); return; }
    const res = wAddToPlanSlot({
      destination: viewportCity,
      country: viewportCountry,
      place: detailPlanFor,
      category: activeTab,
      dayIndex,
      phase,
      asHotel: activeTab === 'hotels',
      newDay,
    });
    if (res?.blocked === 'hotelFull') {
      toast.error(`Day ${res.dayIndex + 1} already has 2 hotels`);
      return;
    }
    if (res) {
      const label = `Day ${res.dayIndex + 1}`;
      toast.success(res.asHotel ? `Hotel set · ${label}` : `Added to ${label} · ${PHASE_LABEL[res.phase]}`);
    } else {
      toast.error("Couldn't add to plan");
    }
    setDetailPlanFor(null);
  };

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

  const onPromoteGhost = () => {
    const newId = wPromoteGhost({ mode: wishlistMode });
    if (newId) wSelectList(newId);
  };

  const wishlistTopBands = isWishlistTab
    ? [
        ...(visibleLists.length > 0 || showGhost
          ? [
              <WishlistListPicker
                key="picker"
                lists={visibleLists}
                activeListId={activeWishlist?.id || null}
                mode={wishlistState.mode}
                ghostCity={showGhost ? ghostCity : null}
                ghostCountry={showGhost ? ghostCountry : null}
                onGhostClick={onPromoteGhost}
                editingName={wishlistState.editingName}
                editValue={wishlistState.editValue}
                editInputRef={wishlistState.editInputRef}
                setEditValue={wishlistState.setEditValue}
                setEditingName={wishlistState.setEditingName}
                onChipPointerDown={wishlistState.handleChipPointerDown}
                onChipPointerUp={wishlistState.handleChipPointerUp}
                onChipClick={wishlistState.handleChipClick}
                onCommitRename={wishlistState.commitRename}
                onCancelRename={wishlistState.cancelRename}
                onConfirmDelete={wishlistState.confirmDelete}
              />,
            ]
          : []),
        <WishlistHead
          key="head"
          mode={wishlistState.mode}
          setMode={wishlistState.setMode}
        />,
      ]
    : null;

  return (
    <>
      <Card
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
              <Star
                size={21}
                strokeWidth={2}
                aria-hidden
                fill={isWishlistTab ? 'currentColor' : 'none'}
              />
              <span>My wishlist</span>
            </button>
          </div>
        }
        middleHeader={
          <TabNav activeTab={activeTab} tabs={PLACE_TABS} onSwitch={switchTab} />
        }
        topBands={wishlistTopBands}
      >
        <div className="tab-panel" role="tabpanel">
          {isWishlistTab ? (
            <WishlistBody
              lists={visibleLists}
              activeList={activeWishlist}
              activeListId={activeWishlist?.id || null}
              onRemove={removePlaceFromWishlist}
              mode={wishlistState.mode}
              ghostCity={showGhost ? ghostCity : null}
              onPromoteGhost={onPromoteGhost}
              pickerOpen={wishlistState.pickerOpen}
              setPickerOpen={wishlistState.setPickerOpen}
              showAddForm={wishlistState.showAddForm}
              setShowAddForm={wishlistState.setShowAddForm}
              addForm={wishlistState.addForm}
              setAddForm={wishlistState.setAddForm}
              addFormRef={wishlistState.addFormRef}
              onSelect={selectWishlistById}
            />
          ) : activeTabLoading && activeTabItems.length === 0 ? (
            <Skeleton />
          ) : activeTabItems.length === 0 ? (
            <div className="muted" style={{ padding: 24, textAlign: 'center' }}>
              Nothing found for this category yet.
            </div>
          ) : (
            <div className="activity-list">
              {activeTabItems.slice(0, 5).map((a, i) => (
                <PlaceRow
                  key={a.placeId}
                  place={a}
                  index={i}
                  selected={selectedPlaceId === a.placeId}
                  onSelect={() => selectPlace(a)}
                  saved={isWishlisted(a, effectiveListId)}
                  activeListName={saveListName}
                  onSave={() => addPlaceToSmartWishlist(a, activeTab)}
                  onRemove={() => removePlaceFromWishlist(a, effectiveListId)}
                  onAddToPlan={() =>
                    viewportCity
                      ? setDetailPlanFor(a)
                      : toast.error('Search a city to add to a plan')
                  }
                />
              ))}
            </div>
          )}
        </div>
      </Card>

      {selected && !isWishlistTab && (
        <PlaceDetail
          place={selected}
          onClose={closeDetail}
          saved={isWishlisted(selected, effectiveListId)}
          activeListName={saveListName}
          onSave={() => addPlaceToSmartWishlist(selected, activeTab)}
          onRemove={() => removePlaceFromWishlist(selected, effectiveListId)}
          onAddToPlan={viewportCity ? () => setDetailPlanFor(selected) : undefined}
        />
      )}

      {detailPlanFor && (
        <PlanSlotChooser
          placeName={detailPlanFor.name}
          dayCount={detailPlanDayCount}
          isHotel={activeTab === 'hotels'}
          hotelFullDays={detailHotelFullDays}
          onCommit={commitDetailPlan}
          onClose={() => setDetailPlanFor(null)}
        />
      )}
    </>
  );
}

export default memo(TabbedPlacesWidget);
