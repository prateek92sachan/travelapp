# Travel App v2 - Compact Project Map

React 18 + Vite PWA for destination planning: search a place/date, explore map-based recommendations, check weather/events, save places, and build an itinerary. UI is Airbnb-like: Inter, restrained white/dark surfaces, accent tint `#ff385c`, Lucide icons, responsive map-first layout.

## App Flow
`src/main.jsx` mounts `ThemeProvider -> AuthProvider -> TripProvider -> App`. `src/App.jsx` wraps Google Maps `APIProvider`, shows `Header`, then either `EmptyStateGlobe` or the active trip workspace: `MapWidget`, floating `WeatherFloat`, and `PlacesDrawer`/mobile bottom bar. `ErrorBoundary` protects major panes.

## Core State
`src/hooks/useTrip.jsx` is the main brain: destination/date, coords, weather, annual events, tabs, selected place, wishlist, map layers, hotel-nearby mode, viewport search, cache restore, URL sync, recent trips, and Firebase cloud sync. It guards stale async requests with sequence refs.

## Main Features
- Smart search: `SmartSearchInput` shows popular cities, Google Places Autocomplete, keyboard nav, recent trips, and shareable `?dest=&date=` URLs.
- Destination geocoding: `googleMaps.geocodeDestination`; broad country/state searches show city suggestions.
- Discovery tabs: Activities, Restaurants, Nature, Hidden gems, Hotels. Activities/weather load first; other tabs load lazily/background.
- Map: Google Map with category-colored markers, selected-place focus events, densest-cluster centering, category toggles, map type buttons, transit layer, and "Search here" viewport refresh.
- Hotels: hotels are a tab/layer; selecting one enters 2km nearby mode for activities/restaurants/nature/gems, with proximity ring and exit pill.
- Place details: detail panel fetches Google Place Details for hours, phone, website, reviews, price, photos; Gemini can generate prose descriptions; Wikipedia summaries enrich place rows.
- Weather: OpenWeather 5-day forecast when possible; Open-Meteo historical/climate fallback for past/future dates; last-year comparison; Wikipedia-sourced annual events.
- Wishlist: localStorage v2 multi-list model; save/unsave places, rename/select/delete lists, manual add, destination-aware list creation, viewport city smart saving.
- Plan Mode: itinerary stored inside each wishlist list; 1-30 days; hotels per day max 2; morning/evening/night sessions with start/end/expense; place picker and hotel picker reuse live tab data.
- Auth/sync: optional Google sign-in via Firebase Auth; Firestore stores each user's wishlist + recent trips under `users/{uid}`.
- Persistence: URL params, `travel-app:recent`, `travel-app:wishlist`, `travel-app:ui-state`, `travel-app:theme`, and short-lived place cache restore reloads quickly.
- Empty/visual state: lazy 3D globe from `react-globe.gl` using `public/world-countries.geojson`.
- PWA: `vite-plugin-pwa`, auto-update service worker, icons, Firebase Hosting SPA rewrite, runtime caches for geocoding/weather/Open-Meteo/Wikipedia.

## Key Files
- `src/components/Header.jsx`: brand, menu, theme, search/date, recents, share, wishlist overlay, auth menu.
- `src/components/MapWidget.jsx`: map rendering, markers, viewport/nearby behavior, map action header.
- `src/components/MapControlsPanel.jsx`: map/satellite/terrain/hybrid + transit controls.
- `src/components/PlacesDrawer.jsx`: desktop/mobile shell for tabs and place details.
- `src/components/TabbedPlacesWidget.jsx`: tab list, place rows, detail panel, wishlist workspace.
- `src/components/PlanMode.jsx`: day/session/hotel itinerary builder.
- `src/components/WeatherWidget.jsx` + `WeatherFloat.jsx`: compact and expanded weather/events UI.
- `src/components/WishlistOverlay.jsx` + `WishlistPanel.jsx`: global saved-place overlay/cards.
- `src/services/googleMaps.js`: Geocoding, Places Text Search, Place Details, Autocomplete, viewport cache/dedupe.
- `src/services/weather.js`: OpenWeather forecast + Open-Meteo history/climate.
- `src/services/firebase.js`: Firebase app/auth/firestore wrappers.
- `src/services/gemini.js`: Gemini place descriptions (`gemini-2.5-flash-lite` endpoint).
- `src/services/events.js`, `wikipedia.js`: annual events + wiki summaries.
- `src/utils/wishlist.js`, `plan.js`, `recentTrips.js`, `placeCache.js`, `uiState.js`, `geo.js`: local persistence and helpers.
- `src/styles/global.css`: all layout/theme/responsive styling, no CSS framework.

## Config / Data / Tests
- Env: `.env.example` expects `VITE_GOOGLE_MAPS_KEY`, `VITE_GOOGLE_MAPS_MAP_ID`, `VITE_OPENWEATHER_KEY`, `VITE_GEMINI_KEY`; Firebase env vars are read when present.
- Firebase: `firebase.json` hosts `dist/` and deploys `firestore.rules`; rules allow only authenticated users to read/write their own `users/{uid}` doc.
- Public assets: `pwa-192.png`, `pwa-512.png`, `favicon.svg`, `world-countries.geojson`.
- Tests: `tests/feature.spec.js` Playwright E2E covers shell, search/autocomplete, map, tabs, details, viewport search, hotels/nearby mode, wishlist, weather, recents/share, theme, persistence, and errors. Config assumes dev server at `http://localhost:5174`.
