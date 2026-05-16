import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import WeatherWidget from './WeatherWidget';
import { useTrip } from '../hooks/useTrip';
import { useIsDesktop } from '../hooks/useIsDesktop';

const ICON_MAP = {
  '01d': '☀️', '01n': '🌙',
  '02d': '⛅', '02n': '☁️',
  '03d': '☁️', '03n': '☁️',
  '04d': '☁️', '04n': '☁️',
  '09d': '🌧', '09n': '🌧',
  '10d': '🌦', '10n': '🌧',
  '11d': '⛈', '11n': '⛈',
  '13d': '❄️', '13n': '❄️',
  '50d': '🌫', '50n': '🌫'
};

export default function WeatherFloat() {
  const isDesktop = useIsDesktop();
  const { weather } = useTrip();
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);

  // Esc closes mobile overlay
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setMobileExpanded(false); }
    if (mobileExpanded) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileExpanded]);

  // Push history entry so swipe-back closes overlay instead of leaving site
  useEffect(() => {
    if (!mobileExpanded) return;
    history.pushState({ weatherOverlay: true }, '');
    function onPop() { setMobileExpanded(false); }
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      if (history.state?.weatherOverlay) history.back();
    };
  }, [mobileExpanded]);

  if (!weather) return null;

  const icon = ICON_MAP[weather.icon] || '🌡';
  const descLong = (weather.description?.length ?? 0) > 9;

  if (!isDesktop) {
    return (
      <div className="weather-mobile-card">
        <button
          type="button"
          className="weather-float-pill"
          onClick={() => setMobileExpanded(true)}
          title="Show full weather"
          aria-label="Expand weather details"
        >
          <span className="weather-float-icon" aria-hidden>{icon}</span>
          <span className="weather-float-temp">
            {weather.tempC == null ? '—' : `${weather.tempC}°`}
          </span>
          <span className={`weather-float-desc${descLong ? ' marquee' : ''}`}>
            {weather.description}
          </span>
        </button>

        {mobileExpanded && createPortal(
          <div className="places-mobile-overlay">
            <div
              className="places-mobile-overlay-backdrop"
              onClick={() => setMobileExpanded(false)}
            />
            <div className="places-mobile-overlay-panel">
              <div className="weather-overlay-header">
                <span className="weather-overlay-title">Weather</span>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setMobileExpanded(false)}
                  aria-label="Close weather"
                >
                  ✕
                </button>
              </div>
              <div className="weather-overlay-body">
                <WeatherWidget />
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  // Desktop: floating pill + popover
  return (
    <div className={`weather-float ${desktopExpanded ? 'expanded' : ''}`}>
      {!desktopExpanded ? (
        <button
          type="button"
          className="weather-float-pill"
          onClick={() => setDesktopExpanded(true)}
          title="Show full weather"
          aria-label="Expand weather details"
        >
          <span className="weather-float-icon" aria-hidden>{icon}</span>
          <span className="weather-float-temp">
            {weather.tempC == null ? '—' : `${weather.tempC}°`}
          </span>
          <span className="weather-float-desc">{weather.description}</span>
        </button>
      ) : (
        <div className="weather-float-popover">
          <button
            type="button"
            className="btn-close weather-float-close"
            onClick={() => setDesktopExpanded(false)}
            aria-label="Close weather"
          >
            ✕
          </button>
          <WeatherWidget />
        </div>
      )}
    </div>
  );
}
