// Writes a synthetic demo capture: demo/demo.pcap + demo/demo.json
// Usage: npm run demo-pcap [-- seed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { makeDemoCapture, DEMO_DEVICES } from '../src/sim.js';
import { makeCode, seeded, codeToString } from '../src/code.js';

const seed = Number(process.argv[2] || 42);
const code = makeCode(12, seeded(seed));
const startMs = Date.now() - 60_000;
const bytes = makeDemoCapture({ code, startMs, seed });
mkdirSync('demo', { recursive: true });
writeFileSync('demo/demo.pcap', bytes);
writeFileSync('demo/demo.json', JSON.stringify({ code: codeToString(code), startMs, bitMs: 2000, camera: DEMO_DEVICES.camera }, null, 2));
console.log(`demo/demo.pcap (${(bytes.length / 1024).toFixed(0)} KB) code ${codeToString(code)} camera ${DEMO_DEVICES.camera}`);
