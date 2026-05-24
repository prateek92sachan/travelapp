import { create } from 'zustand';
import {
  createListForDestinationMode,
  deleteWishlist,
  findListByCityMode,
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
    cloudWriter: null,
    syncing: false,

    setCloudWriter: (writer) => set({ cloudWriter: writer || null }),
    setSyncing: (v) => set({ syncing: !!v }),

    setGhostCity: (city) => set({ ghostCity: city || null }),

    beginDestination: ({ name, destination }) => {
      const dest = (destination || name || '').trim();
      const prev = get().wishlist;
      const next = pruneEmptyListsExceptDestination(dest);
      set({ wishlist: next, ghostCity: dest || null });
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

    addPlaceSmart: ({ place, category, viewportCity, fallbackListId }) => {
      if (!place) return get().wishlist;
      const prev = get().wishlist;
      let listId = fallbackListId;
      if (viewportCity) {
        const { wishlist: afterEnsure, listId: ensuredId } = createListForDestinationMode({
          name: viewportCity,
          destination: viewportCity,
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

    removePlace: ({ listId, placeId }) => {
      if (!listId || !placeId) return get().wishlist;
      const next = removeWishlistPlace({ listId, placeId });
      set({ wishlist: next });
      const list = findList(next, listId);
      if (list) emit('removeItem', list, placeId);
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
