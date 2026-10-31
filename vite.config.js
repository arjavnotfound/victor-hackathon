import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

// HTTPS is needed so Android Chrome allows camera + torch access over Wi-Fi.
// --host (in package.json) makes the server reachable at https://<mac-ip>:5173
// NO_SSL=1 serves plain http on port 5180 (localhost only needs no certificate;
// used for automated screenshots and the laptop browser pane).
const noSsl = !!process.env.NO_SSL;
export default defineConfig({
  plugins: noSsl ? [] : [basicSsl()],
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
