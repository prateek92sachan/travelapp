# Milestone: Places API cost cut

**Rollback tag:** `pre-places-cost-cut` (HEAD = `ba0a0ac`)
**Started:** 2026-05-23
**Trigger:** Daily Google Places (New) usage hitting ₹50–₹150/day in May 2026. Bursts on May 18 (₹153), May 20 (₹146), May 21 (₹71).

## Cost map (current)

| Driver | Path | Per-event cost | Frequency |
|---|---|---|---|
| 5 category Text Search calls per search | `useTrip.search` → 5× `fetchTop*` | ~₹16–20 | Every destination search |
| 5 category Text Search calls per viewport idle | `MapWidget.ViewportWatcher` → `useViewportQuery` × 5 | ~₹16 (cache miss) | Every >0.5km map pan |
| SearchHereWatcher: 2 calls per map idle | `MapWidget.SearchHereWatcher` (lines 553–609) | ~₹3 | Every idle, no debounce |
| `fetchProminentNearbyCity` uses Text Search for city name | `googleMaps.js:132` | ~₹2.65 vs ~₹0.40 (geocode) | Every SearchHereWatcher + search |
| Initial search fires 2 extra helpers | `useTrip.search` lines 336–340 | ~₹3 | Every search |
| Place Details cache in-memory only | `googleMaps.js:513` | ~₹4–5 per open | Per detail open |

Pricing reference (Places API New, 2024–2025):
- Text Search Enterprise (incl. rating/userRatingCount): ~$40/1000 ≈ ₹3.32
- Geocoding API: ~$5/1000 ≈ ₹0.42
- Place Details Enterprise+Atmosphere: ~$50/1000 ≈ ₹4.15
- Place Photos: ~$7/1000 ≈ ₹0.58 per `<img>` load

## Plan

### Phase A — helpers (low-risk, no UX regression)

- [x] Fix 2: replace `fetchProminentNearbyCity` with `reverseGeocodeCity` in SearchHereWatcher + useTrip viewport effect. Tradeoff: loses "prominent metro" fallback (e.g. suburb of KL → "Kuala Lumpur"); accepts plain locality. Saves ~₹2.50 per call site.
- [x] Fix 9: drop initial `reverseGeocodePlaceName` + `fetchProminentNearbyCity` in `useTrip.search`; parse `geo.formattedAddress` for area/city chip. Saves ~₹3 per search.

### Phase B — watcher + cache (medium-risk)

- [x] Fix 1: debounce `SearchHereWatcher` (600ms + 0.5km min-move guard, mirror `ViewportWatcher`). Currently fires on every idle event including micro-settles.
- [x] Fix 5: quantized-coord LRU cache + TTL for reverse-geocode helpers (`reverseGeocodeCity`, `reverseGeocodePlaceName`). Same coords within session = single API call. Bucket ≈110m, TTL 30min, max 200 entries.

### Phase C — lazy tabs (higher-risk, UX change)

- [x] Fix 3: tab/viewport/nearby queries now gated on `visibleCategories[cat]` (moved from MapWidget local state to `mapStore`) OR `activeTab === cat` OR already-cached. Default visibility: `activities + restaurants` ON, others OFF. User opts in via the map controls panel.
  - Initial search cost: 2 Places Text Search calls instead of 5 (~60% savings).
  - Viewport pan cost: 2 calls instead of 5.
  - `staleTime: Infinity` on all three query hooks so a fetched tab/viewport/nearby stays warm for the session.
  - Phase 2 background tab prefetch removed from `useTrip.search()`. Only events + last-year weather still prefetch.
  - Map markers regression: nature/gems/hotels markers no longer appear until user toggles category ON. Acceptable per design call.

## Out of scope (logged for later)

- Persist `VIEWPORT_CACHE` + `PLACE_DETAILS_CACHE` to sessionStorage (survives reload).
- Daily GCP budget alert + per-API quota cap.
- Field-mask reduction: blocked — rating/userRatingCount are needed for ranking, can't drop.

## Verification

After each phase:
1. Search "Tokyo" → confirm area/city chip still resolves.
2. Pan map → confirm SearchHere pill still updates with current area.
3. Open place details → confirm photo/hours/reviews still load.
4. Tab switching: latency before/after Phase C.
5. Check Google Cloud billing 24h after deploy.
