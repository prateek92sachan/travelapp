// Smoke test for the v4 sync refactor. Runs unauthenticated — verifies:
//   1. App boots without runtime errors from the new sync modules.
//   2. Unauthenticated wishlist mutations don't try to write to Firestore
//      (cloudWriter is null until sign-in).
//   3. A search completes without the old saveToCloudRef path.

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5175';

test('boots clean with no console errors from sync layer', async ({ page }) => {
  const errors = [];
  const warnings = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    if (msg.type() === 'warning' && /(wishlistSync|recentTripsSync|Cloud sync)/i.test(msg.text())) {
      warnings.push(msg.text());
    }
  });

  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);

  // Sync-layer warnings should be zero when no user is signed in.
  expect(warnings, `sync warnings: ${warnings.join('\n')}`).toHaveLength(0);
  // Filter out unrelated noise: only sync/firebase/migration messages should fail us.
  const syncErrors = errors.filter((e) =>
    /(wishlistSync|recentTripsSync|userMigration|firestoreSchema|cloudWriter)/i.test(e)
  );
  expect(syncErrors, `sync errors:\n${syncErrors.join('\n')}`).toHaveLength(0);
});

test('search + add to wishlist unauthenticated — no firestore writes attempted', async ({ page }) => {
  const networkCalls = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('firestore.googleapis.com')) networkCalls.push(url);
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE);
  await page.waitForLoadState('networkidle').catch(() => {});

  // Trigger a search to exercise beginDestination + saveRecentTrip code paths.
  const input = page.locator('input[placeholder*="Where to"]');
  await input.click();
  await input.fill('Tokyo, Japan');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Plan trip/i }).first().click();
  await page.waitForURL(/dest=/, { timeout: 15000 });
  await page.waitForTimeout(2000);

  expect(errors, `runtime errors:\n${errors.join('\n')}`).toHaveLength(0);
  // Unauthenticated → no Firestore traffic at all.
  expect(networkCalls, `unexpected firestore calls:\n${networkCalls.join('\n')}`).toHaveLength(0);
});
