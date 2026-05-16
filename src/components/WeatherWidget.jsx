import Card from './Card';
import { useTrip } from '../hooks/useTrip';

// Map OpenWeather icon code -> emoji (good enough; avoids hotlinking icons)
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

const emojiFor = (icon) => ICON_MAP[icon] || '🌡';

export default function WeatherWidget() {
  const { weather, lastYearWeather, events, loading } = useTrip();

  return (
    <Card icon="🌤" title="Weather">
      {loading && !weather ? (
        <Skeleton />
      ) : !weather ? (
        <div className="muted">No weather data yet.</div>
      ) : (
        <div className="weather-stack">
          <CurrentSection w={weather} />
          <LastYearSection w={lastYearWeather} />
          <EventsSection events={events} />
        </div>
      )}
    </Card>
  );
}

// ---- Section 1: Current / forecast / climate ------------------------------

function CurrentSection({ w }) {
  const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

  return (
    <section className="weather-section">
      <h4 className="weather-section-title">For your trip date</h4>
      <span className="weather-label">{w.label}</span>
      <div className="weather-main">
        <div className="weather-icon" aria-hidden>{emojiFor(w.icon)}</div>
        <div>
          <div className="weather-temp">{fmt(w.tempC, '°C')}</div>
          <div className="weather-desc">{w.description}</div>
          <div className="weather-range">
            ↑ {fmt(w.tempMaxC, '°')} &nbsp; ↓ {fmt(w.tempMinC, '°')}
          </div>
        </div>
      </div>

      <div className="weather-stats">
        <Stat k="Feels like" v={fmt(w.feelsLikeC, '°C')} />
        <Stat k="Humidity" v={fmt(w.humidity, '%')} />
        <Stat k="Wind" v={fmt(w.windKph, ' km/h')} />
        <Stat k="Precip" v={fmt(w.precipMm, ' mm')} />
      </div>

      {w.unavailable && (
        <div className="muted weather-foot">
          No historical data for this date. Try a date within the next 5 days
          for a live forecast.
        </div>
      )}

      {w.hourly?.length > 0 && (
        <>
          <div className="weather-subhead">Hour by hour</div>
          <div className="hourly-row">
            {w.hourly.map((h) => (
              <div key={h.time} className="hourly-cell">
                <div className="t">{h.time}</div>
                <div className="ic">{emojiFor(h.icon)}</div>
                <div className="tmp">{h.tempC}°</div>
              </div>
            ))}
          </div>
        </>
      )}

      {w.source === 'climate' && (
        <div className="muted weather-foot">
          Showing the average of the past 5 years for this date — actual weather
          may vary.
        </div>
      )}
    </section>
  );
}

// ---- Section 2: Same date last year ---------------------------------------

function LastYearSection({ w }) {
  if (!w) return null;
  const fmt = (v, suffix = '') => (v == null ? '—' : `${v}${suffix}`);

  return (
    <section className="weather-section">
      <h4 className="weather-section-title">{w.label}</h4>
      <div className="weather-mini">
        <div className="weather-icon-sm" aria-hidden>{emojiFor(w.icon)}</div>
        <div className="weather-mini-content">
          <div className="weather-mini-temp">{fmt(w.tempC, '°C')}</div>
          <div className="weather-desc">{w.description}</div>
          <div className="weather-mini-meta">
            ↑ {fmt(w.tempMaxC, '°')} ↓ {fmt(w.tempMinC, '°')}
            {w.precipMm > 0 && <> · {w.precipMm} mm rain</>}
            {w.windKph > 0 && <> · {w.windKph} km/h wind</>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- Section 3: Annual events / festivals ---------------------------------

function EventsSection({ events }) {
  if (!events || events.length === 0) return null;

  return (
    <section className="weather-section">
      <h4 className="weather-section-title">Around this time of year</h4>
      <ul className="events-list">
        {events.map((e, i) => (
          <li key={i} className="event-item">
            <p>{e.blurb}</p>
            {e.source && (
              <a
                href={e.source}
                target="_blank"
                rel="noopener noreferrer"
                className="event-source"
              >
                via Wikipedia →
              </a>
            )}
          </li>
        ))}
      </ul>
      <div className="muted weather-foot">
        Based on Wikipedia mentions of this month. Verify locally before
        planning around them.
      </div>
    </section>
  );
}

function Stat({ k, v }) {
  return (
    <div className="weather-stat">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div>
      <div className="skeleton skeleton-block" />
      <div className="skeleton skeleton-line" style={{ width: '60%' }} />
      <div className="skeleton skeleton-line" style={{ width: '80%' }} />
    </div>
  );
}
