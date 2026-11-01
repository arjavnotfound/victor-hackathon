import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';

// HTTPS is needed so Android Chrome allows camera + torch access over Wi-Fi.
// --host (in package.json) makes the server reachable at https://<mac-ip>:5173
// NO_SSL=1 serves plain http on port 5180 (localhost only needs no certificate;
// used for automated screenshots and the laptop browser pane).
const noSsl = !!process.env.NO_SSL;
// /api goes to the VIGIL listener (tools/mac/listener.mjs) on this machine.
// When it is not running, answer "no listener" instead of a 502 error.
const listener = {
  target: 'http://127.0.0.1:5174',
  configure: (proxy) => proxy.on('error', (err, req, res) => {
    res.writeHead?.(200, { 'Content-Type': 'application/json' });
    res.end?.('{"ok":false}');
  }),
};
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
        name: 'VIGIL',
        short_name: 'VIGIL',
        description: 'Check a room for hidden cameras.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#000000',
        theme_color: '#000000',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{html,js,css,woff2,png,svg}'], navigateFallback: null },
    }),
  ],
  server: { host: true, port: noSsl ? 5180 : 5173, proxy: { '/api': listener } },
  preview: { proxy: { '/api': listener } },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        lens: resolve(import.meta.dirname, 'lens.html'),
        ir: resolve(import.meta.dirname, 'ir.html'),
        results: resolve(import.meta.dirname, 'results.html'),
        help: resolve(import.meta.dirname, 'help.html'),
        how: resolve(import.meta.dirname, 'how.html'),
        find: resolve(import.meta.dirname, 'find.html'),
        network: resolve(import.meta.dirname, 'network.html'),
        challenge: resolve(import.meta.dirname, 'challenge.html'),
        map: resolve(import.meta.dirname, 'map.html'),
      },
    },
  },
  test: { environment: 'node' },
});
