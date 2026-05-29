/**
 * Travel APP Cloud Functions.
 *
 * - getCostBreakdown — MTD Google billing split from BigQuery export.
 *   Auth: requires authenticated Firebase user. The runtime SA needs
 *   `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` on
 *   `prime-freedom-394504`.
 *
 * - geminiSearchPlace — Gemini 2.0 Flash + Google Search grounding.
 *   Auth required. Per-user daily rate cap (GEMINI_DAILY_CAP) backed by
 *   a Firestore doc at `users/<uid>/usage/<YYYY-MM-DD>` (field `gemini`).
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const { BigQuery } = require('@google-cloud/bigquery');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');

admin.initializeApp();

setGlobalOptions({
  region: 'us-central1',
  maxInstances: 5,
  memory: '256MiB',
  concurrency: 40,
  timeoutSeconds: 30
});

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');

const BILLING_PROJECT = 'prime-freedom-394504';
const BILLING_DATASET = 'travelapp';
const GEMINI_DAILY_CAP = 50;
const MAX_PLACE_LEN = 200;

const bq = new BigQuery({ projectId: BILLING_PROJECT });

let cachedTableId = null;

async function resolveBillingTable() {
  if (cachedTableId) return cachedTableId;
  const [tables] = await bq.dataset(BILLING_DATASET, { projectId: BILLING_PROJECT }).getTables();
  const detailed = tables.find((t) => t.id.startsWith('gcp_billing_export_resource_v1_'));
  const standard = tables.find((t) => t.id.startsWith('gcp_billing_export_v1_'));
  const chosen = detailed || standard;
  if (!chosen) return null;
  cachedTableId = chosen.id;
  return cachedTableId;
}

// Cache the MTD BQ result for 5 min in container memory so a refreshing
// dashboard doesn't scan the table every load.
let mtdCache = null;
async function fetchGoogleMtd() {
  if (mtdCache && Date.now() - mtdCache.ts < 5 * 60 * 1000) return mtdCache.value;

  const tableId = await resolveBillingTable();
  if (!tableId) {
    const empty = { calls: null, actual: null, error: 'no_billing_table' };
    return { google_places: empty, google_photos: empty, google_other: empty };
  }
  const fullTable = `\`${BILLING_PROJECT}.${BILLING_DATASET}.${tableId}\``;
  const sql = `
    SELECT
      service.description AS service_name,
      sku.description AS sku_name,
      SUM(cost) AS cost_amount,
      SUM(IFNULL(usage.amount, 0)) AS usage_amount,
      ANY_VALUE(usage.unit) AS usage_unit
    FROM ${fullTable}
    WHERE _PARTITIONTIME >= TIMESTAMP_TRUNC(CURRENT_TIMESTAMP(), MONTH)
      AND DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
      AND service.description IS NOT NULL
    GROUP BY service_name, sku_name
  `;
  const [rows] = await bq.query({ query: sql, location: 'US' });

  const buckets = {
    google_places: { calls: 0, actual: 0 },
    google_photos: { calls: 0, actual: 0 },
    google_other: { calls: 0, actual: 0 }
  };

  for (const r of rows) {
    const service = (r.service_name || '').toLowerCase();
    const sku = (r.sku_name || '').toLowerCase();
    const cost = Number(r.cost_amount) || 0;
    const usage = Number(r.usage_amount) || 0;
    const unit = (r.usage_unit || '').toLowerCase();
    const callCount = unit.includes('request') || unit === 'count' ? usage : 0;

    let key;
    if (sku.includes('photo') || sku.includes('place photo')) {
      key = 'google_photos';
    } else if (service.includes('places') || service.includes('maps')) {
      key = 'google_places';
    } else if (
      service.includes('geocoding') ||
      service.includes('directions') ||
      service.includes('routes')
    ) {
      key = 'google_other';
    } else {
      continue;
    }

    buckets[key].actual += cost;
    buckets[key].calls += callCount;
  }

  mtdCache = { ts: Date.now(), value: buckets };
  return buckets;
}

// Atomic per-uid daily counter. Returns the post-increment count;
// throws `resource-exhausted` once cap is reached.
async function incGeminiQuota(uid) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const ref = admin.firestore().doc(`users/${uid}/usage/${dayKey}`);
  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = snap.exists ? Number(snap.data()?.gemini || 0) : 0;
    if (current >= GEMINI_DAILY_CAP) {
      throw new HttpsError('resource-exhausted', 'Daily summary cap reached. Try again tomorrow.');
    }
    tx.set(ref, { gemini: current + 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return current + 1;
  });
}

const GEMINI_SUMMARY_SYSTEM = [
  'You are a warm, evocative travel writer with Google Search.',
  'Use the search tool to find current information about the named place, then write a short summary a tourist will love.',
  'Strict rules:',
  '- 40 to 50 words. Count carefully.',
  '- One paragraph, no headings, no bullet points, no quotation marks, no markdown.',
  '- Sensory, friendly tone. Hint at why a visitor would go.',
  '- Stay grounded in what the search results actually say. Do not invent facts.',
  '- If the search results do not contain enough information about this specific place, reply with exactly: NO_INFO',
  '- Do not start with the place name; weave it in naturally.',
  '- Do not write preambles like "Here is a summary".'
].join('\n');

exports.geminiSearchPlace = onCall(
  { cors: true, secrets: [GEMINI_API_KEY], timeoutSeconds: 60 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to generate summaries.');
    }
    const { name, destination } = request.data || {};
    if (typeof name !== 'string' || !name.trim()) {
      throw new HttpsError('invalid-argument', 'name is required.');
    }
    const trimmedName = name.trim().slice(0, MAX_PLACE_LEN);
    const trimmedDest = typeof destination === 'string'
      ? destination.trim().slice(0, MAX_PLACE_LEN)
      : '';
    const placeLabel = trimmedDest ? `${trimmedName} (in ${trimmedDest})` : trimmedName;

    await incGeminiQuota(request.auth.uid);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY.value() });
    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: `Find current information about this place and write the summary: ${placeLabel}`,
        config: {
          systemInstruction: GEMINI_SUMMARY_SYSTEM,
          tools: [{ googleSearch: {} }]
        }
      });
    } catch (err) {
      console.error('Gemini call failed', err);
      throw new HttpsError('internal', 'Summary service temporarily unavailable.');
    }

    const summary = (response.text || '').trim();
    if (!summary || summary === 'NO_INFO' || summary.includes('NO_INFO')) {
      return { summary: null, model: 'gemini-2.0-flash' };
    }

    return {
      summary,
      model: 'gemini-2.0-flash',
      usage: response.usageMetadata || null
    };
  }
);

exports.getCostBreakdown = onCall(
  { cors: true, timeoutSeconds: 20 },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to view cost data.');
    }

    let google;
    try {
      google = await fetchGoogleMtd();
    } catch (err) {
      console.error('BQ query failed', err);
      throw new HttpsError('internal', 'Billing data temporarily unavailable.');
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    return {
      month,
      generatedAt: now.toISOString(),
      ...google
    };
  }
);
