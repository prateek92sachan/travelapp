/**
 * getCostBreakdown — month-to-date cost split for Travel APP Google services.
 *
 * Data source: BigQuery billing export (detailed) on the
 * `prime-freedom-394504.travelapp` dataset. Mapbox is tracked client-side
 * via localStorage counter since Mapbox does not expose a public usage REST
 * API.
 *
 * Returned shape (all USD):
 *   {
 *     month: '2026-05',
 *     google_places:  { calls, actual },
 *     google_photos:  { calls, actual },
 *     google_other:   { calls, actual }
 *   }
 *
 * Auth: requires authenticated Firebase user. The Functions runtime SA needs
 * `roles/bigquery.dataViewer` + `roles/bigquery.jobUser` on
 * `prime-freedom-394504`.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { BigQuery } = require('@google-cloud/bigquery');

setGlobalOptions({ region: 'us-central1', maxInstances: 5 });

const BILLING_PROJECT = 'prime-freedom-394504';
const BILLING_DATASET = 'travelapp';

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

async function fetchGoogleMtd() {
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
    WHERE DATE(usage_start_time) >= DATE_TRUNC(CURRENT_DATE(), MONTH)
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

  return buckets;
}

exports.getCostBreakdown = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in to view cost data.');
    }

    let google;
    try {
      google = await fetchGoogleMtd();
    } catch (err) {
      console.error('BQ query failed', err);
      throw new HttpsError('internal', `BigQuery failed: ${err.message}`);
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
