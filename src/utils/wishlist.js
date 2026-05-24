const KEY = 'travel-app:wishlist';

function emptyWishlist() {
  return { version: 3, activeListId: null, lists: [] };
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

function hasPlanContent(plan) {
  if (!plan || !Array.isArray(plan.itinerary)) return false;
  for (const day of plan.itinerary) {
    if (Array.isArray(day?.hotels) && day.hotels.length > 0) return true;
    const phases = day?.phases;
    if (!phases) continue;
    for (const key of Object.keys(phases)) {
      if (Array.isArray(phases[key]) && phases[key].length > 0) return true;
    }
  }
  return false;
}

// v2 → v3: each list gets a `mode` field ('plan' | 'saved'). Legacy lists
// were dual-purpose. Migration rule:
//   - has saved items AND plan content → split into two lists (saved + plan)
//   - has only saved items             → mode='saved'
//   - has only plan content            → mode='plan'
//   - has neither                      → drop
function migrateV2ListToV3(list) {
  const items = Array.isArray(list.items) ? list.items : [];
  const hasItems = items.length > 0;
  const hasPlan = hasPlanContent(list.plan);
  if (hasItems && hasPlan) {
    return [
      {
        id: list.id,
        name: list.name,
        destination: list.destination,
        mode: 'saved',
        createdAt: list.createdAt || Date.now(),
        updatedAt: list.updatedAt || Date.now(),
        items,
        plan: null,
      },
      {
        id: makeId(),
        name: list.name,
        destination: list.destination,
        mode: 'plan',
        createdAt: list.createdAt || Date.now(),
        updatedAt: list.updatedAt || Date.now(),
        items: [],
        plan: list.plan,
      },
    ];
  }
  if (hasItems) {
    return [{
      id: list.id, name: list.name, destination: list.destination,
      mode: 'saved', createdAt: list.createdAt || Date.now(), updatedAt: list.updatedAt || Date.now(),
      items, plan: null,
    }];
  }
  if (hasPlan) {
    return [{
      id: list.id, name: list.name, destination: list.destination,
      mode: 'plan', createdAt: list.createdAt || Date.now(), updatedAt: list.updatedAt || Date.now(),
      items: [], plan: list.plan,
    }];
  }
  return [];
}

function normalize(raw) {
  if (raw?.version === 3 && Array.isArray(raw.lists)) {
    return {
      version: 3,
      activeListId: raw.activeListId || raw.lists[0]?.id || null,
      lists: raw.lists.map((l) => ({
        ...l,
        mode: l.mode === 'plan' ? 'plan' : 'saved',
        items: Array.isArray(l.items) ? l.items : [],
      })),
    };
  }

  if (raw?.version === 2 && Array.isArray(raw.lists)) {
    const migrated = raw.lists.flatMap(migrateV2ListToV3);
    const stillActive = migrated.some((l) => l.id === raw.activeListId)
      ? raw.activeListId
      : migrated[0]?.id || null;
    return { version: 3, activeListId: stillActive, lists: migrated };
  }

  // Pre-v2 destination-keyed shape → v2-shaped lists → migrate to v3.
  const v2Lists = Object.values(raw || {})
    .filter((item) => item && typeof item === 'object' && Array.isArray(item.items))
    .map((item) => ({
      id: makeId(),
      name: item.destination || 'Untitled wishlist',
      destination: item.destination || '',
      createdAt: item.createdAt || Date.now(),
      updatedAt: item.updatedAt || Date.now(),
      items: item.items || [],
    }));
  const v3Lists = v2Lists.flatMap(migrateV2ListToV3);
  return { version: 3, activeListId: v3Lists[0]?.id || null, lists: v3Lists };
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

// Find list by destination + mode. Case-insensitive destination match.
export function findListByCityMode(lists, destination, mode) {
  if (!destination || !mode) return null;
  const norm = destination.toLowerCase();
  return lists.find(
    (l) => l.mode === mode && l.destination?.toLowerCase() === norm
  ) || null;
}

// Create a real list for (destination, mode) if one doesn't already exist.
// Prunes empty lists from previous destinations on the way in. Returns the
// next wishlist + the activated list id.
export function createListForDestinationMode({ name, destination, mode }) {
  const wishlist = getWishlist();
  const trimmedDestination = destination?.trim() || name?.trim() || 'Untitled wishlist';
  const m = mode === 'plan' ? 'plan' : 'saved';

  const pruned = wishlist.lists.filter(
    (l) =>
      (l.items?.length ?? 0) > 0 ||
      hasPlanContent(l.plan) ||
      l.destination?.toLowerCase() === trimmedDestination.toLowerCase()
  );

  const existing = pruned.find(
    (l) => l.mode === m && l.destination?.toLowerCase() === trimmedDestination.toLowerCase()
  );
  if (existing) {
    const next = persist({ ...wishlist, lists: pruned, activeListId: existing.id });
    return { wishlist: next, listId: existing.id };
  }

  const list = {
    id: makeId(),
    name: name?.trim() || trimmedDestination,
    destination: trimmedDestination,
    mode: m,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
    plan: null,
  };
  const next = persist({
    ...wishlist,
    activeListId: list.id,
    lists: [list, ...pruned],
  });
  return { wishlist: next, listId: list.id };
}

// Prune empty lists from previous destinations (called on new search). Does
// NOT create anything. Keeps lists for the just-searched destination plus
// any list with real content.
export function pruneEmptyListsExceptDestination(destination) {
  const wishlist = getWishlist();
  const norm = destination?.trim().toLowerCase() || '';
  const lists = wishlist.lists.filter(
    (l) =>
      (l.items?.length ?? 0) > 0 ||
      hasPlanContent(l.plan) ||
      l.destination?.toLowerCase() === norm
  );
  if (lists.length === wishlist.lists.length) return wishlist;
  const stillActive = lists.some((l) => l.id === wishlist.activeListId)
    ? wishlist.activeListId
    : lists[0]?.id || null;
  return persist({ ...wishlist, lists, activeListId: stillActive });
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
    savedAt: Date.now(),
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
          updatedAt: Date.now(),
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

export function updatePlanForList({ listId, plan }) {
  if (!listId) return getWishlist();
  const wishlist = getWishlist();
  const lists = wishlist.lists.map((list) =>
    list.id === listId ? { ...list, plan, updatedAt: Date.now() } : list
  );
  return persist({ ...wishlist, lists });
}
