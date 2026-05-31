# Travel APP v2 — Project Handoff

**Last updated:** 2026-05-31
**Branch at handoff:** `feature/mapbox-search` (ahead of `master`)
**Audience:** an engineer picking this up cold. Assumes React fluency, no prior context on this codebase.

> ⚠️ The root `README.md` is **stale** — it describes an earlier single-React-Context architecture (`useTrip` as source of truth, `ActivitiesWidget`, etc.). The app has since moved to **Zustand stores + TanStack Query + a provider-routing data layer**. Trust THIS document over the README.

---

## 1. What it is

A single-page travel planner. You search a destination; it geocodes, drops you on a map, and surfaces categorized points of interest (Activities / Restaurants / Nature / Hidden gems / Hotels) sourced live from a maps provider. You can:

- Browse POIs per category, open a detail card (Wikipedia description + AI summary).
- **Save** places to a per-city wishlist ("Saved" mode).
- **Plan** an itinerary ("Plan" mode): days → time-of-day phases (Morning/Evening/Night) → sessions, plus per-day hotels.
- Sign in (Google) to sync wishlists/plans to Firestore across devices.
- Track API spend on a **/dashboard** route.

Three swappable **map providers**: Google, Mapbox, Tmap (Mapbox renderer + Mapbox data, zero Google calls).

**Stack:** React 18, Vite 5, Zustand 5 (state), TanStack Query 5 (server cache), Firebase 12 (auth + Firestore), `@vis.gl/react-google-maps`, `mapbox-gl` / `react-map-gl`, `react-globe.gl` (empty-state globe), `sonner` (toasts), Lucide icons, `vite-plugin-pwa`. No CSS framework — pure CSS with theme tokens in `src/styles/global.css`.

---

## 2. Run / build / deploy

```bash
npm install
npm run dev        # vite dev server → http://localhost:5173
npm run build      # vite build → dist/ (also generates PWA service worker)
npm run preview    # serve the built bundle
```

- **No test runner.** `npm run lint` is a stub (`echo`). The only build-time gate is `npm run build`. Playwright is a devDependency but there is no configured e2e suite in active use. **Verification = build + manual smoke.**
- **Hosting:** Firebase Hosting (classic). After any user-facing change, the standing rule is **build + deploy hosting** (see §13). `firebase.json` carries cache headers to fight PWA staleness.
- **PWA staleness gotcha:** after deploy, the service worker can serve the *old* bundle. "Still broken after I fixed it" is almost always a stale SW — **hard-reload first** before assuming a regression.

### Environment / keys
Frontend keys ship in the bundle (`import.meta.env.VITE_*`) — they are public by design; restrict them in the respective consoles. `src/services/config.js` reads them and `assertKeys()` validates at boot (called in `App.jsx`).
- `VITE_GOOGLE_MAPS_KEY` — Maps JS, Places API (New), Geocoding.
- `VITE_OPENWEATHER_KEY` — weather forecast.
- `VITE_MAPBOX_TOKEN` (`MAPBOX_TOKEN` in config) — Mapbox renderer + Tmap data. If absent, Tmap silently falls back to Google renderer + Google data.

---

## 3. Architecture at a glance

```
main.jsx
  └─ AuthProvider ─ TripProvider ─ ThemeProvider ─ QueryClientProvider ─ BrowserRouter
       └─ App.jsx
            ├─ APIProvider (Google Maps JS)
            ├─ Header  (search input, recents, theme/share, sign-in)
            └─ Routes
                 ├─ "/"          → MapView  (globe empty-state OR map + weather + places drawer)
                 └─ "/dashboard" → Dashboard (API cost tracking)
```

**Three layers of state, by responsibility:**

| Layer | Tech | Holds |
|-------|------|-------|
| Client UI/domain state | **Zustand** (`src/stores/`) | search, map, wishlist |
| Server/data cache | **TanStack Query** (`src/hooks/queries/`) | POI category data, viewport data, weather, events |
| Cross-cutting glue | **React Context** (`src/hooks/useTrip.jsx`) | wires search→stores, installs Firestore cloud writers, exposes `useTripSearch()` |

The big architectural idea: **components read from stores + query hooks directly**; `useTrip` is mostly a coordinator/installer, not a data bag. (A prior refactor split the old monolithic `useTrip` Context to cut re-renders — see `project_useTrip_refactor` in memory.)

---

## 4. Directory map (annotated)

```
src/
├── App.jsx                     # Routes; APIProvider; empty-state vs map switch; error banners
├── main.jsx                    # Provider tree; <Toaster/> (sonner) mounted here
│
├── components/
│   ├── Header.jsx              # Search bar, recents, theme/share, sign-in, collapsed mobile pickers
│   ├── SmartSearchInput.jsx    # Destination autocomplete (CITIES/REGIONS ONLY — see §14)
│   ├── Card.jsx                # Reusable expandable card shell (header/middleHeader/topBands/body)
│   ├── MapWidget.jsx           # Chooses provider renderer; hosts floating header + controls
│   ├── PlacesDrawer.jsx        # Desktop side / mobile bottom container for TabbedPlacesWidget
│   ├── TabbedPlacesWidget.jsx  # ★ Core UI: category tabs, POI rows, detail card, wishlist tab,
│   │                           #   Saved/Plan modes, SavedPlacePicker, PlaceDetail
│   ├── PlanMode.jsx            # Itinerary editor: days/phases/sessions + hotels + pickers
│   ├── PlacePickerModal.jsx    # Shared live-POI picker modal + LightPickerRow
│   ├── PlanSlotChooser.jsx     # Bottom-sheet day/phase chooser (add-to-plan feature)
│   ├── WishlistPanel.jsx       # SavedPlaceCard + wishlist list rendering
│   ├── WishlistOverlay.jsx     # Full-screen wishlist overlay (mobile)
│   ├── Dashboard.jsx           # /dashboard — MTD API cost split, per-card console deep-links
│   ├── Weather*.jsx            # WeatherWidget / WeatherFloat
│   ├── EmptyStateGlobe.jsx     # react-globe.gl pre-search globe
│   ├── ErrorBoundary.jsx       # Per-widget boundaries (Map/Weather/Places/Globe)
│   └── map/
│       ├── GoogleMapInner.jsx  # Google renderer
│       ├── MapboxMapInner.jsx  # Mapbox renderer (provider 'mapbox', Google data)
│       ├── TmapMapInner.jsx    # Mapbox renderer (provider 'tmap', Mapbox data)
│       ├── MapFloatingHeader.jsx, MapControlsPanel.jsx, mapboxShared.jsx
│       ├── useMapData.js       # Marker/data assembly for the active provider
│       ├── constants.js, helpers.js
│
├── hooks/
│   ├── useTrip.jsx             # TripProvider: search orchestration + cloud-writer install
│   ├── useAuth.jsx             # Firebase auth state
│   ├── useTheme.jsx            # Dark mode
│   ├── usePlaceSummary.js      # Claude Haiku AI summary fetch (detail card)
│   ├── useIsDesktop.js, useClickOutside.js, useEscapeKey.js
│   └── queries/
│       ├── useTabQuery.js      # Per-category POI query (TAB_KEYS)
│       ├── useViewportQuery.js # POIs within current map viewport (pan/zoom)
│       ├── useWeather.js, useEvents.js
│
├── services/
│   ├── config.js               # env keys + assertKeys()
│   ├── placesProvider.js       # ★ Provider routing: google|mapbox→Google data, tmap→Mapbox data
│   ├── googleMaps.js           # Google Places (New) text/nearby + geocode + directionsUrl
│   ├── mapboxSearch.js         # Mapbox Search Box + geocode + reverse-geocode
│   ├── tmapService.js          # Tmap data source (pure Mapbox)
│   ├── locationService.js      # Mapbox-first / Google-fallback geocode dispatcher
│   ├── wikipedia.js            # Wiki summary + isWikiMatch (detail card descriptions)
│   ├── weather.js, events.js
│   ├── firebase.js             # Firebase app/auth/firestore init
│   ├── firestoreSchema.js      # v4 subcollection schema helpers
│   ├── wishlistSync.js         # Per-mutation cloud writer for wishlist/plan
│   ├── userPrefsSync.js, recentTripsSync.js, userMigration.js
│
├── stores/
│   ├── searchStore.js          # destination, coords, activeTab, selected/detail place, loading
│   ├── mapStore.js             # mapProvider, viewportTarget, viewportCity/Country
│   └── wishlistStore.js        # ★ lists (mode-scoped), plan mutations, cloud emit
│
├── utils/
│   ├── wishlist.js             # ★ Pure wishlist/plan persistence (localStorage) + list helpers
│   ├── plan.js                 # ★ Plan model: days/phases/sessions/hotels + pure mutators
│   ├── placeCache.js, persistentCache.js   # POI caches (cost control)
│   ├── usageCounter.js         # API call counting → dashboard
│   ├── recentTrips.js, geo.js, format.js, shortenAddress.js, uiState.js, weatherIcons.js
│
└── styles/global.css           # All styling + theme tokens (large single file by convention)
```

---

## 5. State management deep dive

### Zustand stores
- **`searchStore`** — `destination`, `coords`, `activeTab` (current category or `'wishlist'`), `selectedPlaceId` / `selectedPlace` (pin highlight), `detailPlace` (the card actually shown — set only on row tap/restore, NOT on pin highlight), `loading`, `error`. `switchTab`, `selectPlace`, `closeDetail`.
- **`mapStore`** — `mapProvider` (`'google' | 'mapbox' | 'tmap'`, Firestore-synced toggle), `viewportTarget` (drives viewport queries when the user pans), `viewportCity` / `viewportCountry` (reverse-geocoded; the city that "save"/"add" actions target).
- **`wishlistStore`** — the wishlist/plan domain. `wishlist.lists` are **mode-scoped** (`mode: 'plan' | 'saved'`), each keyed to a city `destination`. Actions wrap pure utils from `utils/wishlist.js` + `utils/plan.js`, then `emit(...)` deltas to the installed cloud writer. Notable: `addPlace`, `addPlaceSmart` (lazily creates the Saved list for the viewport city), `updatePlan`, `promoteGhost`, `ensureListForMode`, **`addToPlanSlot`** (add-to-plan feature, §9), and selectors `selectLists` / `selectActiveListId` / `resolveActiveForMode`.

### TanStack Query (server cache)
- `useTabQuery(category)` — one query per POI category. Query keys are **tagged with the active data source** (`'g'` vs `'mb'`) so Google-sourced and Mapbox-sourced caches never collide.
- `useViewportQuery({target, category})` — POIs inside the current viewport; takes precedence over the city tab when the user has panned.
- Long cache lifetimes are deliberate cost control (see §8). `src/lib/queryClient.js` holds defaults.

### `useTrip` Context
`TripProvider` wires search → stores, installs the Firestore **cloud writers** into the stores once a user signs in, runs sign-in migration, and exposes `useTripSearch()` (the `search()` entry point). It is a coordinator, not a data store.

---

## 6. Map providers & data routing

`services/placesProvider.js` is the indirection seam. Query hooks and `useTrip.search()` call provider-routing functions (`fetchTopActivities`, `fetchPlacesInViewport`, `geocodeDestination`, …) — **not** `googleMaps` directly. At call time:

| `mapProvider` | Renderer | Data source | queryKey tag |
|---------------|----------|-------------|--------------|
| `google` | Google | Google Places | `g` |
| `mapbox` | Mapbox GL | **Google Places** | `g` |
| `tmap`  | Mapbox GL | **Mapbox Search Box** (`tmapService`) | `mb` |

Because `google` and `mapbox` share the `g` tag, **toggling between them is free** (no refetch). Only `tmap` switches the data source. `clearViewportCache()` wipes both providers' viewport caches on a new search to avoid stale cross-provider data.

**Cross-provider place identity:** a place from Mapbox and the same place from Google won't share an ID. There's a local-only match heuristic (name + ~75m proximity) so saved places line up across providers, plus Wikipedia photo backfill for blank Tmap pins. All local, zero added API cost (see `project_cross_provider_place_identity`, `project_tmap_provider` in memory).

> **Tmap caveat:** an empty category tab usually means a bad canonical Mapbox category id. Verify category IDs when touching `tmapService`. Tmap images are Wikipedia-only (Foursquare was tried and reverted — photos are paid on the new FSQ API).

---

## 7. Detail card

`PlaceDetail` (in `TabbedPlacesWidget.jsx`) shows, in order: AI summary, then Wikipedia description, stats, actions (Save / **Add to plan** / Directions / Close).

- **Descriptions are Wikipedia-only.** No Google Place Details, no Gemini. Fetch is debounced 300 ms so skimming pins doesn't fire a lookup per place. **Do not re-add Google/Gemini to the card** — this was a deliberate cost decision (`project_detail_card_wiki_only`).
- **AI summary** = a 40–50 word tourist blurb via **Claude Haiku 4.5**, behind a Cloud Function proxy, sourced from the Wiki extract. Cached forever in localStorage per `placeId`, with a retry button on error (`usePlaceSummary.js`, `project_claude_ai_summary`).

---

## 8. Places cost controls (READ THIS BEFORE TOUCHING CACHING)

There was a **₹2,198 cost spike (May 24)** — root cause was cold caches + a pin-tap that wiped the place cache (not an infinite loop). Round-2 fixes that must be preserved:

- **Persistent caches** (`persistentCache.js`, `placeCache.js`) across all tabs.
- **Pin tap = highlight only.** A POI pin tap does `selectPlace({pan: false})` and nothing else — **no `search()`, no pan, no map remount, no cache wipe** (`project_pin_tap_navigation`). Detail card opens via the switched category tab + `detailPlace`.
- Long TanStack Query cache lifetimes; query gating; viewport-cache persistence; wiki dedup + concurrency cap.
- `usageCounter.js` counts calls → **/dashboard** shows month-to-date spend. Google cost comes from a BigQuery billing export (`prime-freedom-394504.travelapp`); Mapbox + free APIs are counted in localStorage. Budget cap target ₹4000 (INR throughout). A GCP hard budget cap is a standing TODO.

If you change query staleness, cache keys, or pin/selection behavior, **re-check the dashboard** afterward — this is the app's most expensive failure mode.

---

## 9. Wishlist & Plan domain

### Model
- Lists are **mode-scoped**: each city can have a `mode:'saved'` list (flat saved places) and/or a `mode:'plan'` list (an itinerary). `utils/wishlist.js` persists to localStorage (schema v3); `utils/plan.js` owns the plan shape.
- **Plan shape** (`plan.js`): `{ days, itinerary: Day[], placeSnapshots }`. `Day = { phases: { morning:[], evening:[], night:[] }, hotels: string[] }`. A session = `{ id, placeId, startTime, endTime, expense }`. Phases seed default times (`PHASE_DEFAULT_TIMES`). `placeSnapshots[placeId]` freezes display fields so plan cards survive even if the live list item is removed.
- **Ghost-city pattern:** the focused city without a real list yet shows a "+ Add {city}" ghost chip that promotes into a real list on demand.

### Add-to-Plan (most recent feature — this session)
From the Saved-mode "+ Add" picker **and** the place detail card, a place can be dropped into the Plan via a bottom-sheet chooser:
- `LightPickerRow` shows an optional `CalendarPlus` button (only when `onAddToPlan` is passed — absent in PlanMode's own pickers).
- `PlanSlotChooser.jsx` = bottom sheet: pick Day 1…N or "+ New day", then a phase (or "Set as hotel" for hotels; cap 2/day).
- `wishlistStore.addToPlanSlot(...)` resolves/creates the city's plan list via **`ensurePlanList`** (which, unlike `createListForDestinationMode`, **does NOT change `activeListId`** — so the Saved tab doesn't shift under the user), then mutates the plan and emits cloud deltas.
- Duplicates allowed (a place can appear in multiple slots). Feedback via `sonner` toast.
- Spec: `docs/superpowers/specs/2026-05-31-add-to-plan-design.md`. Plan: `docs/superpowers/plans/2026-05-31-add-to-plan.md`. Shipped as 10 commits `fa1c269..0e93496` on `feature/mapbox-search`.

---

## 10. Auth & Firestore sync

- Google sign-in via Firebase (`useAuth.jsx`, `services/firebase.js`).
- **Firestore v4 schema** = subcollections (`firestoreSchema.js`). Each store mutation emits through a **per-mutation cloud writer** (`wishlistSync.js`, `userPrefsSync.js`, `recentTripsSync.js`) installed by `useTrip` after sign-in. Remote→local apply paths set a `syncing` flag so writers no-op (no echo loops). Conflicts resolved by **server-timestamp skip**. On sign-in, local data migrates up (`userMigration.js`).
- **Mobile sign-in gotcha:** `signInWithRedirect` throws "missing initial state" on mobile (storage partitioning). Fix = `signInWithPopup`, identified but **declined by the user (2026-05-25)** — confirm before changing auth (`project_mobile_signin_redirect_error`).

---

## 11. Dashboard

`/dashboard` (`Dashboard.jsx`) — month-to-date API cost, split by source. Google = BigQuery billing export; Mapbox + free APIs = localStorage counters. Per-card deep-links into the relevant cloud console. ₹4000 cap target. Mapbox has no public usage REST API, so its numbers are local estimates (`project_dashboard_v1`).

---

## 12. Design system / conventions

- **Aesthetic:** Airbnb-like — restrained color, generous whitespace, **Lucide icons only**, **color-tint active states** (never full-opacity fills; active = `color + '14'` bg / `color + '55'` border).
- Multi-row chips, 22px squircle; vertical density preferred; marquee for overflow; consistent place-name resolver / `shortenAddress`.
- `Card.jsx` is the shell for expandable widgets (`header` / `middleHeader` / `topBands` / body slots).
- Modals/sheets self-portal to `document.body`, use a backdrop + `role="dialog"`; newer ones add `aria-modal` + Escape-to-close.
- All CSS in one `global.css` by convention — match surrounding patterns; use existing tokens (`--bg`, `--border`, `--border-strong`, `--accent`, `--text`, `--text-muted`).

---

## 13. Working agreements (from project memory)

- **Auto-deploy:** always build + deploy hosting after a user-facing code change (no need to ask).
- **Commits/pushes:** never commit or push unless explicitly asked. Branch off `master` for feature work.
- **Clarify first:** ask targeted questions (max ~4) before non-trivial features/design changes; ask edge-case behavior questions for stateful/multi-step flows.
- **Diagnose upfront:** when asked why something happens, lead with the cause before proposing fixes.
- **No auto stack-regression guards on fragile flows** (notably mobile sign-in storage-partitioning) — they caused breakage before (`feedback_guardrail_lesson`).
- **Feedback style:** annotated screenshots; split commits by concern; "Recommended" tags on options.

---

## 14. Known issues, gotchas & deferred work

- **Stale README** — rewrite or delete; this handoff supersedes it.
- **Codebase audit (2026-05-24):** 8 findings validated; priority order #7→#2→#8→#5→#4→#6 (#3 and #1 skipped). See `project_codebase_audit_2026_05_24` in memory — **not yet worked through.**
- **Search autocomplete scope:** destination autocomplete is **cities/regions only** — do NOT re-add POI/address types. Landmarks resolve via a full-text geocode fallback (`project_search_autocomplete_scope`).
- **Mobile sign-in:** popup fix identified, declined — confirm before touching auth (§10).
- **PWA staleness:** hard-reload after deploy before trusting "it's still broken" (§2).
- **Tmap empty tabs:** bad Mapbox category id (§6).
- **GCP hard budget cap:** standing TODO (§8).
- **Add-to-plan minor follow-ups** (not blocking, from final review): duplicate-hotel re-add shows a success toast though it's a no-op; plan-list lookup on the component side isn't whitespace-trimmed (destinations are normalized upstream, so low risk).
- **Pre-existing uncommitted working-tree changes** exist on `feature/mapbox-search` (e.g. `CLAUDE.md`, `.claude/settings.local.json`, several `src/` files) that are unrelated to the add-to-plan feature and were intentionally left unstaged. Review before committing/merging the branch.

---

## 15. Memory & docs pointers

- **Project/feedback memory:** `~/.claude/projects/C--Personal-Gemini-Projects-Travel-APP-v2/memory/` — `MEMORY.md` is the index; each `project_*.md` / `feedback_*.md` is one durable fact. Start there for the "why" behind non-obvious decisions.
- **Specs/plans:** `docs/superpowers/specs/`, `docs/superpowers/plans/`.
- **This file:** `docs/HANDOFF.md`.

### Fastest path to productivity
1. `npm install && npm run dev`, search a city, click around (tabs, save, plan, detail card).
2. Read `TabbedPlacesWidget.jsx` (the hub), then `wishlistStore.js` + `utils/plan.js` (the domain), then `placesProvider.js` (the data seam).
3. Skim the `project_*` memory files for the landmines in §8/§14 before changing caching, pin-tap, auth, or autocomplete.
