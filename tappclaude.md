# Travel APP v2 — Claude Reference

## What It Is
One-stop travel planner: weather + interactive map + places discovery + wishlist. React 18 + Vite PWA. No backend — all client-side.

## Tech Stack
- **UI**: React 18.3, Vite 5.4, Vite PWA plugin
- **Maps/Places**: `@vis.gl/react-google-maps`, Google Places API (New), Google Geocoding
- **Weather**: OpenWeather (≤5 days forecast) + Open-Meteo archive (historical/climate, free, no key)
- **Enrichment**: Wikipedia REST API (summaries, events — free, no key)
- **State**: React Context + localStorage + refs for race-condition guards
- **Styling**: CSS variables, light/dark theme, responsive at 1024px breakpoint

## API Keys (env vars)
| Var | Service | Required |
|-----|---------|---------|
| `VITE_GOOGLE_MAPS_KEY` | Google Maps + Places | Yes |
| `VITE_OPENWEATHER_KEY` | OpenWeather forecast | Yes |
Open-Meteo + Wikipedia: free, no key. Keys baked into client JS (rely on referrer restrictions).

## File Map

### Entry
- `index.html` — HTML shell, PWA meta
- `main.jsx` — ThemeProvider → TripProvider → App mount
- `App.jsx` — APIProvider wrapper, ErrorBanner, BroadSearchHint (hardcoded city suggestions for 14 countries)

### Core State (`src/hooks/`)
- **`useTrip.jsx`** (713 lines) — TripContext; entire app state lives here
  - `search()`: geocode → parallel Phase1 (weather + activities + POIs) → background Phase2 (last-year weather + events + wiki)
  - `fetchTabIfNeeded()`: lazy-load tab data on first click
  - `selectHotel()`: enters nearby-mode (2km radius), fetches hotel-centric places
  - `refreshViewport()`: debounced map idle → fetch places in panned viewport (10min cache)
  - Race guards: `requestSeq`, `tabRequestSeq`, `nearbyRequestSeq`, `viewportRequestSeq` refs
  - URL sync: `history.replaceState` keeps dest + date in query params (shareable links)
- **`useTheme.jsx`** — dark/light, persists to `travel-app:theme`, reads system pref on init
- **`useIsDesktop.js`** — `window.matchMedia(1024px)` breakpoint hook

### Services (`src/services/`)
- **`googleMaps.js`** (577 lines) — all Google API calls
  - `geocodeDestination()` — lat/lng + `isCountry`/`isAdminRegion` flags
  - `fetchTopPOIs/Activities/Restaurants/NatureUnique/HiddenGems/Hotels()` — each calls `fetchAndRank()` with filters (minRating, minReviews)
  - `fetchPlacesInViewport()` — cache (10min TTL, quantized bucket key) + in-flight dedup Map
  - `fetchPlacePredictions()` — autocomplete with AbortController + session tokens
  - `estimateCost()`, `estimateDuration()` — heuristics from place types
  - `shapePlace()` — normalizes raw API response to app shape
- **`weather.js`** (267 lines) — smart hybrid: OpenWeather if ≤5 days, Open-Meteo archive otherwise
  - `fetchLastYearWeather()` — same date -1 year via archive
  - `fetchHistoricalAverage()` — 5yr average for date
- **`events.js`** (81 lines) — Wikipedia search for "Festivals in X", extracts month-matching sentences → 4 events max
- **`wikipedia.js`** (75 lines) — `enrichWithWiki()` parallel-enriches places array, adds `.wiki` prop
- **`config.js`** — env var loading + `assertKeys()` warning

### Utils (`src/utils/`)
- **`geo.js`** — `haversineKm()`, `withinRadius()`
- **`recentTrips.js`** — localStorage `travel-app:recent`, max 5, deduped
- **`wishlist.js`** (193 lines) — localStorage `travel-app:wishlist`, v2 multi-list schema `{ version:2, activeListId, lists:[] }`, migrates old v1 format

### Components (`src/components/`)
- **`Header.jsx`** — sticky search + date picker + recents dropdown + share (copies URL) + theme toggle + toast
- **`SmartSearchInput.jsx`** (292 lines) — ARIA combobox, debounced 250ms, AbortController, keyboard nav (↑↓ Enter Esc Tab), session token rotation
- **`MapWidget.jsx`** (414 lines) — map + all overlays
  - POI markers (numbered, dimmed outside 2km hotel ring)
  - Hotel markers (teal, teal-green when selected)
  - ProximityRing (2km circle around selected hotel)
  - ViewportWatcher — debounced 600ms idle, skips <0.5km moves + nearby-mode
  - NearbyModeIndicator + ViewportRefreshIndicator floating pills
  - FocusListener — listens for custom `travelapp:focusLocation` window event
- **`MapControlsPanel.jsx`** — gear toggle: map type (4 options) + Transit + Hotels layer toggles
- **`HotelInfoCard.jsx`** — floating card when hotel selected; shows proximity stats (X attractions within 2km) using `withinRadius()`
- **`WeatherWidget.jsx`** — 3 sections: trip date forecast, last year same date, annual events
- **`WeatherFloat.jsx`** (105 lines) — desktop: expandable pill popover; mobile: collapsible card
- **`PlacesDrawer.jsx`** — desktop: slide-out drawer; mobile: collapsible card; wraps TabbedPlacesWidget
- **`TabbedPlacesWidget.jsx`** (444 lines) — 4 tabs (Activities, Restaurants, Nature, Hidden Gems) + Wishlist tab; lazy-load per tab; PlaceRow → click → PlaceDetail
- **`WishlistPanel.jsx`** — `SavedPlaceCard` component (photo + tags + remove + directions)
- **`Card.jsx`** — generic expandable card wrapper with overlay + Esc key close
- **`ErrorBoundary.jsx`** — class component, detects Google API billing/referrer errors, shows actionable hints
- **`ActivitiesWidget.jsx`** — legacy component (superseded by TabbedPlacesWidget, still in repo)

## Data Flow
```
Search submit
  → geocode + Phase1 parallel (weather + activities + POIs)
  → render with initial data
  → Phase2 background (last-year weather + events + wiki enrichment)
  → state updates, UI enriches

Map pan/zoom idle (debounced 600ms, >0.5km moved)
  → fetchPlacesInViewport (cached 10min)
  → viewportItems replaces tab list

Hotel click
  → nearby-mode: fetch 4 categories within 2km
  → ProximityRing drawn, POIs outside ring dimmed

Save place
  → addPlaceToWishlist → localStorage → setWishlist
```

## Key Patterns
- **Race guards**: seq refs incremented per search; stale responses check seq before setting state
- **Lazy tabs**: `null` = not loaded, `[]` = loaded empty; only fetches on first tab click
- **Viewport cache**: quantized bucket key (≈1.1km precision) + 10min TTL + in-flight dedup Map
- **Custom event bus**: `window.dispatchEvent(new CustomEvent('travelapp:focusLocation', ...))` for map focus from sidebar
- **Memoized map markers**: custom equality fn prevents re-render on unrelated state changes

## Known Issues / Cautions
1. API keys in client JS — no backend proxy, relies on referrer restrictions
2. BroadSearchHint has hardcoded city lists for 14 countries — code change required to add more
3. Hotel proximity ring hardcoded to 2km — no user control
4. No TypeScript — pure JS, no prop types
5. Offline PWA caches assets only — API calls not cached for offline replay
6. `ActivitiesWidget.jsx` is dead code (superseded)

## localStorage Keys
| Key | Contents |
|-----|---------|
| `travel-app:theme` | `"light"` \| `"dark"` |
| `travel-app:recent` | Array of `{ destination, date }`, max 5 |
| `travel-app:wishlist` | `{ version: 2, activeListId, lists: [...] }` |
