import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5174';
const DEST = 'Tokyo, Japan';

test('Search here uses locationRestriction with zoomed-in bounds', async ({ page }) => {
  const requests = [];
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('places.googleapis.com/v1/places:searchText')) {
      let body = null;
      try { body = req.postDataJSON(); } catch {}
      requests.push({ at: Date.now(), body });
    }
  });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push('[console.error] ' + msg.text());
  });

  await page.goto(BASE);
  const input = page.locator('input[placeholder*="Where to"]');
  await input.click();
  await input.fill(DEST);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Plan trip/i }).first().click();
  await page.waitForURL(/dest=/, { timeout: 15000 });

  // Wait for map + initial places
  await page.waitForSelector('.viewport-pill', { timeout: 20000 });
  await page.waitForTimeout(4000); // let Phase 2 settle

  const initialCount = requests.length;
  console.log('\n=== Initial requests (Phase 1+2 city-wide) ===');
  console.log('count:', initialCount);
  for (const r of requests) {
    const restriction = r.body?.locationRestriction;
    const bias = r.body?.locationBias;
    console.log({
      textQuery: r.body?.textQuery,
      restriction: restriction ? 'rectangle' : null,
      biasCircleRadius: bias?.circle?.radius
    });
  }

  // Programmatically zoom in via google.maps API
  await page.evaluate(() => {
    const mapDiv = document.querySelector('.map-container [aria-roledescription="map"]')
      || document.querySelector('.map-container div[tabindex]');
    // Access map via internal — fallback: dispatch wheel events
    const el = document.querySelector('.gm-style')?.parentElement
      || document.querySelector('.map-container');
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Zoom in 4 steps via wheel
    for (let i = 0; i < 6; i++) {
      el.dispatchEvent(new WheelEvent('wheel', {
        clientX: cx, clientY: cy, deltaY: -300, bubbles: true, cancelable: true
      }));
    }
  });
  await page.waitForTimeout(1500); // wait for map idle

  const preClickCount = requests.length;

  // Click "Search here"
  const searchHere = page.getByRole('button', { name: /Search here/i }).first();
  await expect(searchHere).toBeVisible();
  await searchHere.click();
  await page.waitForTimeout(4000); // let 5 parallel fetches complete

  console.log('\n=== Search-here requests (after zoom) ===');
  console.log('total:', requests.length, 'new since zoom click:', requests.length - preClickCount);
  const newReqs = requests.slice(preClickCount);
  for (const r of newReqs) {
    const restriction = r.body?.locationRestriction?.rectangle;
    const bias = r.body?.locationBias?.circle;
    console.log({
      textQuery: r.body?.textQuery,
      mode: restriction ? 'RESTRICTION' : bias ? 'BIAS' : 'NONE',
      rectLow: restriction?.low,
      rectHigh: restriction?.high,
      biasCenter: bias?.center,
      biasRadius: bias?.radius
    });
  }

  if (errors.length) {
    console.log('\n=== Page errors ===');
    for (const e of errors) console.log(e);
  }

  // Assertions
  expect(newReqs.length).toBeGreaterThanOrEqual(5); // 5 categories
  for (const r of newReqs) {
    expect(r.body?.locationRestriction?.rectangle, 'must use rectangle restriction').toBeTruthy();
    expect(r.body?.locationBias).toBeFalsy();
  }
});
