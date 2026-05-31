// fetch wrapper with exponential backoff for transient failures.
//
// Retries ONLY on 429 (rate limit) and 5xx (server error) — neither of which
// bills a Google Places/Geocoding request — plus network errors. Never retries
// 4xx (client errors, e.g. bad key/quota-exceeded) or aborts (timeout/cancel),
// so the caller's AbortController still bounds total time. Returns the Response
// (success or final non-retryable status); throws on abort/network exhaustion.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchWithRetry(url, options = {}, { retries = 2, baseDelayMs = 400 } = {}) {
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (err) {
      // Abort (timeout/cancel) is final; network error retries while budget lasts.
      if (err?.name === 'AbortError' || attempt >= retries) throw err;
      await sleep(baseDelayMs * 2 ** attempt);
      attempt += 1;
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < retries) {
      await sleep(baseDelayMs * 2 ** attempt);
      attempt += 1;
      continue;
    }
    return res;
  }
}
