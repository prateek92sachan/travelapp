import { toast } from 'sonner';

const KEY = 'travel-app:wishlist';

// Throttle quota warnings so a burst of failing saves shows one toast, not many.
let lastQuotaToast = 0;
function warnStorageFull(err) {
  const quota =
    err?.name === 'QuotaExceededError' ||
    err?.code === 22 || // most browsers
    err?.code === 1014; // Firefox
  if (!quota) return;
  const now = Date.now();
  if (now - lastQuotaToast < 10000) return;
  lastQuotaToast = now;
  try {
    toast.error('Storage full — changes may not be saved. Sign in to sync or free up space.');
  } catch {
    /* toast unavailable (no Toaster mounted) — nothing else to do */
  }
}

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

// ---- Cross-provider place identity ----------------------------------------
// Google and Mapbox (Tmap) return different ids for the same physical place,
// so a place saved under one provider wasn't recognized under the other
// (heart showed un-saved; could double-save). We bridge that locally — no API
// calls, no added cost — by treating two places as the same when their ids
// match OR their normalized names match AND they sit within MATCH_RADIUS_M.
const MATCH_RADIUS_M = 75;

function normName(s) {
  return (s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Equirectangular metre approximation — accurate enough at the ~75m scale and
// far cheaper than full haversine.
function metersBetween(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return Infinity;
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad * Math.cos(((a.lat + b.lat) / 2) * toRad);
  return Math.sqrt(dLat * dLat + dLng * dLng) * R;
}

export function isSamePlace(item, place) {
  if (!item || !place) return false;
  if (item.placeId && place.placeId && item.placeId === place.placeId) return true;
  if (!item.name || !place.name) return false;
  if (normName(item.name) !== normName(place.name)) return false;
  return metersBetween(item, place) <= MATCH_RADIUS_M;
}

// Find the saved item matching a query. `query` may be a place object (uses the
// cross-provider heuristic) or a bare placeId string (exact match only).
export function findMatchingItem(items, query) {
  if (!Array.isArray(items) || !query) return null;
  if (typeof query === 'string') return items.find((p) => p.placeId === query) || null;
  return items.find((p) => isSamePlace(p, query)) || null;
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
  } catch (err) {
    // Storage can fail in private mode or if quota is exhausted. Surface quota
    // exhaustion so the user knows their save didn't stick.
    warnStorageFull(err);
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
export function createListForDestinationMode({ name, destination, mode, country }) {
  const wishlist = getWishlist();
  const trimmedDestination = destination?.trim() || name?.trim() || 'Untitled wishlist';
  const m = mode === 'plan' ? 'plan' : 'saved';
  // Country: explicit arg wins; else parse the trailing segment of a
  // formatted-address destination ("City, Region, Country").
  const destParts = trimmedDestination.split(',').map((s) => s.trim()).filter(Boolean);
  const resolvedCountry =
    country?.trim() || (destParts.length >= 2 ? destParts[destParts.length - 1] : null);

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
    // Backfill country on lists created before we tracked it.
    const listsOut = !existing.country && resolvedCountry
      ? pruned.map((l) => (l.id === existing.id ? { ...l, country: resolvedCountry } : l))
      : pruned;
    const next = persist({ ...wishlist, lists: listsOut, activeListId: existing.id });
    return { wishlist: next, listId: existing.id };
  }

  const list = {
    id: makeId(),
    name: name?.trim() || trimmedDestination,
    destination: trimmedDestination,
    country: resolvedCountry,
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

// Ensure a plan-mode list exists for a destination WITHOUT changing
// activeListId. Callers that add to the plan from another mode (Saved picker,
// detail card) must not shift the active list out from under the user. Does
// not prune. Returns the existing/created plan list id and a `created` flag.
export function ensurePlanList({ destination, country }) {
  const wishlist = getWishlist();
  const dest = (destination || '').trim();
  if (!dest) return { wishlist, listId: null, created: false };

  const existing = findListByCityMode(wishlist.lists, dest, 'plan');
  if (existing) return { wishlist, listId: existing.id, created: false };

  const parts = dest.split(',').map((s) => s.trim()).filter(Boolean);
  const resolvedCountry =
    country?.trim() || (parts.length >= 2 ? parts[parts.length - 1] : null);
  const list = {
    id: makeId(),
    name: dest,
    destination: dest,
    country: resolvedCountry,
    mode: 'plan',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    items: [],
    plan: null,
  };
  const next = persist({ ...wishlist, lists: [list, ...wishlist.lists] });
  return { wishlist: next, listId: list.id, created: true };
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
    // Match cross-provider so re-saving the same place under a different
    // provider updates the existing entry. Keep the stored item's original
    // placeId so its own remove/select paths stay stable.
    const existing = findMatchingItem(list.items, place);
    const items = existing
      ? list.items.map((p) => (p === existing ? { ...p, ...item, placeId: p.placeId } : p))
      : [...list.items, item];
    return { ...list, items, updatedAt: Date.now() };
  });

  return persist({ ...wishlist, activeListId: listId, lists });
}

export function removeWishlistPlace({ listId, placeId, place }) {
  const query = place ?? placeId;
  if (!listId || !query) return getWishlist();
  const wishlist = getWishlist();
  const lists = wishlist.lists.map((list) => {
    if (list.id !== listId) return list;
    // Resolve cross-provider so a place can be un-saved from whichever provider
    // is active, even if it was saved under the other provider's id.
    const match = findMatchingItem(list.items, query);
    if (!match) return list;
    return {
      ...list,
      items: list.items.filter((p) => p !== match),
      updatedAt: Date.now(),
    };
  });
  return persist({ ...wishlist, lists });
}

export function deleteWishlist(listId) {
  const wishlist = getWishlist();
  const lists = wishlist.lists.filter((list) => list.id !== listId);
  const activeListId =
    wishlist.activeListId === listId ? lists[0]?.id || null : wishlist.activeListId;
  return persist({ ...wishlist, activeListId, lists });
}

// `query` may be a place object (cross-provider match) or a placeId string.
export function isPlaceWishlisted(wishlist, listId, query) {
  if (!listId || !query) return false;
  const list = wishlist.lists?.find((item) => item.id === listId);
  return !!findMatchingItem(list?.items, query);
}

// Backfill `country` for older lists that stored only a city name as
// `destination` (no country tracked, nothing to parse). Forward-geocodes each
// unique destination missing a country and stores the trailing country
// segment. `geocodeFn` is injected (placesProvider.geocodeDestination) to keep
// this module service-free. `attemptedKeys` (iterable of lowercased
// destinations already tried) is skipped so a failed/ambiguous lookup isn't
// re-billed on every load. Returns { wishlist, changed, attempted } —
// `changed` = lists that gained a country (for cloud upsert), `attempted` =
// destination keys tried this pass (to persist into the attempted set).
export async function backfillListCountries(geocodeFn, attemptedKeys = []) {
  const wishlist = getWishlist();
  const lists = wishlist.lists || [];
  const tried = attemptedKeys instanceof Set ? attemptedKeys : new Set(attemptedKeys);
  const targets = lists.filter(
    (l) => !l.country && l.destination && !tried.has(l.destination.trim().toLowerCase())
  );
  if (targets.length === 0 || typeof geocodeFn !== 'function') {
    return { wishlist, changed: [], attempted: [] };
  }

  // Dedupe by destination so the same city isn't geocoded twice.
  const byKey = new Map();
  for (const l of targets) {
    const key = l.destination.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, l.destination.trim());
  }

  const countryByKey = new Map();
  const attempted = [];
  for (const [key, dest] of byKey) {
    attempted.push(key);
    try {
      const geo = await geocodeFn(dest);
      // Prefer the geocoder's explicit country field; fall back to the trailing
      // segment of a formatted address if present.
      let country = geo?.country || null;
      if (!country) {
        const parts = (geo?.formattedAddress || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length >= 2) country = parts[parts.length - 1];
      }
      if (country) countryByKey.set(key, country);
    } catch {
      /* best-effort — skip on failure (key stays attempted, not retried) */
    }
  }
  if (countryByKey.size === 0) return { wishlist, changed: [], attempted };

  const changed = [];
  const nextLists = lists.map((l) => {
    if (l.country || !l.destination) return l;
    const c = countryByKey.get(l.destination.trim().toLowerCase());
    if (!c) return l;
    const updated = { ...l, country: c };
    changed.push(updated);
    return updated;
  });
  if (changed.length === 0) return { wishlist, changed: [], attempted };
  const next = persist({ ...wishlist, lists: nextLists });
  return { wishlist: next, changed, attempted };
}

// One-time rollup: older lists may have been created with a sub-locality name
// (e.g. "1st arrondissement") because Mapbox reverse-geocode returned the
// most-specific feature. Forward-geocode each destination; if it resolves to a
// sub-locality with a parent place, rename the list (name + destination) to
// that city. `attemptedKeys` skips destinations already processed so it never
// re-bills. Returns { wishlist, changed, attempted }.
export async function rollupSubLocalityLists(geocodeFn, attemptedKeys = []) {
  const wishlist = getWishlist();
  const lists = wishlist.lists || [];
  const tried = attemptedKeys instanceof Set ? attemptedKeys : new Set(attemptedKeys);
  const targets = lists.filter(
    (l) => l.destination && !tried.has(l.destination.trim().toLowerCase())
  );
  if (targets.length === 0 || typeof geocodeFn !== 'function') {
    return { wishlist, changed: [], attempted: [] };
  }

  const byKey = new Map();
  for (const l of targets) {
    const key = l.destination.trim().toLowerCase();
    if (!byKey.has(key)) byKey.set(key, l.destination.trim());
  }

  const rollupByKey = new Map(); // key -> { city, country }
  const attempted = [];
  for (const [key, dest] of byKey) {
    attempted.push(key);
    try {
      const geo = await geocodeFn(dest);
      const parent = geo?.parentPlace;
      // Only roll up when the parent place differs from the current name.
      if (parent && parent.trim().toLowerCase() !== key.split(',')[0]) {
        rollupByKey.set(key, { city: parent.trim(), country: geo?.country || null });
      }
    } catch {
      /* best-effort */
    }
  }
  if (rollupByKey.size === 0) return { wishlist, changed: [], attempted };

  const changed = [];
  const nextLists = lists.map((l) => {
    if (!l.destination) return l;
    const hit = rollupByKey.get(l.destination.trim().toLowerCase());
    if (!hit) return l;
    const updated = {
      ...l,
      name: hit.city,
      destination: hit.city,
      country: l.country || hit.country,
      updatedAt: Date.now(),
    };
    changed.push(updated);
    return updated;
  });
  if (changed.length === 0) return { wishlist, changed: [], attempted };
  const next = persist({ ...wishlist, lists: nextLists });
  return { wishlist: next, changed, attempted };
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
