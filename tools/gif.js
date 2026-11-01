// Records the demo lens check as docs/lens-demo.gif for the README.
//   node tools/gif.js
// Same setup as tools/e2e.js: build, serve under /victor-hackathon/, fake camera.
// Frames are screenshots taken while the scan runs, then encoded with gifenc.

import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
const { GIFEncoder, quantize, applyPalette } = gifenc;

process.env.NO_SSL = '1';
const PORT = 5182;
await build({ logLevel: 'error' });
const server = await preview({ base: '/victor-hackathon/', preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'error' });
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 320, height: 660 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });

const frames = [];
const grab = async (delay) => frames.push({ png: PNG.sync.read(await page.screenshot()), delay });
// Keep grabbing until the condition holds in the page.
async function record(cond, every = 300) {
  while (!(await page.evaluate(cond))) { await grab(every); await page.waitForTimeout(every - 120); }
}

await page.goto(`http://localhost:${PORT}/victor-hackathon/lens.html?demo=1`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await grab(1200);
await page.click('#scanBtn');
await page.waitForFunction(() => document.querySelector('#scanBtn').dataset.state === 'idle');
// One tap sweeps: scans repeat until a spot is seen twice.
await page.click('#scanBtn');
await record(() => /Seen twice/.test(document.querySelector('#status').textContent));
await page.click('#scanBtn');
await grab(2500);

const gif = GIFEncoder();
for (const { png, delay } of frames) {
  const palette = quantize(png.data, 64);
  gif.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay });
}
gif.finish();
writeFileSync('docs/lens-demo.gif', gif.bytes());
console.log(`docs/lens-demo.gif: ${frames.length} frames, ${(gif.bytes().length / 1e6).toFixed(1)} MB`);
await browser.close();
await server.close();
