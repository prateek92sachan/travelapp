import { GEMINI_KEY } from './config';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';

const DESC_CACHE = new Map();
const DESC_TTL_MS = 30 * 60 * 1000; // 30 min

export async function fetchPlaceDescription(place) {
  if (!GEMINI_KEY) return null;

  const { placeId, name, types } = place;

  // Evict stale entries; cap at 100 to bound memory
  const now = Date.now();
  if (DESC_CACHE.size >= 100) {
    for (const [k, v] of DESC_CACHE) {
      if (now - v.ts > DESC_TTL_MS) DESC_CACHE.delete(k);
      if (DESC_CACHE.size < 100) break;
    }
    if (DESC_CACHE.size >= 100) DESC_CACHE.delete(DESC_CACHE.keys().next().value);
  }

  const cached = DESC_CACHE.get(placeId);
  if (cached && now - cached.ts < DESC_TTL_MS) return cached.text;

  const typeStr = (types || [])
    .filter((t) => !['point_of_interest', 'establishment'].includes(t))
    .slice(0, 3)
    .map((t) => t.replace(/_/g, ' '))
    .join(', ');

  const typePart = typeStr ? ` (${typeStr})` : '';

  const prompt =
    `Write a 100-150 word description of ${name}${typePart}. ` +
    `What makes it special and what to expect. Travel guide tone, flowing prose, no headers or bullets.`;

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) {
      const errBody = await res.text();
      console.error('[Gemini] API error', res.status, errBody);
      return null;
    }
    let data;
    try { data = await res.json(); } catch (err) { console.error('[Gemini] JSON parse failed', err); return null; }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    if (text) DESC_CACHE.set(placeId, { text, ts: Date.now() });
    return text;
  } catch (err) {
    console.error('[Gemini] fetch failed', err);
    return null;
  }
}
