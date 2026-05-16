# Changelog

## [milestone-1] — 2026-05-16

### Map UI overhaul
- Floating map header (`MapFloatingHeader`) rendered inside `map-container` — fixes intermittent background-paint bug caused by `overflow: clip` + `position: absolute` on card header in composited GPU layers
- Header layout: `[🗺 Map] [Reset to city view — center] [4 category toggles + ⚙ gear]`
- Category toggle panel moved from floating map overlay → floating header (Lucide icons: Compass / Utensils / Leaf / Gem)
- Gear icon (Settings) added to header; opens/closes `MapControlsPanel` — click-outside collapses panel (capture-phase `pointerdown` listener)
- `MapControlsPanel` refactored to controlled mode: accepts `open`/`onToggle` props; hides internal trigger button when controlled
- `Card.jsx` — header div only renders when it has content (prevents empty 52px placeholder on map card)

### Map markers
- Multi-category markers: all 4 categories shown simultaneously (up to 7 each), colored SVG circles per category
- `CATEGORY_CONFIG`: activities `#f97316`, restaurants `#ef4444`, nature `#22c55e`, gems `#6366f1`
- Clicking a colored marker auto-switches to matching tab (green → Nature, red → Restaurants, etc.)

### Place selection
- `selectPlace(place, category)` — calls `switchTab(category)` via ref before setting `selectedPlaceId`; React batches both in one render
- `selectedPlace` state added to `useTrip` context — stores full POI object so detail card always renders regardless of tab load state
- `TabbedPlacesWidget` uses `selectedPlace` directly (not `activeTabItems.find(...)`) — detail card never goes missing

### Place detail card (PlaceDetail)
- Actions redesigned: `[♡ Save] [→ Directions]` grid row + `[Close]` full-width text link below
- Added `.btn-outline` CSS class (accent border, transparent bg)
- Lucide `Heart` + `Navigation` icons on buttons; short labels prevent text wrapping

### Search radius
- `geocodeDestination` returns `viewportNE` / `viewportSW` from geocode bounding box
- `searchRadiusRef` = `haversineKm(NE, SW) / 2 * 1000`, clamped 5 km – 300 km
- All fetch functions accept `radiusMeters` param (default 20 000 m)
- Phase 2 background pre-fetches restaurants + nature + gems so map has all 4 categories immediately on load

### Viewport mode
- `viewportItemsRef` + `lastViewportParamsRef` refs added
- `switchTab` re-fetches viewport data for new tab when viewport mode is active — prevents stale data freeze

### Mobile bottom bar
- Weather section `overflow: visible` → `overflow: hidden` — text no longer spills past divider

### PlacesDrawer
- Listens for `travelapp:openPlaces` event → opens mobile overlay when map marker tapped

### TabbedPlacesWidget
- `scrollIntoView` on selected place change
- Manual add form for wishlist items (name, location, category, duration, cost)
- Long-press chip (500 ms) opens list picker overlay

### Wishlist
- Horizontal scroll list picker strip (`flex-wrap: nowrap; overflow-x: auto`)

---

## Prior work (pre-milestone-1)

- React 18 + Vite PWA scaffold
- Google Maps multi-layer integration (`@vis.gl/react-google-maps`)
- Firebase auth (Google Sign-In popup, redirect fallback) + Firestore cloud sync
- Tabbed places widget (Activities / Restaurants / Nature / Hidden gems / Wishlist)
- OpenWeather + Open-Meteo hybrid weather
- Wikipedia enrichment for activities
- Nearby mode (2 km proximity ring around selected hotel)
- Mobile-dominant map layout with unified bottom bar
- Light theme always (removed OS dark mode fallback)
- Share button with clipboard + execCommand fallback
- Toast notifications centered
