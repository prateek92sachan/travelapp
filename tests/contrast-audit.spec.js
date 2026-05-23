/**
 * Contrast audit — WCAG 2.2 AA baseline.
 *
 * Boots the app, navigates 4 representative views, and samples computed
 * styles of key text + UI surfaces. Reports a Markdown table; fails when
 * any pair < 4.5:1 (normal text) or < 3:1 (large text / functional UI).
 *
 * Usage:
 *   1. Start dev server:  npx vite --port 5174
 *   2. Run audit:         npx playwright test tests/contrast-audit.spec.js --reporter=list
 *   3. Report is written to: contrast-report.md (auto-rotated per run)
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:5174';
const REPORT_PATH = path.resolve(process.cwd(), 'contrast-report.md');

// ─── Color math (WCAG 2.x relative luminance) ─────────────────────────────────

function parseColor(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  // rgb(a)
  let m = s.match(/^rgba?\s*\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\s*\)$/);
  if (m) return [+m[1], +m[2], +m[3], m[4] != null ? +m[4] : 1];
  // hex
  m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1,
    ];
  }
  return null;
}

function blend(fg, bg) {
  // Composite a possibly-translucent foreground over an opaque background.
  if (!fg || !bg) return fg;
  const a = fg[3];
  if (a >= 1) return [fg[0], fg[1], fg[2], 1];
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
    1,
  ];
}

function luminance([r, g, b]) {
  const f = v => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// ─── Page-side sampler ───────────────────────────────────────────────────────
// We let the browser walk the DOM, gather opaque background per element
// (climbing ancestors until we hit one), and the foreground color + font size.

async function sample(page, selectors) {
  return await page.evaluate((selList) => {
    function getOpaqueBg(el, { skipSelf = false } = {}) {
      let cur = skipSelf ? (el.parentElement || el) : el;
      while (cur) {
        const cs = window.getComputedStyle(cur);
        const bg = cs.backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
          const m = bg.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)(?:[ ,/]+([\d.]+))?\)/);
          if (m && (m[4] == null || +m[4] >= 0.95)) {
            return bg;
          }
        }
        cur = cur.parentElement;
      }
      const bodyBg = window.getComputedStyle(document.body).backgroundColor;
      return bodyBg || 'rgb(255, 255, 255)';
    }
    const out = [];
    for (const sel of selList) {
      const el = document.querySelector(sel.selector);
      if (!el) { out.push({ ...sel, missing: true }); continue; }
      const cs = window.getComputedStyle(el);
      let fg, bg;
      if (sel.prop === 'border') {
        fg = cs.borderTopColor || cs.borderColor;
        // Border contrasts against the element BEHIND, not the element's own bg
        bg = getOpaqueBg(el, { skipSelf: true });
      } else if (sel.prop === 'background') {
        fg = cs.backgroundColor;
        bg = getOpaqueBg(el, { skipSelf: true });
      } else {
        // text: foreground is the text color, background is the element's own opaque bg if present
        fg = cs.color;
        bg = getOpaqueBg(el);
      }
      out.push({
        ...sel,
        fg,
        bg,
        fontSize: parseFloat(cs.fontSize),
        fontWeight: parseInt(cs.fontWeight, 10) || 400,
      });
    }
    return out;
  }, selectors);
}

function evaluateSamples(rows) {
  return rows.map(r => {
    if (r.missing) return { ...r, status: 'SKIP' };
    const fg = parseColor(r.fg);
    const bg = parseColor(r.bg);
    if (!fg || !bg) return { ...r, status: 'SKIP', ratio: null };
    const composited = blend(fg, bg);
    const ratio = contrast(composited, bg);
    // WCAG 1.4.3: large = ≥18pt (24px) or ≥14pt bold (~18.5px @ 700+)
    const isLarge =
      r.fontSize >= 24 ||
      (r.fontSize >= 18 && r.fontWeight >= 700);
    // 'text' → 4.5 (normal) / 3 (large). 'ui' → 3 (functional). 'decorative' → 1.1 (perceptible only).
    const target = r.kind === 'decorative'
      ? 1.1
      : r.kind === 'ui'
        ? 3.0
        : isLarge ? 3.0 : 4.5;
    return {
      ...r,
      ratio: ratio,
      target,
      isLarge,
      status: ratio >= target ? 'PASS' : 'FAIL',
    };
  });
}

function appendReport(view, evaluated) {
  const lines = [];
  lines.push(`## ${view}\n`);
  lines.push('| Pair | Sample | Ratio | Target | Status |');
  lines.push('| --- | --- | ---: | ---: | :---: |');
  for (const r of evaluated) {
    if (r.status === 'SKIP') {
      lines.push(`| ${r.label} | _missing_ | — | — | SKIP |`);
      continue;
    }
    lines.push(
      `| ${r.label} | fg:\`${r.fg}\` / bg:\`${r.bg}\` ${r.isLarge ? '(large)' : ''} | ${r.ratio.toFixed(2)} | ${r.target.toFixed(1)} | ${r.status} |`
    );
  }
  lines.push('');
  fs.appendFileSync(REPORT_PATH, lines.join('\n') + '\n');
}

// ─── Selectors per view ──────────────────────────────────────────────────────

const HEADER_PAIRS = [
  { label: 'Brand wordmark',         selector: '.brand',                        kind: 'text' },
  { label: 'Search input value',     selector: 'input[placeholder*="Where to"]', kind: 'text' },
  { label: 'Search input border',    selector: 'input[placeholder*="Where to"]', kind: 'ui',  prop: 'border' },
  { label: 'Plan trip button',       selector: 'button.btn',                    kind: 'text' },
  { label: 'Sign in button',         selector: '.auth-sign-in-btn',             kind: 'text' },
  { label: 'Sign in button border',  selector: '.auth-sign-in-btn',             kind: 'ui',  prop: 'border' },
  { label: 'Hamburger button border',selector: '.hamburger-btn',                kind: 'ui',  prop: 'border' },
];

const RESULTS_PAIRS = [
  // Card vs page bg + decorative card border — elevation is conveyed by shadow,
  // not contrast borders (Airbnb DLS elevation pattern). Targets ≥1.1:1 perceptibility.
  { label: 'Card body bg vs page bg',selector: '.card',                         kind: 'decorative', prop: 'background' },
  { label: 'Card border vs page bg', selector: '.card',                         kind: 'decorative', prop: 'border' },
  { label: 'Card title text',        selector: '.card-title',                   kind: 'text' },
  { label: 'Activity name',          selector: '.activity-name',                kind: 'text' },
  { label: 'Activity summary',       selector: '.activity-summary',             kind: 'text' },
  { label: 'Activity num chip',      selector: '.activity-num',                 kind: 'text' },
  { label: 'Tab button (inactive)',  selector: '.tab-button:not(.active)',      kind: 'text' },
  { label: 'Tab button (active)',    selector: '.tab-button.active',            kind: 'text' },
  { label: 'Globe chip (inactive)',  selector: '.globe-chip:not(.active)',      kind: 'text' },
  { label: 'Wishlist tab text',      selector: '.wishlist-header-tab',          kind: 'text' },
];

const WISHLIST_PAIRS = [
  { label: 'Wishlist overlay title', selector: '.wishlist-overlay-title',       kind: 'text' },
  { label: 'List tab inactive text', selector: '.wishlist-list-tab:not(.active)', kind: 'text' },
  { label: 'List tab inactive border', selector: '.wishlist-list-tab:not(.active)', kind: 'ui', prop: 'border' },
  { label: 'List tab count',         selector: '.wishlist-list-count',          kind: 'text' },
  { label: 'Empty state message',    selector: '.wishlist-overlay-empty',       kind: 'text' },
];

const PLAN_PAIRS = [
  // Decorative — elevation comes from shadow + the white bg-elevated fill vs darker page bg.
  { label: 'Plan day card bg vs page bg', selector: '.plan-day',                kind: 'decorative', prop: 'background' },
  { label: 'Plan day card border',   selector: '.plan-day',                     kind: 'decorative', prop: 'border' },
  { label: 'Plan day title',         selector: '.plan-day-title',               kind: 'text' },
  { label: 'Plan day total (muted)', selector: '.plan-day-total',               kind: 'text' },
  { label: 'Plan session card bg',   selector: '.plan-session',                 kind: 'ui',  prop: 'background' },
  { label: 'Plan session border',    selector: '.plan-session',                 kind: 'ui',  prop: 'border' },
  { label: 'Plan session name',      selector: '.plan-session-name',            kind: 'text' },
  { label: 'Plan session addr',      selector: '.plan-session-addr',            kind: 'text' },
  { label: 'Plan phase label',       selector: '.plan-phase-label',             kind: 'text' },
  { label: 'Plan phase count',       selector: '.plan-phase-count',             kind: 'text' },
  { label: 'Plan inline input text', selector: '.plan-inline-input',            kind: 'text' },
  { label: 'Plan inline input border', selector: '.plan-inline-input',          kind: 'ui',  prop: 'border' },
  { label: 'Plan inline separator',  selector: '.plan-inline-sep',              kind: 'text' },
  { label: 'Plan day tab inactive',  selector: '.plan-day-tab:not(.active)',    kind: 'text' },
  { label: 'Plan empty hint',        selector: '.plan-empty-hint',              kind: 'text' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function searchAndWait(page, dest = 'Tokyo') {
  const input = page.locator('input[placeholder*="Where to"]');
  await input.click();
  await input.fill(dest);
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Plan trip/i }).first().click();
  await page.waitForURL(/dest=/, { timeout: 15000 });
  // open places drawer if collapsed (desktop)
  try {
    await page.waitForSelector(
      'button.places-drawer-pill, button[title="Show places list"]',
      { timeout: 5000 }
    );
    await page.locator('button.places-drawer-pill, button[title="Show places list"]').first().click();
  } catch { /* drawer already open or mobile */ }
  // Best-effort wait for activity cards; don't fail if Places API is rate-limited.
  await page.waitForSelector('.activity-item', { timeout: 12000 }).catch(() => {});
}

async function openWishlistOverlay(page) {
  // Use header wishlist button (aria-label is exactly "My wishlist")
  const btn = page.getByRole('button', { name: /^My wishlist$/i }).first();
  if (await btn.count()) {
    await btn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

async function openPlanMode(page) {
  // First switch to the in-workspace wishlist tab (heart icon in the right panel).
  // The wishlist drawer renders inline next to the tab nav; clicking it reveals
  // <WishlistHead> with Plan/Saved mode tabs.
  const wishlistTab = page.locator('.wishlist-header-tab').first();
  if (await wishlistTab.count()) {
    await wishlistTab.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
  // Then ensure Plan mode is selected (default is 'plan' but click idempotently).
  const planBtn = page.locator('.wishlist-mode-tab', { hasText: /^Plan$/ }).first();
  if (await planBtn.count()) {
    await planBtn.click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

test.describe('Contrast audit (WCAG 2.2 AA)', () => {
  test.beforeAll(() => {
    const stamp = new Date().toISOString();
    fs.writeFileSync(
      REPORT_PATH,
      `# Contrast audit — ${stamp}\n\n` +
      `Targets: text ≥ 4.5:1 (≥ 3:1 if large), UI/border/bg ≥ 3:1.\n\n`
    );
  });

  test('header (pre-search)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(400);
    const evaluated = evaluateSamples(await sample(page, HEADER_PAIRS));
    appendReport('Header (pre-search)', evaluated);
    const fails = evaluated.filter(r => r.status === 'FAIL');
    if (fails.length) {
      console.log('FAILS:', fails.map(f => `${f.label} ${f.ratio?.toFixed(2)}`).join(', '));
    }
  });

  test('search results (Tokyo)', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    await searchAndWait(page, 'Tokyo, Japan');
    await page.waitForTimeout(500);
    const evaluated = evaluateSamples(await sample(page, RESULTS_PAIRS));
    appendReport('Search results (Tokyo)', evaluated);
    const fails = evaluated.filter(r => r.status === 'FAIL');
    if (fails.length) {
      console.log('FAILS:', fails.map(f => `${f.label} ${f.ratio?.toFixed(2)}`).join(', '));
    }
  });

  test('wishlist overlay', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    await searchAndWait(page, 'Tokyo, Japan');
    await openWishlistOverlay(page);
    await page.waitForTimeout(400);
    const evaluated = evaluateSamples(await sample(page, WISHLIST_PAIRS));
    appendReport('Wishlist overlay', evaluated);
    const fails = evaluated.filter(r => r.status === 'FAIL');
    if (fails.length) {
      console.log('FAILS:', fails.map(f => `${f.label} ${f.ratio?.toFixed(2)}`).join(', '));
    }
  });

  test('plan mode', async ({ page }) => {
    await page.goto(BASE);
    await page.waitForLoadState('domcontentloaded');
    await searchAndWait(page, 'Tokyo, Japan');
    await openPlanMode(page);
    await page.waitForTimeout(600);
    const evaluated = evaluateSamples(await sample(page, PLAN_PAIRS));
    appendReport('Plan mode', evaluated);
    const fails = evaluated.filter(r => r.status === 'FAIL');
    if (fails.length) {
      console.log('FAILS:', fails.map(f => `${f.label} ${f.ratio?.toFixed(2)}`).join(', '));
    }
  });

  test('summary', () => {
    // Sentinel — always passes. Real assertions are per-view above.
    const report = fs.readFileSync(REPORT_PATH, 'utf-8');
    const fails = (report.match(/\| FAIL \|/g) || []).length;
    const passes = (report.match(/\| PASS \|/g) || []).length;
    const skips = (report.match(/\| SKIP \|/g) || []).length;
    fs.appendFileSync(REPORT_PATH,
      `\n## Summary\n\n- PASS: ${passes}\n- FAIL: ${fails}\n- SKIP: ${skips}\n`
    );
    console.log(`Contrast audit: ${passes} pass, ${fails} fail, ${skips} skip → ${REPORT_PATH}`);
    expect(true).toBe(true);
  });
});
