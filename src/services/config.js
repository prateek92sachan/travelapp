// Central config — pulls keys from .env via Vite's import.meta.env
// All env vars must be prefixed with VITE_ to be exposed to the client.
export const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
export const GOOGLE_MAPS_MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || '';
export const OPENWEATHER_KEY = import.meta.env.VITE_OPENWEATHER_KEY;
export const GEMINI_KEY = import.meta.env.VITE_GEMINI_KEY;
export const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

export function assertKeys() {
  const missing = [];
  if (!GOOGLE_MAPS_KEY) missing.push('VITE_GOOGLE_MAPS_KEY');
  if (!OPENWEATHER_KEY) missing.push('VITE_OPENWEATHER_KEY');
  if (!GEMINI_KEY) missing.push('VITE_GEMINI_KEY');
  if (!MAPBOX_TOKEN) missing.push('VITE_MAPBOX_TOKEN');
  if (missing.length) {
    console.warn(
      `Missing env vars: ${missing.join(', ')}. ` +
      `Copy .env.example to .env and fill in your keys.`
    );
  }
}
