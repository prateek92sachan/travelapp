# Travel APP v2

A single-page travel planner. Search a destination → land on a map → browse categorized points of interest (Activities / Restaurants / Nature / Hidden gems / Hotels) sourced live from a maps provider. Save places to per-city wishlists, build day-by-day itineraries, sign in to sync to Firestore, and track API spend on `/dashboard`.

Three swappable map providers: **Google**, **Mapbox**, **Tmap** (Mapbox renderer + Mapbox data, zero Google calls).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # → dist/ (+ PWA service worker)
npm run preview
```

> **No test runner.** `npm run lint` is a stub. The only build gate is `npm run build` — verify changes with a build + manual smoke test.

## Environment

Frontend keys ship in the bundle (public by design — restrict them in their consoles). Read in `src/services/config.js`, validated at boot by `assertKeys()`.

```
VITE_GOOGLE_MAPS_KEY=AIza...      # Maps JS, Places API (New), Geocoding
VITE_OPENWEATHER_KEY=...          # weather forecast
VITE_MAPBOX_TOKEN=...             # Mapbox renderer + Tmap data (optional; Tmap falls back to Google if absent)
```

## Stack

React 18 · Vite 5 · Zustand 5 (client state) · TanStack Query 5 (server cache) · Firebase 12 (auth + Firestore) · `@vis.gl/react-google-maps` · `mapbox-gl` / `react-map-gl` · `react-globe.gl` · `sonner` · Lucide · `vite-plugin-pwa`. Pure CSS with theme tokens (`src/styles/global.css`).

## Architecture in one breath

Components read from **Zustand stores** (`src/stores/` — search, map, wishlist) and **TanStack Query hooks** (`src/hooks/queries/`) directly. `src/hooks/useTrip.jsx` coordinates search and installs Firestore cloud writers. `src/services/placesProvider.js` is the seam that routes data calls to the active map provider.

## Full documentation

**→ See [`docs/HANDOFF.md`](docs/HANDOFF.md)** for the complete picture: architecture deep-dive, annotated file map, data/cost-control flows, the wishlist/plan domain, Firestore sync, design conventions, and the list of known gotchas and deferred work. Per-decision history lives in the project memory files referenced there.

## Deploy

Firebase Hosting (classic). Build + deploy after user-facing changes. `firebase.json` carries cache headers to mitigate PWA staleness — after a deploy, hard-reload before assuming a regression (the service worker may serve the old bundle).
