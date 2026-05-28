import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { APIProvider } from '@vis.gl/react-google-maps';
import Header from './components/Header';
import WeatherFloat from './components/WeatherFloat';
import MapWidget from './components/MapWidget';
import PlacesDrawer from './components/PlacesDrawer';
import EmptyStateGlobe from './components/EmptyStateGlobe';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './components/Dashboard';
import { useTrip } from './hooks/useTrip';
import { useIsDesktop } from './hooks/useIsDesktop';
import { GOOGLE_MAPS_KEY, assertKeys } from './services/config';

export default function App() {
  useEffect(() => {
    assertKeys();
  }, []);

  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY}>
      <div className="app-shell">
        <Header />
        <Routes>
          <Route path="/" element={<MapView />} />
          <Route path="/dashboard" element={<Dashboard />} />
        </Routes>
      </div>
    </APIProvider>
  );
}

function MapView() {
  const { coords, error } = useTrip();
  const isDesktop = useIsDesktop();
  return (
    <main className={`main ${coords ? 'main-map-dominant' : ''}`}>
      {error && <ErrorBanner error={error} />}

      {coords && (coords.isCountry || coords.isAdminRegion) && (
        <BroadSearchHint coords={coords} />
      )}

      {!coords && !error && (
        <ErrorBoundary label="Globe">
          <EmptyStateGlobe />
        </ErrorBoundary>
      )}

      {coords && (
        <>
          <ErrorBoundary label="Map">
            <MapWidget />
          </ErrorBoundary>
          {isDesktop ? (
            <>
              <ErrorBoundary label="Weather">
                <WeatherFloat />
              </ErrorBoundary>
              <ErrorBoundary label="Places">
                <PlacesDrawer />
              </ErrorBoundary>
            </>
          ) : (
            <div className="mobile-bar-container">
              <ErrorBoundary label="Weather">
                <WeatherFloat />
              </ErrorBoundary>
              <div className="mobile-bar-divider" aria-hidden="true" />
              <ErrorBoundary label="Places">
                <PlacesDrawer />
              </ErrorBoundary>
            </div>
          )}
        </>
      )}
    </main>
  );
}

/**
 * Suggest a more specific search when the user searches a whole country
 * or large region. Activities are inherently city-scale; country-scale
 * results scatter across hundreds of km and feel disconnected.
 */
function BroadSearchHint({ coords }) {
  const { search } = useTrip();
  const suggestions = suggestionsFor(coords);

  // Pass `destination` as an override so search() doesn't rely on a
  // (possibly stale) closure over the previous destination state.
  const pick = (city) => search({ destination: city });

  return (
    <div className="hint-banner">
      <div style={{ fontSize: 14 }}>
        💡 You searched a {coords.isCountry ? 'country' : 'region'}. Try a city
        for tighter, more relevant results:
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            onClick={() => pick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Quick lookup of common cities for popular country searches.
 * For unknown countries we just show a generic prompt.
 */
function suggestionsFor(coords) {
  const name = coords.formattedAddress?.toLowerCase() || '';
  if (name.includes('thailand')) return ['Bangkok', 'Chiang Mai', 'Phuket', 'Krabi'];
  if (name.includes('japan')) return ['Tokyo', 'Kyoto', 'Osaka', 'Hokkaido'];
  if (name.includes('india')) return ['Mumbai', 'Delhi', 'Goa', 'Bengaluru', 'Jaipur'];
  if (name.includes('italy')) return ['Rome', 'Florence', 'Venice', 'Milan'];
  if (name.includes('france')) return ['Paris', 'Nice', 'Lyon', 'Marseille'];
  if (name.includes('spain')) return ['Madrid', 'Barcelona', 'Seville', 'Valencia'];
  if (name.includes('united kingdom') || name.includes('uk'))
    return ['London', 'Edinburgh', 'Manchester', 'Bath'];
  if (name.includes('united states') || name.includes('usa'))
    return ['New York', 'Los Angeles', 'San Francisco', 'Chicago'];
  if (name.includes('indonesia')) return ['Bali', 'Jakarta', 'Yogyakarta'];
  if (name.includes('vietnam')) return ['Hanoi', 'Ho Chi Minh City', 'Da Nang'];
  if (name.includes('mexico')) return ['Mexico City', 'Cancun', 'Oaxaca'];
  if (name.includes('australia')) return ['Sydney', 'Melbourne', 'Brisbane'];
  return [];
}

/**
 * Render API-related errors with actionable next steps instead of
 * dumping a wall of JSON at the user.
 */
function ErrorBanner({ error }) {
  const lower = String(error).toLowerCase();
  let title = '⚠ Something went wrong';
  let hint = error;

  if (lower.includes('permission_denied') || lower.includes('api_key_service_blocked')) {
    title = '⚠ Google Places API is blocked for your key';
    hint =
      'Enable “Places API (New)” in Google Cloud Console → APIs & Services → Library, then reload. ' +
      'Also confirm your key’s API restrictions include it.';
  } else if (lower.includes('referer') || lower.includes('referrer')) {
    title = '⚠ API key blocked by referrer restriction';
    hint = 'Add http://localhost:*/* to your key’s allowed HTTP referrers in Cloud Console.';
  } else if (lower.includes('billing')) {
    title = '⚠ Billing not enabled on Google project';
    hint = 'Link a billing account in Cloud Console. Free tier still applies, but billing must be on.';
  }

  return (
    <div className="error-banner">
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div style={{ marginTop: 4, fontSize: 13 }}>{hint}</div>
    </div>
  );
}
