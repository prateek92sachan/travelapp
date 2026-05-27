// Wikipedia enrichment — free, no API key, public domain content.
//
// We use the REST summary endpoint:
//   https://en.wikipedia.org/api/rest_v1/page/summary/{title}
//
// It returns a clean lead extract (~2 sentences) for any article. We use
// MediaWiki's search API first to map a place name to the actual article
// title, since "Eiffel Tower" might be the page but "the eiffel tower"
// or "Tour Eiffel" might not redirect cleanly.

import { loadCache, makeSaver } from '../utils/persistentCache';

const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_SEARCH =
  'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=';

// Persisted for a day. Beyond saving free Wikipedia calls, this keeps the
// place→thumbnail mapping warm so enrichWithWiki keeps swapping in free Wiki
// images on reload instead of falling back to billed Google photos.
const WIKI_TTL_MS = 24 * 60 * 60 * 1000;
const WIKI_CACHE = loadCache('wiki', WIKI_TTL_MS);
const persistWiki = makeSaver('wiki', { max: 500 });

/**
 * Look up a place on Wikipedia, return { extract, url } or null.
 * Always resolves — never throws — so a single missing article doesn't
 * break the whole enrichment chain.
 *
 * `context` (e.g. "Tokyo") is appended to the search to disambiguate
 * common names — "Park" alone returns the wrong page, "Park Tokyo" does
 * better.
 */
export async function fetchWikiSummary(placeName, context = '') {
  if (!placeName) return null;
  const query = context ? `${placeName} ${context}` : placeName;

  if (WIKI_CACHE.has(query)) return WIKI_CACHE.get(query);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Step 1: search for the article title
    const searchRes = await fetch(WIKI_SEARCH + encodeURIComponent(query), { signal: controller.signal });
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    // openSearch returns [query, [titles], [descriptions], [urls]]
    const title = searchData?.[1]?.[0];
    if (!title) return null;

    // Step 2: fetch the summary
    const sumRes = await fetch(WIKI_REST + encodeURIComponent(title), { signal: controller.signal });
    if (!sumRes.ok) return null;
    const sum = await sumRes.json();

    // Skip disambiguation pages — they're not useful descriptions
    if (sum.type === 'disambiguation') return null;
    if (!sum.extract) return null;

    const result = {
      extract: sum.extract,
      url: sum.content_urls?.desktop?.page,
      thumbnail: sum.thumbnail?.source || null
    };
    WIKI_CACHE.set(query, result);
    persistWiki(WIKI_CACHE);
    return result;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Backfill ONLY photoless places with a free Wikipedia thumbnail.
 *
 * Used by the viewport / nearby map paths, which (unlike the tab path) don't
 * run full enrichment. Tmap (pure-Mapbox) places arrive with photoUrl=null, so
 * saving them from a map pin produced a blank card. This fills that gap with a
 * free Wiki image — no Google Photos call.
 *
 * Places that already have a photoUrl are returned UNTOUCHED — no Wikipedia
 * lookup, no photo swap — so Google/Mapbox-sourced results keep their native
 * photos and incur zero extra work. Returns the original array reference when
 * nothing changed, so callers can skip a needless cache write.
 */
export async function backfillPhotosWithWiki(places, context = '') {
  if (!Array.isArray(places) || places.length === 0) return places;
  if (!places.some((p) => !p?.photoUrl)) return places;
  let changed = false;
  const out = await Promise.all(
    places.map(async (p) => {
      if (p?.photoUrl) return p;
      const wiki = await fetchWikiSummary(p.name, context);
      if (!wiki) return p;
      changed = true;
      return wiki.thumbnail ? { ...p, wiki, photoUrl: wiki.thumbnail } : { ...p, wiki };
    })
  );
  return changed ? out : places;
}

/**
 * Enrich a list of places with Wikipedia summaries in parallel.
 * Returns the same array shape with optional .wiki property added.
 * Never fails the whole batch on a single missing article.
 *
 * `context` should be the destination name (e.g. "Tokyo") to help
 * disambiguate generically-named places.
 */
export async function enrichWithWiki(places, context = '') {
  if (!Array.isArray(places) || places.length === 0) return places;
  const enriched = await Promise.all(
    places.map(async (p) => {
      const wiki = await fetchWikiSummary(p.name, context);
      if (!wiki) return p;
      // Prefer free Wikimedia thumbnail over Google Places photo when available
      // (places that have a Wikipedia article are usually famous landmarks
      // where Wiki photos are appropriate; saves Google Photos API call).
      return {
        ...p,
        wiki,
        photoUrl: wiki.thumbnail || p.photoUrl
      };
    })
  );
  return enriched;
}
