// Wikipedia enrichment — free, no API key, public domain content.
//
// We use the REST summary endpoint:
//   https://en.wikipedia.org/api/rest_v1/page/summary/{title}
//
// It returns a clean lead extract (~2 sentences) for any article. We use
// MediaWiki's search API first to map a place name to the actual article
// title, since "Eiffel Tower" might be the page but "the eiffel tower"
// or "Tour Eiffel" might not redirect cleanly.

const WIKI_REST = 'https://en.wikipedia.org/api/rest_v1/page/summary/';
const WIKI_SEARCH =
  'https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=';

const WIKI_CACHE = new Map();

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

  try {
    // Step 1: search for the article title
    const searchRes = await fetch(WIKI_SEARCH + encodeURIComponent(query));
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    // openSearch returns [query, [titles], [descriptions], [urls]]
    const title = searchData?.[1]?.[0];
    if (!title) return null;

    // Step 2: fetch the summary
    const sumRes = await fetch(WIKI_REST + encodeURIComponent(title));
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
    return result;
  } catch {
    return null;
  }
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
      return wiki ? { ...p, wiki } : p;
    })
  );
  return enriched;
}
