import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// HTTPS is needed so Android Chrome allows camera + torch access over Wi-Fi.
// --host (in package.json) makes the server reachable at https://<mac-ip>:5173
// NO_SSL=1 serves plain http on port 5180 (localhost only needs no certificate;
// used for automated screenshots and the laptop browser pane).
const noSsl = !!process.env.NO_SSL;
// Relative base so the same build works at the GitHub Pages sub-path
// (/victor-hackathon/) and inside the Android app.
export default defineConfig({
  base: './',
  plugins: [
    ...(noSsl ? [] : [basicSsl()]),
    // Installable app that keeps working with no internet once opened.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'VICTOR',
        short_name: 'VICTOR',
        description: 'A 60-second privacy check before you settle into a room.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f6f3ee',
        theme_color: '#1d5c58',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{html,js,css,woff2,png,svg}'], navigateFallback: null },
    }),
  ],
  server: { host: true, port: noSsl ? 5180 : 5173 },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        lens: resolve(import.meta.dirname, 'lens.html'),
        ir: resolve(import.meta.dirname, 'ir.html'),
        results: resolve(import.meta.dirname, 'results.html'),
        help: resolve(import.meta.dirname, 'help.html'),
        challenge: resolve(import.meta.dirname, 'challenge.html'),
      },
    },
  },
  test: { environment: 'node' },
});
