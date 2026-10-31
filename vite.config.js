import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { resolve } from 'node:path';

// HTTPS is needed so Android Chrome allows camera + torch access over Wi-Fi.
// --host (in package.json) makes the server reachable at https://<mac-ip>:5173
export default defineConfig({
  plugins: [basicSsl()],
  server: { host: true, port: 5173 },
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        scan: resolve(import.meta.dirname, 'scan.html'),
        challenge: resolve(import.meta.dirname, 'challenge.html'),
      },
    },
  },
  test: { environment: 'node' },
});
