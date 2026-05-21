import { create } from 'zustand';
import {
  deleteWishlist,
  ensureWishlistForDestination,
  getWishlist,
  isPlaceWishlisted,
  renameWishlist,
  removeWishlistPlace,
  replaceWishlist,
  saveWishlistPlace,
  selectWishlist,
  updatePlanForList
} from '../utils/wishlist';

const initial = typeof window === 'undefined'
  ? { version: 2, activeListId: null, lists: [] }
  : getWishlist();

export const useWishlistStore = create((set, get) => ({
  wishlist: initial,

  ensureForDestination: ({ name, destination }) => {
    const next = ensureWishlistForDestination({ name, destination });
    set({ wishlist: next });
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
    return next;
  },

  addPlaceSmart: ({ place, category, viewportCity, fallbackListId }) => {
    if (!place) return get().wishlist;
    if (viewportCity) {
      const intermediate = ensureWishlistForDestination({
        name: viewportCity,
        destination: viewportCity
      });
      const next = saveWishlistPlace({
        listId: intermediate.activeListId,
        place,
        category
      });
      set({ wishlist: next });
      return next;
    }
    if (!fallbackListId) return get().wishlist;
    const next = saveWishlistPlace({ listId: fallbackListId, place, category });
    set({ wishlist: next });
    return next;
  },

  removePlace: ({ listId, placeId }) => {
    if (!listId || !placeId) return get().wishlist;
    const next = removeWishlistPlace({ listId, placeId });
    set({ wishlist: next });
    return next;
  },

  selectList: (listId) => {
    const next = selectWishlist(listId);
    set({ wishlist: next });
    return next;
  },

  renameList: ({ listId, name }) => {
    const next = renameWishlist({ listId, name });
    set({ wishlist: next });
    return next;
  },

  deleteList: (listId) => {
    const next = deleteWishlist(listId);
    set({ wishlist: next });
    return next;
  },

  updatePlan: ({ listId, plan }) => {
    const next = updatePlanForList({ listId, plan });
    set({ wishlist: next });
    return next;
  },

  isWishlisted: (listId, placeId) =>
    isPlaceWishlisted(get().wishlist, listId, placeId)
}));

export const selectLists = (s) => s.wishlist.lists || [];
export const selectActiveListId = (s) => {
  const lists = s.wishlist.lists || [];
  return s.wishlist.activeListId || lists[0]?.id || null;
};
