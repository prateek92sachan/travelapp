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
      }
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
