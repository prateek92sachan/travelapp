// Events / festivals enrichment — free, no API key, Wikipedia-sourced.
//
// Strategy: query a few likely Wikipedia article titles for the destination,
// then scan the lead extracts for sentences that mention the trip's month.
// We prefer "what happens here annually" content (festivals, seasonal events)
// over literal news, which is a better fit for a travel-planning use case
// and avoids the trap of returning unrelated political/disaster news.
//
// This will always return — never throws — so the UI degrades gracefully
// when no events are found.

import { fetchWikiSummary } from './wikipedia';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Fetch annual events / festivals likely to happen around a given date in
 * a destination. Returns array of { title, blurb, source } (possibly empty).
 *
 * @param {string} destination  e.g. "Tokyo"
 * @param {string} dateISO      e.g. "2026-05-10"
 */
export async function fetchAnnualEvents(destination, dateISO) {
  if (!destination || !dateISO) return [];
  const parsed = new Date(dateISO);
  const monthIdx = parsed.getUTCMonth();
  // Guard against malformed dateISO (NaN month) — bail out early.
  if (!Number.isInteger(monthIdx) || monthIdx < 0 || monthIdx > 11) return [];
  const monthName = MONTH_NAMES[monthIdx];
  const monthRegex = new RegExp(`\\b${monthName}\\b`, 'i');

  // Try a few likely Wikipedia article titles in parallel — the first
  // few that resolve to real pages give us source material to scan.
  const candidateTitles = [
    `Festivals in ${destination}`,
    `Tourism in ${destination}`,
    `Culture of ${destination}`,
    destination
  ];

  const results = await Promise.all(
    candidateTitles.map((t) => fetchWikiSummary(t))
  );

  const events = [];

  results.forEach((wiki, i) => {
    if (!wiki?.extract) return;
    // Split into sentences and surface ones that mention the trip month.
    // This is a heuristic — a sentence like "Sanja Matsuri is held in May"
    // is exactly what a traveler wants to see.
    const sentences = wiki.extract
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.length > 20);

    sentences.forEach((sentence) => {
      if (monthRegex.test(sentence)) {
        events.push({
          title: candidateTitles[i],
          blurb: sentence.trim(),
          source: wiki.url
        });
      }
    });
  });

  // De-duplicate near-identical blurbs and cap the list
  const seen = new Set();
  const unique = events.filter((e) => {
    const key = e.blurb.slice(0, 60).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return unique.slice(0, 4); // 4 max — keep widget compact
}
