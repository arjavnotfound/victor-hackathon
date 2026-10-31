// End-to-end check in desktop Chromium + screenshots of every screen.
//   npm run e2e          (runs the checks, writes docs/screenshots/*.png)
// Starts its own Vite server on plain http://localhost (a secure context, so
// the camera works) and uses Chromium's fake camera.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, copyFileSync } from 'node:fs';
import assert from 'node:assert/strict';

process.env.NO_SSL = '1';
const PORT = 5181;
const SHOTS = 'docs/screenshots';
mkdirSync(SHOTS, { recursive: true });

const server = await createServer({ server: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'error' });
await server.listen();
const base = `http://localhost:${PORT}`;

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));

let failed = 0;
async function step(name, fn) {
  try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const text = (sel) => page.locator(sel).innerText();

await step('home loads and links through the flow', async () => {
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  assert.match(await text('h1'), /60-second privacy check/);
  await shot('home');
  await page.click('text=Start the check');
  await page.waitForURL(/lens\.html/);
  await page.goto(base + '/?demo=1');
  assert.match(await page.getAttribute('text=Start the check', 'href'), /lens\.html\?demo=1$/);
  await page.goto(base + '/help.html');
  assert.match(await text('h1'), /If you found something/);
  await shot('help');
});

await step('lens check (demo) finds the simulated lens, seen twice, and saves it', async () => {
  await page.goto(base + '/lens.html?demo=1');
  await shot('lens-start');
  await page.click('#scanBtn'); // start camera
  await page.waitForFunction(() => document.querySelector('#scanBtn').textContent === 'Scan');
  for (let k = 0; k < 3; k++) {
    await page.click('#scanBtn');
    await page.waitForFunction(() => !document.querySelector('#scanBtn').disabled, null, { timeout: 15000 });
    if (/Seen twice/.test(await text('#status'))) break;
    await page.waitForTimeout(800); // the demo camera drifts a little, like a hand
  }
  assert.match(await text('#status'), /Seen twice, worth a closer look/);
  await shot('lens-found');
  await page.click('#detailsBtn');
  assert.match(await text('#debugInfo'), /frames per bit/);
  await shot('lens-details');
  await page.click('#supportBtn');
  assert.match(await text('#supportTable'), /Torch/);
  await shot('lens-phone');
  await page.click('#supportBtn');
  await page.click('#saveBtn');
  assert.match(await text('#saved'), /1 spot saved/);
});

await step('lens check with a fake camera (no torch) says so plainly', async () => {
  await page.goto(base + '/lens.html');
  await page.click('#scanBtn');
  await page.waitForFunction(() => /torch/.test(document.querySelector('#status').textContent), null, { timeout: 10000 });
  await shot('lens-no-torch');
});

await step('IR check opens the camera and switching cameras does not crash', async () => {
  await page.goto(base + '/ir.html');
  await shot('ir-start');
  await page.click('#scanBtn');
  await page.waitForFunction(() => document.querySelector('#scanBtn').textContent === 'Pause', null, { timeout: 10000 });
  await page.click('#flipBtn');
  await page.waitForFunction(() => /back camera/.test(document.querySelector('#flipBtn').textContent), null, { timeout: 10000 });
  assert.match(await text('#status'), /Front camera on/);
  await page.click('#flipBtn');
  await page.waitForFunction(() => /front camera/.test(document.querySelector('#flipBtn').textContent), null, { timeout: 10000 });
  await page.waitForTimeout(500);
});

await step('IR check (demo) flags the simulated night-vision lights', async () => {
  await page.goto(base + '/ir.html?demo=1');
  await page.click('#scanBtn');
  await page.waitForFunction(() => /Bright point/.test(document.querySelector('#status').textContent), null, { timeout: 10000 });
  await shot('ir-found');
});

await step('results show the saved spot, and the PDF is real and carries the fingerprint', async () => {
  await page.goto(base + '/results.html');
  assert.match(await text('#summary'), /1 spot worth a closer look/);
  assert.equal(await page.locator('.spot img').count(), 1);
  assert.match(await text('#checks'), /Lens check\s+Yes/);
  assert.match(await text('#checks'), /IR check\s+Yes/);
  await shot('results');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#reportBtn')]);
  const path = await dl.path();
  const pdf = readFileSync(path);
  if (process.env.PDF_OUT) copyFileSync(path, process.env.PDF_OUT);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const shown = (await text('#reportNote')).match(/[0-9a-f]{64}/)[0];
  assert.ok(pdf.toString('latin1').includes(shown), 'content fingerprint printed in the PDF');
  console.log('      PDF', dl.suggestedFilename(), pdf.length, 'bytes, fingerprint', shown.slice(0, 12) + '…');
  await shot('results-report');
});

await step('results with nothing flagged says so calmly', async () => {
  await page.evaluate(() => localStorage.removeItem('victor.snapshots'));
  await page.reload();
  assert.equal(await text('#summary'), 'Nothing found in what we checked.');
  await shot('results-nothing');
});

await step('Wi-Fi page still loads and the demo replay finds the camera', async () => {
  await page.goto(base + '/challenge.html');
  await shot('challenge');
  await page.click('#demoBtn');
  await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
  assert.match(await text('#verdict'), /Camera found/);
  await shot('challenge-result');
});

await step('no console errors anywhere', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
