// Smart hybrid weather:
//   - If trip date is within OpenWeather's forecast range (~5 days, free tier),
//     use OpenWeather's 5 day / 3 hour forecast.
//   - Otherwise fall back to Open-Meteo's free climate API to compute
//     historical averages for that day-of-year over the past 5 years.
//
// We label clearly which one we returned so the UI can be honest about it.

import { OPENWEATHER_KEY } from './config';
import { increment as usageInc } from '../utils/usageCounter';

const FORECAST_HORIZON_DAYS = 5; // OpenWeather free tier limit

export async function fetchWeather({ lat, lng, dateISO }) {
  const target = new Date(dateISO);
  const now = new Date();
  const daysOut = Math.round((target - now) / (1000 * 60 * 60 * 24));

  if (daysOut < 0) {
    return fetchHistoricalAverage({ lat, lng, dateISO, kind: 'past' });
  }
  if (daysOut <= FORECAST_HORIZON_DAYS) {
    try {
      return await fetchForecast({ lat, lng, dateISO });
    } catch (e) {
      console.warn('Forecast failed, falling back to climate avg:', e);
      return fetchHistoricalAverage({ lat, lng, dateISO, kind: 'fallback' });
    }
  }
  return fetchHistoricalAverage({ lat, lng, dateISO, kind: 'climate' });
}

/**
 * Fetch the actual weather that occurred on the same date one year ago.
 * Useful for "this is what it was like last year" travel-planning context.
 * Uses Open-Meteo's archive — free, no key.
 */
export async function fetchLastYearWeather({ lat, lng, dateISO }) {
  const target = new Date(dateISO);
  // Subtract one calendar year. Note: JS rolls Feb 29 back to Mar 1 of the
  // prior year (not Feb 28); that's a one-day quirk we accept rather than
  // hand-handling, since Feb 29 is rare and the weather data is still valid.
  const lastYear = new Date(target);
  lastYear.setUTCFullYear(target.getUTCFullYear() - 1);
  const yyyy = lastYear.getUTCFullYear();
  const mm = String(lastYear.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(lastYear.getUTCDate()).padStart(2, '0');
  const date = `${yyyy}-${mm}-${dd}`;

  try {
    const url =
      `https://archive-api.open-meteo.com/v1/archive` +
      `?latitude=${lat}&longitude=${lng}` +
      `&start_date=${date}&end_date=${date}` +
      `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,` +
      `precipitation_sum,wind_speed_10m_max` +
      `&hourly=relative_humidity_2m` +
      `&timezone=UTC`;
    usageInc('openmeteo');
    const r = await fetch(url);
    if (!r.ok) return null;
    const j = await r.json();
    const d = j.daily;
    const hums = j.hourly?.relative_humidity_2m?.filter(Number.isFinite) || [];
    const meanHum = hums.length
      ? hums.reduce((a, b) => a + b, 0) / hums.length
      : null;

    if (!d || !Number.isFinite(d.temperature_2m_mean?.[0])) return null;

    const tempMean = d.temperature_2m_mean[0];
    const tempMax = d.temperature_2m_max[0];
    const tempMin = d.temperature_2m_min[0];
    const precip = d.precipitation_sum?.[0] ?? 0;
    const wind = d.wind_speed_10m_max?.[0] ?? 0;

    return {
      source: 'last-year',
      label: `Same date in ${yyyy}`,
      date,
      tempC: Math.round(tempMean),
      tempMaxC: Math.round(tempMax),
      tempMinC: Math.round(tempMin),
      feelsLikeC: Math.round(tempMean),
      humidity: meanHum != null ? Math.round(meanHum) : null,
      windKph: Math.round(wind),
      description: describeFromTemp(tempMean, precip),
      icon: iconFromTemp(tempMean, precip),
      main: precip > 2 ? 'Rain' : 'Clear',
      precipMm: Number(precip.toFixed(1))
    };
  } catch {
    return null;
  }
}

// --- OpenWeather forecast --------------------------------------------------

async function fetchForecast({ lat, lng, dateISO }) {
  const url =
    `https://api.openweathermap.org/data/2.5/forecast` +
    `?lat=${lat}&lon=${lng}&units=metric&appid=${OPENWEATHER_KEY}`;
  usageInc('openweather');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OpenWeather ${res.status}`);
  const data = await res.json();

  // Find the 3-hour slot closest to noon on the target date
  const targetDay = dateISO.slice(0, 10);
  const sameDay = data.list.filter((slot) =>
    slot.dt_txt.startsWith(targetDay)
  );

  if (!sameDay.length) {
    throw new Error('No forecast slots for that day');
  }

  // Compute daily aggregates
  const temps = sameDay.map((s) => s.main.temp);
  const tempMax = Math.max(...temps);
  const tempMin = Math.min(...temps);
  const noonSlot =
    sameDay.find((s) => s.dt_txt.endsWith('12:00:00')) ||
    sameDay[Math.floor(sameDay.length / 2)];

  return {
    source: 'forecast',
    label: 'Live forecast',
    date: targetDay,
    tempC: Math.round(noonSlot.main.temp),
    tempMaxC: Math.round(tempMax),
    tempMinC: Math.round(tempMin),
    feelsLikeC: Math.round(noonSlot.main.feels_like),
    humidity: noonSlot.main.humidity,
    windKph: Math.round(noonSlot.wind.speed * 3.6),
    description: noonSlot.weather[0].description,
    icon: noonSlot.weather[0].icon,
    main: noonSlot.weather[0].main,
    precipMm: (noonSlot.rain?.['3h'] ?? 0) + (noonSlot.snow?.['3h'] ?? 0),
    hourly: sameDay.map((s) => ({
      time: s.dt_txt.slice(11, 16),
      tempC: Math.round(s.main.temp),
      icon: s.weather[0].icon,
      description: s.weather[0].description
    }))
  };
}

// --- Open-Meteo climate average fallback -----------------------------------

async function fetchHistoricalAverage({ lat, lng, dateISO, kind }) {
  // Pull the same date for the last 5 years, average them.
  const target = new Date(dateISO);
  const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(target.getUTCDate()).padStart(2, '0');

  const thisYear = new Date().getUTCFullYear();
  const years = [thisYear - 5, thisYear - 4, thisYear - 3, thisYear - 2, thisYear - 1];

  // Open-Meteo archive API supports multi-day queries; fetch one window per year
  const results = await Promise.all(
    years.map(async (y) => {
      const date = `${y}-${mm}-${dd}`;
      // Note: relative_humidity is only available hourly on Open-Meteo's
      // archive endpoint, so we fetch it separately and average it client-side.
      const url =
        `https://archive-api.open-meteo.com/v1/archive` +
        `?latitude=${lat}&longitude=${lng}` +
        `&start_date=${date}&end_date=${date}` +
        `&daily=temperature_2m_max,temperature_2m_min,temperature_2m_mean,` +
        `precipitation_sum,wind_speed_10m_max` +
        `&hourly=relative_humidity_2m` +
        `&timezone=UTC`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        usageInc('openmeteo');
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) return null;
        const j = await r.json();
        // Compute daily mean humidity from hourly values
        const hums = j.hourly?.relative_humidity_2m?.filter(Number.isFinite) || [];
        const meanHum = hums.length
          ? hums.reduce((a, b) => a + b, 0) / hums.length
          : null;
        return { ...j.daily, _humidity: meanHum };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
      }
    })
  );

  const valid = results.filter(Boolean);

  const labels = {
    past: 'Historical (past date)',
    climate: 'Climate average — too far out for forecast',
    fallback: 'Climate average — forecast unavailable'
  };

  // No valid data — return a non-crashing placeholder instead of throwing.
  // (A throw here unmounts the whole React tree if not caught.)
  if (!valid.length) {
    return {
      source: 'climate',
      label: 'Weather data unavailable for this date',
      date: dateISO.slice(0, 10),
      tempC: null,
      tempMaxC: null,
      tempMinC: null,
      feelsLikeC: null,
      humidity: null,
      windKph: null,
      description: 'no historical data available',
      icon: '50d',
      main: 'Clear',
      precipMm: null,
      hourly: null,
      yearsUsed: years,
      unavailable: true
    };
  }

  // Safe average: returns null instead of NaN when array is empty.
  const safeAvg = (arr) => {
    const nums = arr.filter(Number.isFinite);
    if (!nums.length) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  };
  const safeRound = (v) => (v == null ? null : Math.round(v));
  const safeFixed = (v, n = 1) =>
    v == null ? null : Number(v.toFixed(n));

  const tempMax = safeAvg(valid.map((d) => d.temperature_2m_max?.[0]));
  const tempMin = safeAvg(valid.map((d) => d.temperature_2m_min?.[0]));
  const tempMean = safeAvg(valid.map((d) => d.temperature_2m_mean?.[0]));
  const precip = safeAvg(valid.map((d) => d.precipitation_sum?.[0]));
  const wind = safeAvg(valid.map((d) => d.wind_speed_10m_max?.[0]));
  const humidity = safeAvg(valid.map((d) => d._humidity));

  return {
    source: 'climate',
    label: labels[kind] || 'Climate average',
    date: dateISO.slice(0, 10),
    tempC: safeRound(tempMean),
    tempMaxC: safeRound(tempMax),
    tempMinC: safeRound(tempMin),
    feelsLikeC: safeRound(tempMean),
    humidity: safeRound(humidity),
    windKph: safeRound(wind),
    description: describeFromTemp(tempMean ?? 15, precip ?? 0),
    icon: iconFromTemp(tempMean ?? 15, precip ?? 0),
    main: (precip ?? 0) > 2 ? 'Rain' : 'Clear',
    precipMm: safeFixed(precip),
    hourly: null,
    yearsUsed: years
  };
}

function describeFromTemp(t, precip) {
  if (precip > 5) return 'rainy';
  if (precip > 1) return 'occasional showers';
  if (t >= 28) return 'hot and clear';
  if (t >= 18) return 'warm and pleasant';
  if (t >= 8) return 'cool';
  if (t >= 0) return 'cold';
  return 'freezing';
}

function iconFromTemp(t, precip) {
  if (precip > 2) return '10d';
  if (t >= 25) return '01d';
  if (t >= 15) return '02d';
  if (t >= 5) return '03d';
  return '13d';
}
