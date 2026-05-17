const KEY = 'travel-app:wishlist';

function emptyWishlist() {
  return { version: 2, activeListId: null, lists: [] };
}

function safeParse(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : emptyWishlist();
  } catch {
    return emptyWishlist();
  }
}

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'wl-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function normalize(raw) {
  if (raw?.version === 2 && Array.isArray(raw.lists)) {
    return {
      version: 2,
      activeListId: raw.activeListId || raw.lists[0]?.id || null,
      // Guarantee every list has an items array (guards against corrupted data)
      lists: raw.lists.map((l) => ({ ...l, items: Array.isArray(l.items) ? l.items : [] }))
    };
  }

  // Migrate the previous destination-keyed shape into named wishlists.
  const lists = Object.values(raw || {})
    .filter((item) => item && typeof item === 'object' && Array.isArray(item.items))
    .map((item) => ({
      id: makeId(),
      name: item.destination || 'Untitled wishlist',
      destination: item.destination || '',
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
      items: item.items || []
    }));

  return {
    version: 2,
    activeListId: lists[0]?.id || null,
    lists
  };
}

function persist(wishlist) {
  try {
    localStorage.setItem(KEY, JSON.stringify(wishlist));
  } catch {
    // Storage can fail in private mode or if quota is exhausted.
  }
  return wishlist;
}

export function getWishlist() {
  if (typeof localStorage === 'undefined') return emptyWishlist();
  return normalize(safeParse(localStorage.getItem(KEY)));
}

export function createWishlist({ name, destination }) {
  const wishlist = getWishlist();
  const trimmed = name?.trim() || destination?.trim() || 'Untitled wishlist';
  const list = {
    id: makeId(),
    name: trimmed,
    destination: destination || '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: []
  };

  return persist({
    ...wishlist,
    activeListId: list.id,
    lists: [list, ...wishlist.lists]
  });
}

export function ensureWishlistForDestination({ name, destination }) {
  const wishlist = getWishlist();
  const trimmedDestination = destination?.trim() || name?.trim() || 'Untitled wishlist';

  // Drop empty lists from previous destinations before switching.
  const pruned = wishlist.lists.filter(
    (l) =>
      (l.items?.length ?? 0) > 0 ||
      l.destination?.toLowerCase() === trimmedDestination.toLowerCase()
  );

  const existing = pruned.find(
    (list) => list.destination?.toLowerCase() === trimmedDestination.toLowerCase()
  );

  if (existing) {
    return persist({ ...wishlist, lists: pruned, activeListId: existing.id });
  }

  const list = {
    id: makeId(),
    name: name?.trim() || trimmedDestination,
    destination: trimmedDestination,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: []
  };

  return persist({
    ...wishlist,
    activeListId: list.id,
    lists: [list, ...pruned]
  });
}

export function renameWishlist({ listId, name }) {
  if (!listId || !name?.trim()) return getWishlist();

  const wishlist = getWishlist();
  const lists = wishlist.lists.map((list) =>
    list.id === listId
      ? { ...list, name: name.trim(), updatedAt: Date.now() }
      : list
  );

  return persist({ ...wishlist, lists });
}

export function selectWishlist(listId) {
  const wishlist = getWishlist();
  if (!wishlist.lists.some((list) => list.id === listId)) return wishlist;
  return persist({ ...wishlist, activeListId: listId });
}

export function saveWishlistPlace({ listId, place, category }) {
  if (!listId || !place?.placeId) return getWishlist();

  const wishlist = getWishlist();
  const item = {
    placeId: place.placeId,
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    rating: place.rating,
    reviewCount: place.reviewCount,
    photoUrl: place.photoUrl,
    summary: place.summary,
    estCost: place.estCost,
    estDuration: place.estDuration,
    category,
    savedAt: Date.now()
  };

  const lists = wishlist.lists.map((list) => {
    if (list.id !== listId) return list;
    const existingIndex = list.items.findIndex((p) => p.placeId === place.placeId);
    const items =
      existingIndex >= 0
        ? list.items.map((p, i) => (i === existingIndex ? { ...p, ...item } : p))
        : [...list.items, item];
    return { ...list, items, updatedAt: Date.now() };
  });

  return persist({ ...wishlist, activeListId: listId, lists });
}

export function removeWishlistPlace({ listId, placeId }) {
  if (!listId || !placeId) return getWishlist();

  const wishlist = getWishlist();
  const lists = wishlist.lists.map((list) =>
    list.id === listId
      ? {
          ...list,
          items: list.items.filter((p) => p.placeId !== placeId),
          updatedAt: Date.now()
        }
      : list
  );

  return persist({ ...wishlist, lists });
}

export function deleteWishlist(listId) {
  const wishlist = getWishlist();
  const lists = wishlist.lists.filter((list) => list.id !== listId);
  const activeListId =
    wishlist.activeListId === listId ? lists[0]?.id || null : wishlist.activeListId;
  return persist({ ...wishlist, activeListId, lists });
}

export function isPlaceWishlisted(wishlist, listId, placeId) {
  if (!listId || !placeId) return false;
  const list = wishlist.lists?.find((item) => item.id === listId);
  return list?.items?.some((p) => p.placeId === placeId) || false;
}

export function replaceWishlist(data) {
  const normalized = normalize(data || {});
  return persist(normalized);
}
