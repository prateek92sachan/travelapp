import { GEMINI_KEY } from './config';

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const DESC_CACHE = new Map();

/**
 * Generate a 200-250 word description for a place using Gemini.
 * Returns the text string or null (no key, API error, etc.).
 * Cached per placeId for the session.
 */
export async function fetchPlaceDescription(place) {
  if (!GEMINI_KEY) {
    console.warn('[Gemini] VITE_GEMINI_KEY not set — skipping description');
    return null;
  }

  const { placeId, name, address, types, rating, reviewCount } = place;
  if (DESC_CACHE.has(placeId)) return DESC_CACHE.get(placeId);

  const typeStr = (types || [])
    .filter((t) => !['point_of_interest', 'establishment'].includes(t))
    .slice(0, 3)
    .map((t) => t.replace(/_/g, ' '))
    .join(', ');

  const ratingPart = rating ? `, rated ${rating}/5 with ${reviewCount || 0} reviews` : '';
  const typePart = typeStr ? ` (${typeStr})` : '';
  const addrPart = address ? ` located at ${address}` : '';

  const prompt =
    `Write a 100-150 word description of ${name}${addrPart}${typePart}${ratingPart}. ` +
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
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
    if (text) DESC_CACHE.set(placeId, text);
    return text;
  } catch (err) {
    console.error('[Gemini] fetch failed', err);
    return null;
  }
}
