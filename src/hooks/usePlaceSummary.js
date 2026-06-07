// usePlaceSummary — 40-50 word tourist summary for places that lack a
// Wikipedia article. Calls Gemini 2.0 Flash + Google Search grounding via
// the `geminiSearchPlace` Cloud Function. Wiki-backed places skip the bot
// entirely (the card already shows their extract directly).
//
// Cache:
//   Positive — forever per placeId in `travelapp:place-summary:<placeId>`
//   Negative — 24h per placeId in `travelapp:place-summary:neg:<placeId>`
//
// States:
//   idle    — preconditions not met (Wiki present, no user, fresh neg cache)
//   loading — Gemini call in flight
//   ready   — summary available (from cache or fresh call)
//   error   — call failed; retry() clears neg cache + re-fires

import { useCallback, useEffect, useState } from 'react';
import { callable } from '../services/firebase';
import { useAuth } from './useAuth';
import { useSearchStore } from '../stores/searchStore';
import { increment as usageInc } from '../utils/usageCounter';

const CACHE_PREFIX = 'travelapp:place-summary:';
const NEG_CACHE_PREFIX = 'travelapp:place-summary:neg:';
const NEG_TTL_MS = 24 * 60 * 60 * 1000;

function readCache(placeId) {
  if (!placeId) return null;
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + placeId);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return typeof obj?.summary === 'string' ? obj.summary : null;
  } catch {
    return null;
  }
}

function writeCache(placeId, summary) {
  if (!placeId || !summary) return;
  try {
    localStorage.setItem(
      CACHE_PREFIX + placeId,
      JSON.stringify({ summary, ts: Date.now() })
    );
  } catch { /* ignore quota */ }
}

function readNegCache(placeId) {
  if (!placeId) return false;
  try {
    const raw = localStorage.getItem(NEG_CACHE_PREFIX + placeId);
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return typeof obj?.ts === 'number' && Date.now() - obj.ts < NEG_TTL_MS;
  } catch {
    return false;
  }
}

function writeNegCache(placeId) {
  if (!placeId) return;
  try { localStorage.setItem(NEG_CACHE_PREFIX + placeId, JSON.stringify({ ts: Date.now() })); } catch { /* ignore */ }
}

function clearNegCache(placeId) {
  if (!placeId) return;
  try { localStorage.removeItem(NEG_CACHE_PREFIX + placeId); } catch { /* ignore */ }
}

export function usePlaceSummary(placeId, name, hasWiki) {
  const { user } = useAuth();
  const destination = useSearchStore((s) => s.destination);
  const [summary, setSummary] = useState(() => readCache(placeId));
  const [state, setState] = useState(() => (readCache(placeId) ? 'ready' : 'idle'));
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    clearNegCache(placeId);
    setAttempt((n) => n + 1);
  }, [placeId]);

  useEffect(() => {
    if (!placeId) { setSummary(null); setState('idle'); return undefined; }

    const cached = readCache(placeId);
    if (cached) { setSummary(cached); setState('ready'); return undefined; }

    // Wiki present → card renders Wiki extract directly, no bot needed.
    if (hasWiki) { setSummary(null); setState('idle'); return undefined; }

    if (!user || !name) { setSummary(null); setState('idle'); return undefined; }

    // Fresh negative cache and user hasn't asked for a retry → stay idle.
    if (readNegCache(placeId) && attempt === 0) {
      setSummary(null); setState('idle'); return undefined;
    }

    let cancelled = false;
    setState('loading');
    setSummary(null);

    callable('geminiSearchPlace')({ name, destination })
      .then((res) => {
        if (cancelled) return;
        const out = res?.data?.summary;
        if (!out) {
          writeNegCache(placeId);
          setState('error');
          return;
        }
        writeCache(placeId, out);
        usageInc('gemini');
        setSummary(out);
        setState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        writeNegCache(placeId);
        setState('error');
      });

    return () => { cancelled = true; };
  }, [placeId, name, hasWiki, user, destination, attempt]);

  return { summary, state, retry };
}
