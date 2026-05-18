import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Travel App',
        short_name: 'TravelApp',
        description: 'One-stop travel planning: weather, maps, and activities',
        theme_color: '#0ea5e9',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: false
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/__\//],
        runtimeCaching: [
          {
            // Geocoding: stable results, cache aggressively
            urlPattern: /^https:\/\/maps\.googleapis\.com\/maps\/api\/geocode\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'geocoding-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // OpenWeather 5-day forecast: stale-while-revalidate, 2hr expiry
            urlPattern: /^https:\/\/api\.openweathermap\.org\//,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'openweather-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 2 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Open-Meteo historical archive: immutable data, cache 7 days
            urlPattern: /^https:\/\/archive-api\.open-meteo\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'open-meteo-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Wikipedia REST summary + OpenSearch
            urlPattern: /^https:\/\/en\.wikipedia\.org\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wikipedia-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 3 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    })
  ],
  server: {
    port: 5173,
    open: true,
    // host: true makes Vite listen on all network interfaces, so other
    // devices on the same WiFi (your phone) can reach the dev server.
    // Vite will print a "Network: http://192.168.x.x:5173" line on startup.
    host: true
  }
});
