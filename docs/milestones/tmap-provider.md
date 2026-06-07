# Milestone: Tmap provider (pure-Mapbox map)

**Rollback tag:** `pre-tmap-provider` (HEAD before this milestone = `5d6fe60`)
**Date:** 2026-05-25
**Trigger:** Add a third map provider whose POI data, names, and pins come entirely from Mapbox — zero Google services — switchable at will alongside the existing Google and Mapbox renderers.

## What shipped

### Tmap provider (headline)
- **3-way provider toggle**: Google | Mapbox | **Tmap**. `mapStore` `VALID_PROVIDERS` += `tmap`; third button in `MapFloatingHeader`; `MapWidget` dispatches `tmap → TmapMapInner` (falls back to Google if no Mapbox token).
- **`src/services/tmapService.js`** — Mapbox Search Box **category** endpoint for the 5 tabs + viewport + nearby. Outputs the same place-object shape as `googleMaps.shapePlace` (rating/reviewCount/photoUrl null — Mapbox has none). Own persisted viewport cache.
- **`src/services/placesProvider.js`** — routing layer. Query hooks + `useTrip.search()` call this; routes `tmap → tmapService`, else `googleMaps`. `geocodeDestination` on Tmap is pure Mapbox (no Google fallback). Exports `activeDataSource()`.
- **Data-source-tagged query caches** — `tab`/`nearby`/`viewport` query keys carry `g` (google/mapbox) vs `mb` (tmap), so Google↔Mapbox toggle stays free (shared cache) and Tmap is isolated. Switching to Tmap auto-fetches Mapbox data.
- **`src/components/map/TmapMapInner.jsx`** — sibling of MapboxMapInner; pan reverse-geocode uses Mapbox directly (no Google fallback). Shared `mapboxShared.jsx` (`POIMarker` + `mapboxStyleFor`) de-duped from MapboxMapInner.
- **Detail-card Google gating** — `PlaceDetail` skips Google Place Details + Gemini on Tmap (placeIds are Mapbox ids). Tmap cards show name/address/Wikipedia only. Images: Wikipedia thumbnails only (Foursquare attempt reverted — photos are premium/paid on FSQ's new API).

### Fixes bundled this session
- **Pin tap = detail-only, all renderers** — `onPinTap` no longer fires a full city `search()` (which re-centered coords → remounted the whole map on every tap). Now `selectPlace(poi, category, { pan:false })`. New `pan` option on `searchStore.selectPlace`.
- **"Save to <city>" stale fix** — `search()` now clears `viewportCity`; `saveListName` falls back to the searched city (`ghostCity`).
- **PWA deploy staleness** — `firebase.json` cache headers: `/assets/**` immutable, `index.html`/`sw.js`/`registerSW.js`/`manifest` `no-cache`. New deploys go live on next load instead of serving the old cached bundle.
- **Plan session time fields** — dropped the native time-picker caret (`appearance:none`) and trimmed width; `HH:MM` readable on one line on mobile.
- **Destination autocomplete = cities/regions only** — Mapbox `types` dropped `address,poi`; Google `includedPrimaryTypes:['(regions)']`. Typing a city surfaces the city, not nearby businesses named after it.

### Folded-in (prior, previously deployed but uncommitted)
- **`src/utils/persistentCache.js`** + localStorage persistence for viewport/details/wiki/reverse-geocode caches; all-tabs `placeCache`; `silentRefresh` staleTime — round-2 of the Places API cost cut.

## Verify next
- Tmap tabs populate (empty tab = bad Mapbox canonical category id in `tmapService.CATEGORY_CANONICAL`).
- Mobile sign-in (`signInWithRedirect`) storage-partition error is a separate, untouched known issue.
