import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const outDir = path.resolve('docs/ui-reference');
const baseUrl = 'http://localhost:5173';
const viewport = { width: 1280, height: 720 };

await fs.mkdir(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function pngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    mime: 'image/png'
  };
}

async function shot(page, name) {
  const rawPath = path.join(outDir, `${name}.raw.png`);
  await page.screenshot({ path: rawPath, fullPage: false });
  const bytes = await fs.readFile(rawPath);
  return { rawPath, bytes, ...pngSize(bytes) };
}

async function annotate(name, image, callouts) {
  const b64 = image.bytes.toString('base64');
  const overlay = callouts
    .map((c) => {
      const color = c.color || '#ff385c';
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      const w = Math.round(c.w);
      const h = Math.round(c.h);
      const lx = Math.round(c.lx ?? Math.min(image.width - 270, x + w + 14));
      const ly = Math.round(c.ly ?? Math.max(16, y - 4));
      const boxW = Math.round(c.boxW || Math.min(280, Math.max(142, c.label.length * 7 + 48)));
      const label = `${c.id}. ${c.label}`;
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="none" stroke="${color}" stroke-width="3"/>
        <line x1="${x + w}" y1="${y + Math.min(h, 24)}" x2="${lx}" y2="${ly + 17}" stroke="${color}" stroke-width="2"/>
        <rect x="${lx}" y="${ly}" width="${boxW}" height="34" rx="17" fill="${color}" opacity="0.96"/>
        <text x="${lx + 13}" y="${ly + 22}" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="14" font-weight="700">${esc(label)}</text>`;
    })
    .join('\n');
  const legend = callouts.map((c) => `${c.id}: ${c.label}`).join(' | ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${image.width}" height="${image.height}" viewBox="0 0 ${image.width} ${image.height}">
    <image href="data:image/png;base64,${b64}" width="${image.width}" height="${image.height}"/>
    ${overlay}
    <rect x="14" y="${image.height - 42}" width="${image.width - 28}" height="28" rx="14" fill="rgba(0,0,0,0.62)"/>
    <text x="28" y="${image.height - 23}" fill="#fff" font-family="Inter, Arial, sans-serif" font-size="12">${esc(legend)}</text>
  </svg>`;
  await fs.writeFile(path.join(outDir, `${name}.annotated.svg`), svg, 'utf8');
}

async function renderAnnotatedPng(page, name) {
  const svgPath = path.join(outDir, `${name}.annotated.svg`);
  const pngPath = path.join(outDir, `${name}.annotated.png`);
  await page.goto(`file:///${svgPath.replace(/\\/g, '/')}`, { waitUntil: 'load' });
  await page.screenshot({ path: pngPath, fullPage: false });
}

async function maybeClick(page, selector) {
  const locator = page.locator(selector);
  if ((await locator.count()) > 0) {
    await locator.first().click();
    return true;
  }
  return false;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport });
const page = await context.newPage();

page.setDefaultTimeout(30_000);

const tokyoGeo = {
  lat: 35.6762,
  lng: 139.6503,
  viewportNE: { lat: 35.82, lng: 139.9 },
  viewportSW: { lat: 35.52, lng: 139.45 }
};

const tinySvg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#f7f7f7"/><circle cx="300" cy="200" r="92" fill="#ff385c" opacity=".14"/><text x="300" y="210" text-anchor="middle" font-family="Arial" font-size="28" fill="#222">Tokyo</text></svg>';

function place(id, name, lat, lng, types, rating = 4.6, reviews = 1200) {
  return {
    id,
    displayName: { text: name },
    formattedAddress: `${name}, Tokyo, Japan`,
    location: { latitude: lat, longitude: lng },
    rating,
    userRatingCount: reviews,
    types,
    photos: [{ name: `places/${id}/photos/1` }]
  };
}

const mockPlaces = {
  activities: [
    place('act-sensoji', 'Senso-ji Temple', 35.7148, 139.7967, ['tourist_attraction', 'place_of_worship'], 4.5, 76000),
    place('act-skytree', 'Tokyo Skytree', 35.71, 139.8107, ['tourist_attraction', 'observation_deck'], 4.4, 82000),
    place('act-meiji', 'Meiji Jingu', 35.6764, 139.6993, ['tourist_attraction', 'shrine'], 4.6, 39000)
  ],
  restaurants: [
    place('res-ramen', 'Tokyo Ramen Street', 35.6811, 139.7671, ['restaurant'], 4.3, 9800),
    place('res-sushi', 'Sushi Zanmai Tsukiji', 35.6655, 139.7707, ['restaurant'], 4.2, 7600)
  ],
  nature: [
    place('nat-shinjuku', 'Shinjuku Gyoen', 35.6852, 139.7101, ['park', 'tourist_attraction'], 4.6, 39000),
    place('nat-ueno', 'Ueno Park', 35.7156, 139.7745, ['park', 'tourist_attraction'], 4.3, 29000)
  ],
  gems: [
    place('gem-yanaka', 'Yanaka Ginza', 35.7277, 139.7672, ['tourist_attraction'], 4.4, 1800),
    place('gem-kagurazaka', 'Kagurazaka Alleys', 35.7013, 139.7423, ['tourist_attraction'], 4.5, 1100)
  ],
  hotels: [
    place('hotel-station', 'Tokyo Station Hotel', 35.6813, 139.7658, ['lodging', 'hotel'], 4.6, 3300),
    place('hotel-park', 'Park Hotel Tokyo', 35.6631, 139.7596, ['lodging', 'hotel'], 4.5, 4100)
  ]
};

function categoryFromQuery(query = '') {
  const q = query.toLowerCase();
  if (q.includes('restaurant')) return 'restaurants';
  if (q.includes('natural') || q.includes('park') || q.includes('scenic')) return 'nature';
  if (q.includes('hidden') || q.includes('lesser')) return 'gems';
  if (q.includes('hotel') || q.includes('resort')) return 'hotels';
  return 'activities';
}

await page.route('https://maps.googleapis.com/maps/api/geocode/json**', async (route) => {
  const url = new URL(route.request().url());
  const isReverse = url.searchParams.has('latlng');
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'OK',
      results: [
        isReverse
          ? {
              address_components: [{ long_name: 'Tokyo', types: ['locality'] }],
              formatted_address: 'Tokyo, Japan',
              geometry: { location: { lat: tokyoGeo.lat, lng: tokyoGeo.lng } },
              place_id: 'geo-tokyo',
              types: ['locality']
            }
          : {
              formatted_address: 'Tokyo, Japan',
              geometry: {
                location: { lat: tokyoGeo.lat, lng: tokyoGeo.lng },
                viewport: {
                  northeast: { lat: tokyoGeo.viewportNE.lat, lng: tokyoGeo.viewportNE.lng },
                  southwest: { lat: tokyoGeo.viewportSW.lat, lng: tokyoGeo.viewportSW.lng }
                }
              },
              place_id: 'geo-tokyo',
              types: ['locality', 'political']
            }
      ]
    })
  });
});

await page.route('https://places.googleapis.com/v1/places:autocomplete', async (route) => {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      suggestions: [
        {
          placePrediction: {
            placeId: 'geo-tokyo',
            text: { text: 'Tokyo, Japan' },
            structuredFormat: {
              mainText: { text: 'Tokyo' },
              secondaryText: { text: 'Japan' }
            },
            types: ['locality']
          }
        }
      ]
    })
  });
});

await page.route('https://places.googleapis.com/v1/places:searchText', async (route) => {
  const body = route.request().postDataJSON();
  const category = categoryFromQuery(body?.textQuery);
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ places: mockPlaces[category] || mockPlaces.activities })
  });
});

await page.route(/https:\/\/places\.googleapis\.com\/v1\/places\/[^/]+$/, async (route) => {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      currentOpeningHours: {
        openNow: true,
        weekdayDescriptions: ['Monday: 9:00 AM - 7:00 PM', 'Tuesday: 9:00 AM - 7:00 PM']
      },
      internationalPhoneNumber: '+81 3-0000-0000',
      websiteUri: 'https://example.com/tokyo',
      priceLevel: 'PRICE_LEVEL_MODERATE',
      editorialSummary: { text: 'A memorable Tokyo stop with strong local character and easy access from central neighborhoods.' },
      reviews: [
        { authorAttribution: { displayName: 'Traveler' }, rating: 5, text: { text: 'Beautiful, easy to reach, and worth lingering around.' }, relativePublishTimeDescription: '2 weeks ago' }
      ],
      photos: [{ name: 'places/detail/photos/1' }, { name: 'places/detail/photos/2' }]
    })
  });
});

await page.route(/https:\/\/places\.googleapis\.com\/v1\/places\/.*\/media.*/, async (route) => {
  await route.fulfill({ contentType: 'image/svg+xml', body: tinySvg });
});

await page.route('https://api.openweathermap.org/**', async (route) => {
  const slots = ['2026-05-20', '2026-05-21'].flatMap((date) =>
    ['09:00:00', '12:00:00', '15:00:00'].map((time, i) => ({
      dt_txt: `${date} ${time}`,
      main: { temp: 22 + i, feels_like: 23 + i, humidity: 62 },
      wind: { speed: 3.2 },
      weather: [{ description: 'clear sky', icon: '01d', main: 'Clear' }],
      rain: {}
    }))
  );
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ list: slots }) });
});

await page.route('https://archive-api.open-meteo.com/**', async (route) => {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      daily: {
        temperature_2m_max: [24],
        temperature_2m_min: [16],
        temperature_2m_mean: [20],
        precipitation_sum: [1.2],
        wind_speed_10m_max: [14]
      },
      hourly: { relative_humidity_2m: [60, 62, 64, 61] }
    })
  });
});

await page.route('https://en.wikipedia.org/**', async (route) => {
  if (route.request().url().includes('opensearch')) {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(['Tokyo', ['Tokyo'], ['Capital of Japan'], ['https://en.wikipedia.org/wiki/Tokyo']])
    });
    return;
  }
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      extract: "Tokyo is Japan's capital and a major travel destination. In May, several local festivals and garden events make the city especially lively.",
      content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Tokyo' } },
      thumbnail: { source: '' }
    })
  });
});

await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
  await route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text: 'This Tokyo stop blends landmark energy with a sense of local rhythm. Expect layered streets, photogenic corners, and a steady mix of visitors and residents moving through the area.'
              }
            ]
          }
        }
      ]
    })
  });
});

await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
await sleep(2500);

const s1 = await shot(page, '01-empty-state');
await annotate('01-empty-state', s1, [
  { id: 'E1', label: 'Header / global actions', x: 0, y: 0, w: s1.width, h: 76, lx: 18, ly: 88 },
  { id: 'E2', label: 'Destination search form', x: s1.width * 0.22, y: 14, w: s1.width * 0.42, h: 48, lx: s1.width * 0.26, ly: 88 },
  { id: 'E3', label: 'Empty globe canvas', x: s1.width * 0.18, y: 118, w: s1.width * 0.64, h: s1.height * 0.7, lx: s1.width * 0.5, ly: 105 },
  { id: 'E4', label: 'Theme/share/wishlist/auth', x: s1.width - 330, y: 8, w: 320, h: 58, lx: s1.width - 440, ly: 88 }
]);

await page.locator('input[placeholder*="Where to"]').fill('Tok');
await sleep(1200);
const s2 = await shot(page, '02-search-autocomplete');
await annotate('02-search-autocomplete', s2, [
  { id: 'S1', label: 'Typed query', x: s2.width * 0.22, y: 14, w: s2.width * 0.28, h: 48, lx: s2.width * 0.18, ly: 94 },
  { id: 'S2', label: 'Autocomplete / recent list', x: s2.width * 0.2, y: 70, w: s2.width * 0.38, h: Math.min(360, s2.height - 120), lx: s2.width * 0.51, ly: 118 },
  { id: 'S3', label: 'Date picker', x: s2.width * 0.5, y: 14, w: 150, h: 48, lx: s2.width * 0.6, ly: 94 },
  { id: 'S4', label: 'Plan trip action', x: s2.width * 0.62, y: 14, w: 118, h: 48, lx: s2.width * 0.64, ly: 134 }
]);

await page.locator('button[type="submit"]').click();
await page.waitForURL(/dest=/, { timeout: 15_000 }).catch(() => {});
await page.locator('.gm-style, .activity-item, .error-banner').first().waitFor({ state: 'visible', timeout: 45_000 }).catch(() => {});
await sleep(4500);
await maybeClick(page, 'button.places-drawer-pill');
await page.locator('.activity-item').first().waitFor({ state: 'visible', timeout: 25_000 }).catch(() => {});

const s3 = await shot(page, '03-trip-map-workspace');
await annotate('03-trip-map-workspace', s3, [
  { id: 'M1', label: 'Sticky trip header', x: 0, y: 0, w: s3.width, h: 76, lx: 18, ly: 88 },
  { id: 'M2', label: 'Google map surface', x: 0, y: 76, w: s3.width, h: s3.height - 76, lx: 24, ly: 104 },
  { id: 'M3', label: 'Search here / reset area', x: s3.width * 0.34, y: 88, w: s3.width * 0.28, h: 48, lx: s3.width * 0.35, ly: 148 },
  { id: 'M4', label: 'Map controls', x: s3.width - 150, y: 100, w: 120, h: 96, lx: s3.width - 320, ly: 208 },
  { id: 'M5', label: 'Weather pill', x: s3.width - 260, y: Math.max(130, s3.height * 0.26), w: 236, h: 80, lx: s3.width - 420, ly: Math.max(130, s3.height * 0.26 + 96) },
  { id: 'M6', label: 'Places drawer / tabs', x: s3.width - 330, y: Math.max(260, s3.height * 0.44), w: 310, h: Math.min(300, s3.height - 300), lx: s3.width - 560, ly: Math.max(260, s3.height * 0.44 + 20) }
]);

if ((await page.locator('.activity-item').count()) > 0) {
  await page.locator('.activity-item').first().click();
  await page.locator('.detail-panel').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  await sleep(2500);
}

const s4 = await shot(page, '04-place-detail');
await annotate('04-place-detail', s4, [
  { id: 'D1', label: 'Detail sheet overlay', x: 0, y: 180, w: s4.width, h: s4.height - 180, lx: 620, ly: 166 },
  { id: 'D2', label: 'Place title / address', x: 12, y: 200, w: 330, h: 52, lx: 360, ly: 206 },
  { id: 'D3', label: 'Hero photo area', x: 16, y: 256, w: s4.width - 32, h: 200, lx: 500, ly: 310 },
  { id: 'D4', label: 'Hours, stats, links, reviews', x: 16, y: 468, w: s4.width - 32, h: 210, lx: 500, ly: 526 }
]);

await page.locator('button[aria-label="Close details"]').click().catch(async () => {
  await maybeClick(page, '.detail-panel button[aria-label*="Close"]');
});
await sleep(700);
await maybeClick(page, '[data-tab="wishlist"]');
await sleep(1200);

const s5 = await shot(page, '05-wishlist-workspace');
await annotate('05-wishlist-workspace', s5, [
  { id: 'W1', label: 'Wishlist tab active', x: s5.width - 390, y: 120, w: 370, h: 58, lx: s5.width - 660, ly: 112 },
  { id: 'W2', label: 'List selector / rename/delete', x: s5.width - 420, y: 185, w: 400, h: 88, lx: s5.width - 700, ly: 205 },
  { id: 'W3', label: 'Saved places mode', x: s5.width - 420, y: 275, w: 400, h: Math.min(210, s5.height - 290), lx: s5.width - 700, ly: 305 },
  { id: 'W4', label: 'Plan mode switch', x: s5.width - 250, y: 150, w: 190, h: 44, lx: s5.width - 520, ly: 150 }
]);

if ((await page.getByText('Plan', { exact: true }).count()) > 0) {
  await page.getByText('Plan', { exact: true }).first().click();
  await sleep(1000);
}

const s6 = await shot(page, '06-plan-mode');
await annotate('06-plan-mode', s6, [
  { id: 'P1', label: 'Day tabs / add day', x: s6.width - 430, y: 190, w: 410, h: 58, lx: s6.width - 700, ly: 195 },
  { id: 'P2', label: 'Daily hotel slots', x: s6.width - 430, y: 252, w: 410, h: 70, lx: s6.width - 700, ly: 260 },
  { id: 'P3', label: 'Morning/evening/night sessions', x: s6.width - 430, y: 330, w: 410, h: Math.min(300, s6.height - 345), lx: s6.width - 735, ly: 350 },
  { id: 'P4', label: 'Expense/time inputs', x: s6.width - 260, y: Math.max(410, s6.height - 180), w: 230, h: 95, lx: s6.width - 540, ly: Math.max(390, s6.height - 210) }
]);

for (const name of [
  '01-empty-state',
  '02-search-autocomplete',
  '03-trip-map-workspace',
  '04-place-detail',
  '05-wishlist-workspace',
  '06-plan-mode'
]) {
  await renderAnnotatedPng(page, name);
}

await browser.close();

console.log(`Wrote UI reference images to ${outDir}`);
