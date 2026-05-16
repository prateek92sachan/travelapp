# Travel App

A one-stop travel planner: enter a destination and a date, get the weather, top 5 points of interest on a map, and top 5 activities — with each activity linked to its location on the map.

Built with React + Vite, installable as a PWA on mobile.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173.

## Features

- Destination + date pickers with form validation
- **Weather widget**: live forecast for trips within 5 days; 5-year climate average for dates further out (clearly labeled as such)
- **Map widget**: Google Map with numbered markers for top points of interest; expand to fullscreen with the ⤢ button
- **Activities widget**: top 5 things to do, click any one to pan/zoom the map and open a detail panel with cost/duration estimates and a "Get directions" link
- **Dark mode** toggle (☀/🌙)
- **Shareable URLs**: state syncs to `?dest=Tokyo&date=2026-06-15` so you can bookmark or share trips
- **Recent trips**: last 5 searches saved locally, click the 🕒 icon to revisit
- **PWA**: installable on phone via "Add to Home Screen"
- Responsive layout: 3-column on desktop, stacked on mobile

## How the data flows

```
You type → useTrip.search() → geocode the destination via Google Geocoding API
                            → kick off three calls in parallel:
                                ├── Weather (OpenWeather forecast OR Open-Meteo climate)
                                ├── Top 5 POIs (Google Places API New, Text Search)
                                └── Top 5 activities (Google Places API New, Text Search)
                            → results land in a single React Context
                            → all widgets read from that one source of truth
```

When you click an activity, `useTrip.selectActivity()` fires a `travelapp:focusLocation` window event. The Map widget listens and pans/zooms there. This loose coupling means the activities and map don't need to know about each other directly.

## Project structure

```
src/
├── App.jsx                  # Root layout + APIProvider for Google Maps
├── main.jsx                 # Entry, wraps app in ThemeProvider + TripProvider
├── components/
│   ├── Header.jsx           # Search bar, recents menu, theme/share buttons
│   ├── Card.jsx             # Reusable expandable card shell
│   ├── WeatherWidget.jsx    # Weather card with hourly breakdown
│   ├── MapWidget.jsx        # Google Map + AdvancedMarkers
│   └── ActivitiesWidget.jsx # Activity list + detail panel
├── hooks/
│   ├── useTrip.jsx          # Single source of truth: destination/date/coords/weather/pois/activities
│   └── useTheme.jsx         # Dark mode state + system preference detection
├── services/
│   ├── config.js            # Reads env vars
│   ├── googleMaps.js        # Geocoding + Places API (New) text search
│   └── weather.js           # OpenWeather forecast + Open-Meteo climate fallback
├── utils/
│   └── recentTrips.js       # localStorage CRUD for recent searches
└── styles/
    └── global.css           # Theme tokens + all styling
```

## API keys

Keys live in `.env` (gitignored). Format:

```
VITE_GOOGLE_MAPS_KEY=AIza...
VITE_OPENWEATHER_KEY=...
```

A template is in `.env.example`.

### Required Google APIs (all free tier)

In Google Cloud Console, enable these on your project:

- **Maps JavaScript API** — the interactive map
- **Places API (New)** — POI/activity search
- **Geocoding API** — destination → coordinates

### Required OpenWeather plan

Free tier is sufficient. We use the **5 day / 3 hour forecast** endpoint (1,000 calls/day). For dates beyond 5 days out, we fall back to **Open-Meteo's free archive API** (no key needed) for climate averages.

## Security notes — read these

1. **Frontend keys are public.** Anything in `import.meta.env.VITE_*` ships in the JS bundle. Anyone who inspects your site can read them.
2. **Restrict your Google key** in Cloud Console → Credentials → your key → "Application restrictions" → HTTP referrers. Add `http://localhost:*/*` for dev and your real domain for prod. Without this, a leaked key can rack up bills.
3. **Don't commit `.env`** — it's in `.gitignore`. If you ever did, rotate both keys immediately.
4. **For production** (sharing this app with others), consider proxying API calls through your own backend so keys never reach the browser. That's beyond MVP scope.

## Deploying

Quick options:
- **Vercel** / **Netlify**: connect the repo, set `VITE_GOOGLE_MAPS_KEY` and `VITE_OPENWEATHER_KEY` as environment variables. Build command `npm run build`, output `dist/`.
- Don't forget to add your prod domain to the Google key's referrer allowlist.

## Known trade-offs

- **Activity cost & duration are heuristics** based on Google place types — not real data. A museum gets "$$, 2-3 hrs"; a park gets "Free, 1-3 hrs". For real numbers we'd need a paid travel API (Viator, GetYourGuide) or per-place LLM enrichment.
- **Climate averages use 5 prior years**, not 30-year normals. Trade-off between API quota and accuracy.
- **No accounts, no syncing.** Recent trips live only on the device that saved them.

## Tech stack

- React 18 + Vite 5
- `@vis.gl/react-google-maps` for Google Maps integration
- `vite-plugin-pwa` for service worker / manifest
- No CSS framework — pure CSS with theme tokens. Easy to read, easy to swap.
