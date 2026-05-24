# Travel App v2 - Full App Rundown

Last audited: 2026-05-24

This document is a working map of the app: what each major module owns, when data changes, what happens on tap/back/pan, how the two map providers differ, and which services are doing work in the background.

## 1. High-Level Shape

Travel App v2 is a React 18 + Vite PWA. It has no React Router. Navigation is almost entirely state-driven, with URL query params used for shareable search state.

Boot order:

1. `src/main.jsx`
   - Mounts React.
   - Wraps the app in `QueryClientProvider`.
   - Provider stack: `ThemeProvider -> AuthProvider -> TripProvider -> App`.
   - Loads React Query devtools only in development.

2. `src/App.jsx`
   - Wraps the UI in Google Maps `APIProvider`.
   - Runs `assertKeys()` once to warn about missing env vars.
   - Shows `Header` always.
   - Before a destination is loaded: shows `EmptyStateGlobe`.
   - After coords exist: shows `MapWidget`, `WeatherFloat`, and `PlacesDrawer`.
   - On desktop, weather and places float beside the map.
   - On mobile, weather and places become a bottom bar.

3. `src/hooks/useTrip.jsx`
   - Main orchestration layer.
   - Connects stores, React Query, localStorage restore, URL sync, Firebase sync, weather, events, tabs, viewport mode, nearby mode, and wishlist helpers.

The core mental model:

- `searchStore` owns the current destination/date/search/selected-place state.
- `mapStore` owns map provider, category visibility, map type, transit, viewport mode, and nearby-hotel mode.
- `wishlistStore` owns saved/plan lists and local/cloud mutation hooks.
- React Query owns fetched remote data: tab places, viewport places, nearby places, weather, last-year weather, and events.
- `useTrip` exposes a compatibility facade so older components can still call `useTrip()`.

## 2. Main State Owners

### `src/stores/searchStore.js`

Owns:

- `destination`
- `date`
- `coords`
- `weatherTarget`
- `searchRadiusMeters`
- `placeArea`
- `placeCity`
- `activeTab`
- `loading`
- `error`
- `selectedPlaceId`
- `selectedPlace`

Important actions:

- `setDestination`, `setDate`, `setCoords`, etc.
  - Simple setters.

- `switchTab(tabKey)`
  - Sets `activeTab`.
  - Clears selected place.
  - Saves UI state to `travel-app:ui-state`.
  - Does not directly fetch; `useTabQuery` auto-fetches when the active tab demands data.

- `selectPlace(place, category)`
  - If `place` is null:
    - Clears `selectedPlace` and `selectedPlaceId`.
    - Clears selected hotel in `mapStore`.
    - Persists selected-place null to local UI state.
  - If `place` is present:
    - Optionally switches to `category`.
    - Sets selected place/id.
    - Clears selected hotel.
    - Saves active tab and selected place to local UI state.
    - If category is provided, dispatches `travelapp:focusLocation` so the map pans to the marker.
    - Always dispatches `travelapp:openPlaces` so mobile places overlay opens.

Watch-out:

- `searchStore` directly calls `useMapStore.getState()`. This is convenient but creates cross-store coupling.
- It dispatches global DOM events. Those events are part of the app contract now.

### `src/stores/mapStore.js`

Owns:

- `mapType`: `roadmap`, `satellite`, `terrain`, `hybrid`
- `transitOn`
- `mapProvider`: `google` or `mapbox`
- `visibleCategories`
- `selectedHotelId`
- `nearbyAnchor`
- `viewportTarget`
- `viewportCity`
- cloud preference writer state

Default visible categories:

- `activities`: on
- `restaurants`: on
- `nature`: off
- `gems`: off
- `hotels`: off

That default is important. It reduces Places API calls. It also means hidden categories do not render markers and generally do not fetch unless the drawer tab is active.

Important actions:

- `setMapProvider(provider)`
  - Persists to `localStorage` key `mapProvider`.
  - If signed in and a cloud writer is installed, syncs provider to Firestore prefs.

- `toggleCategory(cat)`
  - Flips a category visibility flag.
  - This affects both marker rendering and query gating.

- `selectHotel(hotel)`
  - Sets `selectedHotelId` and `nearbyAnchor`.
  - This is supposed to enter nearby-hotel mode.

- `exitNearbyMode()`
  - Clears selected hotel, nearby anchor, and viewport target.

- `refreshViewport({ lat, lng, radiusMeters, bounds })`
  - Sets `viewportTarget` unless nearby mode is active.
  - Changing `viewportTarget` enables viewport queries.

- `clearViewportTarget()`
  - Clears viewport target and viewport city.

Watch-out:

- Nearby hotel mode appears mostly wired but not normally reachable. `selectHotel(hotel)` exists, but normal map/list hotel clicks go through `selectPlace`, which clears hotel selection.

### `src/stores/wishlistStore.js`

Owns:

- `wishlist`: local in-memory copy of `travel-app:wishlist`
- `ghostCity`: current destination/viewport city that may not yet have a real list
- Firestore cloud writer hooks
- Sync guard flags

Important actions:

- `beginDestination({ name, destination })`
  - Prunes empty lists not matching the new destination.
  - Sets ghost city.

- `addPlace({ listId, place, category })`
  - Saves a place to a specific list.
  - Emits Firestore item upsert when signed in.

- `addPlaceSmart({ place, category, viewportCity, fallbackListId })`
  - If in viewport mode, creates/uses a list for `viewportCity`.
  - Otherwise falls back to active list.
  - Used by place cards and detail panels.

- `promoteGhost({ mode })`
  - Turns the current ghost city into a real list in either `plan` or `saved` mode.

- `ensureListForMode`, `removePlace`, `selectList`, `renameList`, `deleteList`, `updatePlan`
  - Local mutations plus optional Firestore delta writes.

Watch-out:

- Cloud writes are fire-and-forget. Failures are logged, not surfaced or retried.

## 3. Query/Data Owners

### `src/lib/queryClient.js`

Default React Query settings:

- `staleTime`: 5 minutes
- `gcTime`: 30 minutes
- `retry`: 1
- `refetchOnWindowFocus`: false

Individual hooks override this for cost-sensitive data.

### `src/hooks/queries/useTabQuery.js`

Tabs:

- `activities`
- `restaurants`
- `nature`
- `gems`
- `hotels`

Fetchers:

- `activities` -> `fetchTopActivities`
- `restaurants` -> `fetchTopRestaurants`
- `nature` -> `fetchTopNatureUnique`
- `gems` -> `fetchHiddenGems`
- `hotels` -> `fetchTopHotels`

When it fetches:

- Active drawer tab matches the category, or
- Category is visible on the map, or
- Query already has cached data.

After fetching:

- Non-hotel categories are enriched with Wikipedia in the background.
- The enriched result is written back into the same React Query cache entry.

Staleness:

- `staleTime: Infinity` for tab queries.
- This is a cost-saving choice. Data stays warm for the whole session.

### `src/hooks/queries/useViewportQuery.js`

Purpose:

- Fetches places for a panned/zoomed map area.

When it fetches:

- `viewportTarget` exists.
- Category is visible, active, or already cached.

Data source:

- `fetchPlacesInViewport`.

Staleness:

- `staleTime: Infinity`.

### `src/hooks/queries/useNearbyQuery.js`

Purpose:

- Fetches places near a selected hotel/anchor point.

When it fetches:

- `nearbyAnchor` exists.
- Category is visible, active, or already cached.

Categories:

- activities
- restaurants
- nature
- gems

Hotels are not fetched in nearby mode.

### `src/hooks/queries/useWeather.js`

Uses `weatherTarget` from `searchStore`.

- `useCurrentWeather()`
  - Calls `fetchWeather`.

- `useLastYearWeather()`
  - Calls `fetchLastYearWeather`.

### `src/hooks/queries/useEvents.js`

Uses:

- destination
- date
- coords

Calls `fetchAnnualEvents(destination, date)`.

Staleness:

- 1 hour.

## 4. Main Search Flow

Entry points:

- Header form submit.
- Smart search suggestion select.
- Recent trip click.
- Broad-country suggestion click.
- Marker click may trigger a city search after reverse-geocoding the pin.
- URL auto-search on mount if `?dest=` exists.

Core function:

- `useTrip.search(overrides = {})`

Search steps:

1. Reads latest state from `useSearchStore.getState()`.
2. Validates destination.
3. Applies destination/date overrides.
4. Increments `requestSeq` to guard against stale async responses.
5. If not `silentRefresh`:
   - Clears tab queries.
   - Sets loading.
   - Clears selected place unless `preserveSelection`.
   - Resets active tab to `activities` unless preserving selection.
   - Clears weather target.
   - Clears place display.
   - Clears events query.
   - Clears selected hotel unless preserving selection.
   - Exits nearby mode.
   - Clears viewport target.
   - Clears viewport service cache.
6. Geocodes destination with `geocodeDestination`.
7. Computes search radius from geocode viewport.
8. Sets coords and search radius.
9. Calls `wishlistStore.beginDestination`.
10. Sets `weatherTarget`.
11. Parses formatted address into `placeArea` and `placeCity`.
12. In parallel, fetches:
    - weather
    - activities
13. Saves recent trip unless skipped.
14. Writes phase-1 cache to `travel-app:place-cache`.
15. In the background, fetches:
    - same date last-year weather
    - annual events

What is not fetched immediately:

- Restaurants, nature, gems, and hotels are lazy. They fetch only when demanded by active tab, category toggle, or existing cache.

## 5. URL, Browser Back, and History

There is no route system.

URL behavior:

- On every destination/date change, `useTrip` calls `history.replaceState`.
- It writes `?dest=` and `?date=`.
- Because this uses `replaceState`, normal searches do not create browser history entries.

Browser Back behavior:

- Mobile Places overlay:
  - Pushes `history.pushState({ placesOverlay: true })` when opened.
  - `popstate` closes it.
  - Programmatic close/backdrop/Escape calls `history.back()` during cleanup if the current history state is still `placesOverlay`.
  - Includes an iOS PWA resume guard to ignore spurious popstate.

- Mobile Weather overlay:
  - Pushes `history.pushState({ weatherOverlay: true })`.
  - `popstate` closes it.
  - Programmatic close/backdrop/Escape cleans history with `history.back()`.

- Everything else:
  - Does not use browser history.
  - Browser Back will not close detail panels, wishlist overlay, plan pickers, desktop drawer, desktop weather, map controls, recents menu, auth menu, or hamburger menu.

Potential issue:

- There is no global overlay manager. Multiple overlays manage history independently, so stacked overlay behavior can be incidental.

## 6. Header and Search UI

File:

- `src/components/Header.jsx`

Owns local UI state:

- `recentOpen`
- `recents`
- `searchOpen`
- `authMenuOpen`
- `hamburgerOpen`
- `wishlistOpen`
- `placePickerOpen`

Behaviors:

- Hamburger opens a menu containing theme toggle.
- Smart search input controls destination.
- Date input controls date.
- Plan trip submits `search()`.
- Recent button opens recent trips menu; picking a recent calls `search({ destination, date })`.
- Share button copies/shares current URL, but strips `date`.
- Heart opens global wishlist overlay.
- Auth button signs in or opens account menu.

Mobile behavior:

- After coords exist, search collapses into a compact summary.
- Tapping destination summary opens a popover with `SmartSearchInput`.
- Tapping date summary opens the hidden date input picker.
- Tapping outside the header collapses search.

Dismissal:

- Recents/auth/hamburger/place picker close on outside click.
- Wishlist overlay closes on Escape through Header.

### `src/components/SmartSearchInput.jsx`

Features:

- Controlled input.
- Popular destinations for short/empty queries.
- Recent trips when empty.
- Google Places autocomplete when query length is at least 2.
- 250ms debounce.
- AbortController cancels in-flight autocomplete requests.
- Session token groups autocomplete billing.
- Keyboard:
  - ArrowDown/ArrowUp moves highlight.
  - Enter selects highlighted item.
  - Escape closes dropdown.
  - Tab closes dropdown without trapping focus.

Selection:

- Calls `onSelect(item.value)`.
- Header usually passes `search({ destination: dest })`.

## 7. Places Drawer, Tabs, and Details

### `src/components/PlacesDrawer.jsx`

Desktop:

- Starts collapsed as a Places pill.
- Clicking pill opens drawer.
- Drawer handle toggles closed/open.
- Outside click closes it, except clicks inside detail/plan portal overlays.

Mobile:

- Bottom category bar.
- Tapping a category:
  - Calls `switchTab(tab)`.
  - Opens mobile overlay.
- Mobile overlay can be closed by:
  - backdrop
  - Escape
  - browser Back/swipe back

Also listens for:

- `travelapp:openPlaces`
  - Opens mobile overlay when a marker/list selection wants the user to see place details.

### `src/components/TabbedPlacesWidget.jsx`

Primary responsibilities:

- Renders category tabs.
- Renders active tab place rows.
- Renders place detail panel.
- Renders wishlist workspace tab.
- Bridges place save/remove behavior to wishlist store.
- Resolves active list in Plan/Saved mode.
- Keeps selected row scrolled into view.

Active data priority:

1. Nearby mode data if `nearbyAnchor` exists.
2. Viewport mode data if `viewportTarget` exists.
3. City-wide tab data.

Place row behavior:

- Click row: `selectPlace(a)`.
- Enter/Space on row: `selectPlace(a)`.
- Save button:
  - Stops propagation.
  - Saves or removes through smart wishlist logic.

Detail panel:

- Portaled to `document.body`.
- Opens when `selectedPlace` exists and active tab is not wishlist.
- Close/backdrop calls `selectPlace(null)`.
- Does not use Escape.
- Does not push history.

Detail background work:

- `fetchPlaceDetails(placeId)` for hours, phone, website, reviews, price, photos.
- `fetchWikiSummary(place.name, destination)` if row did not already have wiki data.
- `fetchPlaceDescription(place)` from Gemini if key exists.

Description priority:

1. Gemini description.
2. Wikipedia extract.
3. Google editorial summary.

### Wishlist Tab inside `TabbedPlacesWidget`

This is different from the global wishlist overlay.

Modes:

- `plan`
- `saved`

List behavior:

- `ghostCity` shows an addable city chip if no real list exists.
- Plan mode auto-promotes ghost city into a plan list.
- Saved mode shows a manual "Add city" prompt.
- Chips can select lists.
- Active chip can rename/delete.
- Long-press opens a picker overlay.

Manual add:

- Available only in Saved mode.
- Creates a manual place with `manual-...` id.

## 8. Plan Mode

File:

- `src/components/PlanMode.jsx`

Purpose:

- Edits the active plan list.

Plan structure:

- 1 to 30 days.
- Each day has:
  - hotels
  - morning sessions
  - evening sessions
  - night sessions
- Sessions include start/end time and expense metadata.
- Place snapshots are saved into the plan so itinerary items survive data refresh.

Important helpers:

- `ensurePlan`
- `setDays`
- `removeDayAt`
- `addSession`
- `updateSession`
- `removeSession`
- `setHotelsForDay`
- `setPlaceSnapshot`
- `durationMinutes`
- `formatDuration`

Data sources:

- City tab data through `useTabQuery`.
- Viewport data through `useViewportQuery`.
- Viewport data wins when the map is in viewport mode.

User actions:

- Add day: increases days, selects new day.
- Delete day: confirms, then removes active day.
- Add session: opens place picker modal.
- Add hotel: opens hotel picker modal.
- Pick place: snapshots place, adds session, closes modal.
- Save heart in picker: toggles saved-mode wishlist for same city.
- Edit time/expense: updates plan session.
- Remove session/hotel: updates plan.

Back/Escape:

- Plan picker modals do not push browser history.
- They do not appear to have Escape handling.

## 9. Map System

### Entry Point: `src/components/MapWidget.jsx`

Reads:

- `coords`
- `loading`
- `mapType`
- `mapProvider`
- `visibleCategories`

Chooses renderer:

- If `mapProvider === 'mapbox'` and `MAPBOX_TOKEN` exists: `MapboxMapInner`.
- Otherwise: `GoogleMapInner`.

Important nuance:

- If Mapbox is selected but no token exists, the app renders Google. The provider toggle can still show Mapbox selected because state says Mapbox, but effective renderer is Google.

Remount behavior:

- Map inner key includes provider and rounded coords.
- Switching provider or destination remounts the map.

### Shared Map Data: `src/components/map/useMapData.js`

Used by both providers.

Provides:

- selected place id
- nearby anchor
- viewport target
- tab data
- nearby data
- viewport data
- marker source priority
- marker tap handler
- Search here button handler
- Clear viewport handler
- action disabled state

Marker source priority:

1. Nearby items.
2. Viewport items.
3. City-wide tab data.

Marker tap behavior:

1. Calls `selectPlace(poi, category)`.
2. Reverse-geocodes pin city.
3. Sets `wishlistStore.ghostCity`.
4. Sets `mapStore.viewportCity`.
5. If current destination is not that city, runs:
   - `search({ destination: city, skipRecents: true, preserveSelection: true })`

That means tapping a marker can silently navigate the app to the marker's city while keeping the tapped place selected.

### Map Header: `src/components/map/MapFloatingHeader.jsx`

Controls:

- `Search here`
- `Reset to city view`
- provider toggle
- category visibility buttons
- settings gear

Important:

- Visible `Search here` does not call `useTrip.searchHere`.
- It calls `useMapData.handleSearchHereClick`, which builds a text destination from `placeArea + placeCity` and runs full `search({ destination })`.

### Map Controls: `src/components/MapControlsPanel.jsx`

Controls:

- map type
- transit

Opens/closes through `MapWidget` gear state.

Dismissal:

- A document `pointerdown` listener closes it when clicking outside controls/gear.

### Google Map: `src/components/map/GoogleMapInner.jsx`

Uses:

- `@vis.gl/react-google-maps`
- `Map`
- `AdvancedMarker`
- Google `TransitLayer`
- Google `Circle`

Behaviors:

- Renders up to 7 markers per visible category.
- Pans to city center when center props change, unless nearby mode is active.
- Pans back on `travelapp:panToCity`.
- Runs densest-cluster centering once after markers load, unless nearby/viewport mode is active.
- Listens for `travelapp:focusLocation` and pans to selected marker.
- Draws transit layer when `transitOn`.
- Draws proximity circle around anchor hotel.
- Uses `SearchHereWatcher` on map idle.

Google pan behavior:

- After first idle, when the map settles:
  - Debounces 600ms.
  - Ignores movement under 0.5km.
  - Reverse-geocodes current center into `placeArea/placeCity`.
  - Does not set `viewportTarget`.
  - Does not fetch viewport places automatically.

So on Google, panning mostly updates the label/search target. It does not automatically switch the place list/markers to panned-area results.

### Mapbox Map: `src/components/map/MapboxMapInner.jsx`

Uses:

- `react-map-gl/mapbox`
- Mapbox style URLs
- custom GeoJSON proximity ring

Map type mapping:

- `roadmap` -> streets or dark style depending on theme
- `satellite` -> satellite
- `hybrid` -> satellite-streets
- `terrain` -> outdoors

Behaviors:

- Renders up to 7 markers per visible category.
- Pans to city center when center props change, unless nearby mode is active.
- Pans back on `travelapp:panToCity`.
- Listens for `travelapp:focusLocation`.
- Runs densest-cluster centering once after markers load.
- Draws/updates proximity ring as custom sources/layers.
- Transit toggling is best-effort by hiding/showing layers whose source layer or id looks like transit.
- Reapplies custom layers after style changes.

Mapbox pan behavior:

- On `moveend`, after first move:
  - Skips if nearby mode active.
  - Computes current center and radius from map bounds.
  - Debounces 600ms.
  - If moved at least 0.5km, calls `refreshViewport`.
  - This sets `viewportTarget`.
  - `useViewportQuery` begins fetching panned-area results.
  - Separately reverse-geocodes the center into `placeArea/placeCity`.

So on Mapbox, panning can change the active marker/list data to viewport results.

### Why the Two Maps Feel Different

They share state, markers, tabs, header UI, and selection behavior, but they do not share pan semantics.

Google:

- Pan -> reverse-geocode label only.
- No automatic viewport result refresh.
- Search here -> full text search from current label.

Mapbox:

- Pan -> reverse-geocode label and set viewport target.
- Viewport result queries auto-run.
- Search here -> still full text search from current label, not direct viewport search.

This is the main mismatch.

Additional mismatches:

- Google transit uses a real Google `TransitLayer`; Mapbox transit is style-layer visibility best-effort.
- Google map types are native map types; Mapbox maps them to different style URLs.
- Google marker z-index is provider-native; Mapbox z-index is applied to marker child DOM.
- Mapbox fallback can render Google while provider state still says Mapbox.

Unused path:

- `useTrip.searchHere({ lat, lng, radiusMeters, bounds })` exists and would directly set viewport/weather state, but the visible button does not call it.

Potentially unreachable path:

- `selectHotel(hotel)` exists for nearby mode, but standard hotel marker/list clicks appear to call `selectPlace`, not `selectHotel`.

## 10. Weather and Events

### `src/components/WeatherFloat.jsx`

Desktop:

- Floating weather pill.
- Click opens popover.
- Close button closes.
- No outside-click or Escape handling for desktop popover.

Mobile:

- Weather button in bottom bar.
- Opens portaled overlay.
- Backdrop, close button, Escape, and browser Back close it.

### `src/components/WeatherWidget.jsx`

Shows:

- Current/trip-date weather.
- Same date last year.
- Annual events/festivals around this time of year.

### `src/services/weather.js`

`fetchWeather({ lat, lng, dateISO })`:

- If date is in the past:
  - Uses Open-Meteo historical average.
- If date is within 5 days:
  - Tries OpenWeather forecast.
  - Falls back to Open-Meteo climate average on failure.
- If date is further out:
  - Uses Open-Meteo 5-year historical average.

`fetchLastYearWeather({ lat, lng, dateISO })`:

- Uses Open-Meteo archive for same date one year ago.

### `src/services/events.js`

`fetchAnnualEvents(destination, dateISO)`:

- Derives month name from trip date.
- Looks up likely Wikipedia titles:
  - `Festivals in destination`
  - `Tourism in destination`
  - `Culture of destination`
  - `destination`
- Scans extracts for sentences mentioning that month.
- Returns up to 4 events.

## 11. Services and Backend

### `src/services/config.js`

Reads browser-exposed Vite env vars:

- `VITE_GOOGLE_MAPS_KEY`
- `VITE_GOOGLE_MAPS_MAP_ID`
- `VITE_OPENWEATHER_KEY`
- `VITE_GEMINI_KEY`
- `VITE_MAPBOX_TOKEN`

Also used indirectly:

- Firebase `VITE_FIREBASE_*` vars in `firebase.js`.

Important:

- These keys are client-exposed. That is normal for some browser SDK keys when locked down by referrer/API restrictions, but Gemini and Places REST usage would be safer behind a backend proxy with auth, quotas, and abuse protection.

### `src/services/googleMaps.js`

Responsibilities:

- Geocoding destination text.
- Reverse geocoding current map center.
- Places Text Search for tabs.
- Places Text Search for viewport/nearby modes.
- Place Details.
- Place Autocomplete.
- Directions URL.

Key functions:

- `geocodeDestination(destination)`
  - Uses Google Geocoding API.
  - Returns lat/lng, formatted address, place id, types, broad-region flags, viewport bounds.

- `reverseGeocodeCity({ lat, lng })`
  - Uses Geocoding API with locality/admin-level result types.
  - Cached in memory with coordinate buckets.

- `reverseGeocodePlaceName({ lat, lng })`
  - Prefers neighborhood/sublocality/locality names.
  - Cached in memory with coordinate buckets.

- `fetchTopActivities`, `fetchTopRestaurants`, `fetchTopNatureUnique`, `fetchHiddenGems`, `fetchTopHotels`
  - Use Places Text Search.
  - Rank by rating and review count.
  - Filter category-specific noise.

- `fetchPlaceDetails(placeId)`
  - Fetches hours, phone, website, reviews, price, editorial summary, extra photos.
  - Uses in-memory cache and in-flight dedupe.

- `fetchPlacesInViewport({ lat, lng, radiusMeters, category, bounds })`
  - Uses Places Text Search with either bounds restriction or circle bias.
  - Uses viewport cache with 10-minute TTL and in-flight dedupe.

- `fetchPlacesNearPoint`
  - Wrapper over viewport fetch with a 2km-ish radius.

- `clearViewportCache`
  - Clears viewport cache and in-flight registry.

- `newSessionToken`, `fetchPlacePredictions`
  - Autocomplete session token and prediction fetch.

### `src/services/wikipedia.js`

Responsibilities:

- Search Wikipedia for a title.
- Fetch REST summary.
- Cache summaries in memory.
- Enrich place arrays in the background.

### `src/services/gemini.js`

Responsibilities:

- Generate 100-150 word travel-guide descriptions for places.
- Uses `gemini-2.5-flash-lite`.
- Caches descriptions in memory for 30 minutes.

Watch-out:

- Direct browser calls expose the Gemini key.

### Firebase Services

Files:

- `src/services/firebase.js`
- `src/services/firestoreSchema.js`
- `src/services/wishlistSync.js`
- `src/services/recentTripsSync.js`
- `src/services/userPrefsSync.js`
- `src/services/userMigration.js`
- `src/hooks/useAuth.jsx`

Auth:

- `getAuth()` initializes Firebase Auth.
- Uses `browserLocalPersistence`.
- `useAuth`:
  - resolves redirect result
  - subscribes to `onAuthStateChanged`
  - exposes `user`, `authReady`, `signIn`, `signOut`
  - mobile uses redirect
  - desktop uses popup

Firestore schema v4:

- `users/{uid}`
  - parent doc with prefs and active list id
- `users/{uid}/savedLists/{listId}`
- `users/{uid}/savedLists/{listId}/items/{placeId}`
- `users/{uid}/planLists/{listId}`
- `users/{uid}/planLists/{listId}/items/{placeId}`
- `users/{uid}/recentTrips/{tripId}`

Sign-in sync flow in `useTrip`:

1. Run `migrateLegacyUserDoc(uid)`.
2. Load:
   - all wishlist lists/items
   - all recent trips
   - user prefs
3. If cloud has wishlist/trips:
   - cloud becomes source of truth
   - local wishlist/recent trips are replaced under sync guards
4. Hydrate map provider preference if present.
5. Install cloud writers into stores/utils.
6. If cloud was empty:
   - seed cloud from local wishlist/recent trips.

Firestore rules:

- Owner-only access under `users/{uid}`.
- Denies all other documents.

Backend gaps:

- No app server/proxy.
- No realtime Firestore listeners.
- No Firestore offline persistence.
- No durable retry queue for failed writes.
- No server-side validation beyond Firestore ownership rules.
- Security rules do not validate document shape/field constraints.

## 12. Local Persistence

localStorage keys:

- `travel-app:wishlist`
  - Main local saved/plan list state.

- `travel-app:recent`
  - Last 5 recent trips.

- `travel-app:place-cache`
  - Cached phase-1 search payloads.
  - TTL: 24 hours.
  - Max: 5 entries.
  - Stores coords, activities, and weather.

- `travel-app:ui-state`
  - Active tab and selected place id.

- `travel-app:theme`
  - Theme preference, from `useTheme`.

- `mapProvider`
  - Google or Mapbox provider preference.

Session/in-memory caches:

- React Query cache.
- Google reverse geocode cache.
- Google viewport cache.
- Google place details cache.
- Wikipedia cache.
- Gemini description cache.

PWA runtime caches in `vite.config.js`:

- Google geocoding
- OpenWeather
- Open-Meteo
- Wikipedia

## 13. User Flows

### First Launch / Empty State

1. App mounts.
2. `searchStore` reads initial destination/date from URL.
3. If no coords and no error:
   - `EmptyStateGlobe` renders.
4. Globe shows wishlist/plan points if local wishlist has places.
5. Clicking a globe pin sets destination and searches that destination.

### Search a Destination

1. User types into Smart Search.
2. Autocomplete or popular/recent suggestions may appear.
3. User selects suggestion or clicks Plan trip.
4. `useTrip.search` runs.
5. URL updates by `replaceState`.
6. Geocode sets coords.
7. Map appears.
8. Activities and weather fetch first.
9. Recent trip is saved.
10. Last-year weather and annual events fetch in background.
11. Other tabs fetch lazily.

### Switch Tabs

1. User taps/clicks category tab.
2. `switchTab(tab)` updates active tab and clears selected place.
3. `useTabQuery(tab)` becomes demanded.
4. If not cached, fetch starts.
5. Result renders in drawer/list.
6. If map category is off, list still fetches because active tab demands it.

### Tap a Place Row

1. Row click calls `selectPlace(place)`.
2. Selected place/id update.
3. Detail panel opens.
4. Detail panel fetches place details, wiki fallback, and Gemini description.
5. Map does not pan unless a category was passed to `selectPlace`.

### Tap a Map Marker

1. Marker click calls `onPinTap(poi, category)`.
2. `selectPlace(poi, category)`:
   - switches tab
   - selects place
   - dispatches `travelapp:focusLocation`
   - dispatches `travelapp:openPlaces`
3. Map pans to marker.
4. Mobile places overlay opens.
5. App reverse-geocodes marker city.
6. Ghost city and viewport city update.
7. If marker city differs from current destination:
   - app runs city search with `skipRecents` and `preserveSelection`.

### Save a Place

1. User taps Save on row/detail/picker.
2. Event propagation is stopped when needed.
3. `addPlaceSmart` decides target list:
   - viewport city list if in viewport mode
   - otherwise active/fallback list
4. If needed, destination-mode list is created.
5. localStorage wishlist updates.
6. Zustand wishlist state updates.
7. If signed in, Firestore writer upserts list/item.

### Remove a Saved Place

1. User taps Saved/remove.
2. Wishlist localStorage updates.
3. Zustand wishlist state updates.
4. If signed in, Firestore item delete runs.

### Plan a Trip

1. Open wishlist tab.
2. Switch to Plan mode.
3. If current ghost city has no plan, app auto-creates one.
4. Add/remove days as needed.
5. Open session picker for morning/evening/night.
6. Pick a place.
7. App snapshots place and adds session.
8. Edit times/expense directly in the plan.
9. Plan mutations update wishlist store and Firestore if signed in.

### Pan the Map

Google:

1. User pans.
2. On idle, app reverse-geocodes center after debounce/min-distance guard.
3. `placeArea/placeCity` update.
4. Header/search summary reflects new center.
5. Markers/list do not automatically switch to viewport results.

Mapbox:

1. User pans.
2. On moveend, app computes center/radius from bounds.
3. After debounce/min-distance guard, `viewportTarget` updates.
4. `useViewportQuery` fetches panned-area places for demanded categories.
5. Markers/list use viewport results.
6. App also reverse-geocodes center into `placeArea/placeCity`.

### Search Here

Current visible behavior:

1. User clicks `Search here`.
2. App builds text from `placeArea + placeCity`; fallback is current destination.
3. Runs full `search({ destination: override })`.
4. This is a normal destination search, not direct viewport search.

Unused intended-looking behavior:

- `useTrip.searchHere({ lat, lng, radiusMeters, bounds })` would set weather target and viewport target directly, but is not wired to the visible button.

### Reset to City View

1. User clicks `Reset to city view`.
2. `clearViewportItems` clears viewport target/city.
3. Dispatches `travelapp:panToCity`.
4. Both providers pan back to search coords.
5. Results fall back to city-wide tab data.

### Mobile Back / Swipe Back

Places overlay:

1. Opening overlay pushes a history entry.
2. Browser Back or swipe back fires `popstate`.
3. Overlay closes.

Weather overlay:

1. Opening overlay pushes a history entry.
2. Browser Back or swipe back fires `popstate`.
3. Overlay closes.

Other overlays:

- Browser Back is not handled.

## 14. Things That Are Easy To Miss

- The app is route-less. Do not look for routes to understand navigation.
- URL search state is updated with `replaceState`, not `pushState`.
- Back/swipe-back behavior is overlay-specific, not global.
- Category toggles affect API fetching, not just visibility.
- Activities and weather are the only first-phase search fetches.
- Wikipedia enrichment mutates React Query cache after initial tab results render.
- Marker taps can trigger a new city search.
- `Search here` is not the same as `useTrip.searchHere`.
- Google and Mapbox do not treat panning the same way.
- Hotel nearby mode is present in state/query/rendering code but may not have a normal entry interaction.
- Firestore sync is load-on-sign-in plus per-mutation writes, not realtime.
- Firestore Auth persists, but Firestore data does not have IndexedDB offline persistence enabled.
- Existing Playwright tests may be out of sync with current category defaults. For example, the current app defaults only activities/restaurants on, while older test text expects all category toggles on.
- Several source files contain mojibake strings like `âœ•` and `â€¦`. If these appear in the UI, the file encoding/text should be cleaned up.

## 15. Recommended Future Instruction Pointers

When giving future instructions, the most useful target areas are:

- Search/data orchestration:
  - `src/hooks/useTrip.jsx`
  - `src/stores/searchStore.js`
  - `src/hooks/queries/*`

- Map behavior:
  - `src/components/MapWidget.jsx`
  - `src/components/map/useMapData.js`
  - `src/components/map/GoogleMapInner.jsx`
  - `src/components/map/MapboxMapInner.jsx`
  - `src/stores/mapStore.js`

- Place drawer/detail behavior:
  - `src/components/PlacesDrawer.jsx`
  - `src/components/TabbedPlacesWidget.jsx`

- Wishlist/plan behavior:
  - `src/stores/wishlistStore.js`
  - `src/utils/wishlist.js`
  - `src/components/PlanMode.jsx`
  - `src/utils/plan.js`

- Backend/sync:
  - `src/hooks/useAuth.jsx`
  - `src/services/firebase.js`
  - `src/services/firestoreSchema.js`
  - `src/services/wishlistSync.js`
  - `src/services/recentTripsSync.js`
  - `src/services/userPrefsSync.js`
  - `src/services/userMigration.js`
  - `firestore.rules`

- API/cost behavior:
  - `src/services/googleMaps.js`
  - `docs/milestones/places-api-cost-cut.md`
  - `src/hooks/queries/useTabQuery.js`
  - `src/hooks/queries/useViewportQuery.js`
  - `src/hooks/queries/useNearbyQuery.js`

## 16. Biggest Fix Candidates

These are not required to understand the app, but they are the clearest future cleanup targets.

1. Unify map panning semantics.
   - Decide whether pan should only update the label or should update viewport results.
   - Apply the same behavior to Google and Mapbox.

2. Wire or remove `useTrip.searchHere`.
   - If direct viewport search is desired, connect the visible Search here button to this path.
   - If full destination search is desired, rename/clarify behavior.

3. Make hotel nearby mode reachable or remove it.
   - Hotel marker/list click could call `selectHotel(hotel)` instead of generic `selectPlace`.

4. Add a global overlay/back manager.
   - This would make browser Back, Escape, stacked overlays, and mobile gestures predictable.

5. Improve sync durability.
   - Firestore offline persistence.
   - Realtime listeners if cross-device live sync is desired.
   - Retry/surfaced errors for failed writes.
   - Safer conflict behavior for deletes.

6. Move sensitive API calls behind a backend.
   - Gemini is the clearest candidate.
   - Places REST could also benefit from quota/rate controls.

7. Refresh tests against current behavior.
   - Especially category default visibility, viewport behavior, nearby hotel mode, and provider differences.

