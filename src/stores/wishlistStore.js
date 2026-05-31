import { create } from 'zustand';
import {
  createListForDestinationMode,
  ensurePlanList,
  backfillListCountries,
  rollupSubLocalityLists,
  deleteWishlist,
  findListByCityMode,
  findMatchingItem,
  getWishlist,
  isPlaceWishlisted,
  pruneEmptyListsExceptDestination,
  renameWishlist,
  removeWishlistPlace,
  replaceWishlist,
  saveWishlistPlace,
  selectWishlist,
  updatePlanForList,
} from '../utils/wishlist';
import {
  ensurePlan,
  setDays,
  setPlaceSnapshot,
  addSession,
  setHotelsForDay,
} from '../utils/plan';

const initial = typeof window === 'undefined'
  ? { version: 3, activeListId: null, lists: [] }
  : getWishlist();

function diffLists(prev, next) {
  const prevById = new Map((prev?.lists || []).map((l) => [l.id, l]));
  const nextById = new Map((next?.lists || []).map((l) => [l.id, l]));
  const added = [];
  const removed = [];
  for (const [id, list] of nextById) if (!prevById.has(id)) added.push(list);
  for (const [id, list] of prevById) if (!nextById.has(id)) removed.push(list);
  return { added, removed };
}

function findList(wishlist, listId) {
  return (wishlist?.lists || []).find((l) => l.id === listId) || null;
}

export const useWishlistStore = create((set, get) => {
  // Cloud sync wiring. useTrip installs a writer once the user signs in;
  // remote→local apply paths (replace) set syncing=true so writers no-op.
  function emit(method, ...args) {
    if (get().syncing) return;
    const writer = get().cloudWriter;
    if (!writer?.[method]) return;
    // Fire-and-forget — sync errors are logged inside the writer.
    Promise.resolve(writer[method](...args)).catch((err) =>
      console.warn(`[wishlistSync] ${method} failed:`, err)
    );
  }

  function emitDelta(prev, next) {
    const { added, removed } = diffLists(prev, next);
    added.forEach((list) => emit('upsertList', list));
    removed.forEach((list) => emit('deleteList', list));
  }

  return {
    wishlist: initial,
    ghostCity: null,
    ghostCountry: null,
    cloudWriter: null,
    syncing: false,

    setCloudWriter: (writer) => set({ cloudWriter: writer || null }),
    setSyncing: (v) => set({ syncing: !!v }),

    setGhostCity: (city, country) =>
      set(country === undefined
        ? { ghostCity: city || null }
        : { ghostCity: city || null, ghostCountry: country || null }),

    beginDestination: ({ name, destination, country }) => {
      const dest = (destination || name || '').trim();
      const prev = get().wishlist;
      const next = pruneEmptyListsExceptDestination(dest);
      // Country: explicit arg wins; else parse the trailing segment of the
      // formatted-address destination ("City, Region, Country").
      const parts = dest.split(',').map((s) => s.trim()).filter(Boolean);
      const derived = country || (parts.length >= 2 ? parts[parts.length - 1] : null);
      set({ wishlist: next, ghostCity: dest || null, ghostCountry: derived || null });
      emitDelta(prev, next);
      return next;
    },

    replace: (data) => {
      const next = replaceWishlist(data);
      set({ wishlist: next });
      return next;
    },

    addPlace: ({ listId, place, category }) => {
      if (!listId || !place) return get().wishlist;
      const next = saveWishlistPlace({ listId, place, category });
      set({ wishlist: next });
      const list = findList(next, listId);
      const item = list?.items?.find((p) => p.placeId === place.placeId);
      if (list && item) emit('upsertItem', list, item);
      return next;
    },

    addPlaceSmart: ({ place, category, viewportCity, viewportCountry, fallbackListId }) => {
      if (!place) return get().wishlist;
      const prev = get().wishlist;
      let listId = fallbackListId;
      if (viewportCity) {
        const { wishlist: afterEnsure, listId: ensuredId } = createListForDestinationMode({
          name: viewportCity,
          destination: viewportCity,
          country: viewportCountry,
          mode: 'saved',
        });
        emitDelta(prev, afterEnsure);
        listId = ensuredId;
      }
      if (!listId) return get().wishlist;
      const next = saveWishlistPlace({ listId, place, category });
      set({ wishlist: next });
      const list = findList(next, listId);
      const item = list?.items?.find((p) => p.placeId === place.placeId);
      if (list && item) {
        emit('upsertItem', list, item);
        emit('setActiveListId', listId);
      }
      return next;
    },

    promoteGhost: ({ mode }) => {
      const ghost = get().ghostCity;
      if (!ghost) return null;
      const prev = get().wishlist;
      const { wishlist, listId } = createListForDestinationMode({
        name: ghost,
        destination: ghost,
        country: get().ghostCountry,
        mode,
      });
      set({ wishlist });
      emitDelta(prev, wishlist);
      emit('setActiveListId', listId);
      return listId;
    },

    ensureListForMode: ({ destination, mode }) => {
      const prev = get().wishlist;
      const { wishlist, listId } = createListForDestinationMode({
        name: destination,
        destination,
        mode,
      });
      set({ wishlist });
      emitDelta(prev, wishlist);
      emit('setActiveListId', listId);
      return listId;
    },

    removePlace: ({ listId, placeId, place }) => {
      const query = place ?? placeId;
      if (!listId || !query) return get().wishlist;
      // Resolve the matched item BEFORE removal so cloud sync deletes the
      // item's actual stored placeId (may differ from the query's provider id).
      const prevList = findList(get().wishlist, listId);
      const target = findMatchingItem(prevList?.items, query);
      const next = removeWishlistPlace({ listId, placeId, place });
      set({ wishlist: next });
      const list = findList(next, listId);
      if (list && target) emit('removeItem', list, target.placeId);
      return next;
    },

    selectList: (listId) => {
      const next = selectWishlist(listId);
      set({ wishlist: next });
      emit('setActiveListId', listId);
      return next;
    },

    renameList: ({ listId, name }) => {
      const next = renameWishlist({ listId, name });
      set({ wishlist: next });
      const list = findList(next, listId);
      if (list) emit('upsertList', list);
      return next;
    },

    deleteList: (listId) => {
      const prev = get().wishlist;
      const removed = findList(prev, listId);
      const next = deleteWishlist(listId);
      set({ wishlist: next });
      if (removed) emit('deleteList', removed);
      if (prev.activeListId === listId) emit('setActiveListId', next.activeListId);
      return next;
    },

    updatePlan: ({ listId, plan }) => {
      const next = updatePlanForList({ listId, plan });
      set({ wishlist: next });
      const list = findList(next, listId);
      if (list?.mode === 'plan') emit('updatePlan', list);
      return next;
    },

    addToPlanSlot: ({ destination, country, place, category, dayIndex, phase, asHotel, newDay }) => {
      if (!place?.placeId || !destination) return null;
      const { listId, created } = ensurePlanList({ destination, country });
      if (!listId) return null;

      const srcList = findList(get().wishlist, listId);
      let plan = ensurePlan(srcList?.plan);

      let targetDay = newDay ? plan.days : dayIndex;
      if (newDay) plan = setDays(plan, plan.days + 1);
      if (targetDay == null || targetDay < 0 || targetDay >= plan.days) targetDay = 0;

      plan = setPlaceSnapshot(plan, place, category);

      if (asHotel) {
        const current = plan.itinerary[targetDay]?.hotels || [];
        if (current.length >= 2) return { blocked: 'hotelFull', dayIndex: targetDay };
        if (!current.includes(place.placeId)) {
          plan = setHotelsForDay(plan, { dayIndex: targetDay, hotels: [...current, place.placeId] });
        }
      } else {
        plan = addSession(plan, { dayIndex: targetDay, phase, placeId: place.placeId });
      }

      const next = updatePlanForList({ listId, plan });
      set({ wishlist: next });

      const outList = findList(next, listId);
      if (created && outList) emit('upsertList', outList);
      if (outList) emit('updatePlan', outList);

      return { listId, dayIndex: targetDay, phase, asHotel, created };
    },

    // Country backfill for pre-existing lists. Geocodes each unique city-only
    // destination (skipping those in `attemptedKeys`), stores the country, and
    // upserts changed lists to the cloud. Returns { changed, attempted } so the
    // caller can persist the attempted-destination set and avoid re-billing.
    backfillCountries: async (geocodeFn, attemptedKeys = []) => {
      const { wishlist: next, changed, attempted } =
        await backfillListCountries(geocodeFn, attemptedKeys);
      if (changed.length > 0) {
        set({ wishlist: next });
        changed.forEach((list) => emit('upsertList', list));
      }
      return { changed, attempted };
    },

    // One-time rollup of sub-locality list names (e.g. "1st arrondissement" →
    // "Paris"). Renames affected lists and upserts them to the cloud. Returns
    // { changed, attempted } so the caller can persist the attempted set.
    rollupSubLocalities: async (geocodeFn, attemptedKeys = []) => {
      const { wishlist: next, changed, attempted } =
        await rollupSubLocalityLists(geocodeFn, attemptedKeys);
      if (changed.length > 0) {
        set({ wishlist: next });
        changed.forEach((list) => emit('upsertList', list));
      }
      return { changed, attempted };
    },

    isWishlisted: (listId, placeId) =>
      isPlaceWishlisted(get().wishlist, listId, placeId),
  };
});

export const selectLists = (s) => s.wishlist.lists || [];
export const selectActiveListId = (s) => {
  const lists = s.wishlist.lists || [];
  return s.wishlist.activeListId || lists[0]?.id || null;
};
export const selectGhostCity = (s) => s.ghostCity;
export const selectGhostCountry = (s) => s.ghostCountry;

// Resolve the list that should be active for a given mode. Logic:
//   1. If activeListId points to a list in this mode → use it.
//   2. Else, if activeListId's destination has a same-city list in this
//      mode → use that.
//   3. Else, first list in this mode (if any).
//   4. Else, null.
export function resolveActiveForMode(wishlist, mode) {
  const lists = wishlist.lists || [];
  const active = lists.find((l) => l.id === wishlist.activeListId);
  if (active?.mode === mode) return active;
  if (active?.destination) {
    const sibling = findListByCityMode(lists, active.destination, mode);
    if (sibling) return sibling;
  }
  return lists.find((l) => l.mode === mode) || null;
}
