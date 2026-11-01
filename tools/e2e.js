// End-to-end check in desktop Chromium. Screenshots: tools/shots.js.
//   npm run e2e
// Builds the app, then serves the build under /victor-hackathon/ on plain
// http://localhost, the same sub-path as GitHub Pages (localhost is a secure
// context, so the camera works). Uses Chromium's fake camera.

import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { readFileSync, copyFileSync } from 'node:fs';
import assert from 'node:assert/strict';

process.env.NO_SSL = '1';
const PORT = 5181;

await build({ logLevel: 'error' });
const server = await preview({ base: '/victor-hackathon/', preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'error' });
const base = `http://localhost:${PORT}/victor-hackathon`;

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
const shot = () => {}; // screenshots live in tools/shots.js
const text = (sel) => page.locator(sel).innerText();

await step('home loads and links through the flow', async () => {
  await page.goto(base + '/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  assert.match(await text('#lastText'), /No checks yet/);
  await page.click('#scanOrb');
  await page.waitForURL(/lens\.html/);
  await page.goto(base + '/?demo=1');
  assert.match(await page.getAttribute('#scanOrb', 'href'), /lens\.html\?demo=1$/);
  assert.match(await page.getAttribute('a[href*="map.html"]', 'href'), /map\.html\?demo=1$/);
  await page.goto(base + '/help.html');
  assert.match(await text('h1'), /If you found something/);
  await page.goto(base + '/how.html');
  assert.match(await text('h1'), /How it works/);
  await shot('help');
});

await step('lens check (demo) finds the simulated lens, seen twice, and saves it', async () => {
  await page.goto(base + '/lens.html?demo=1');
  await shot('lens-start');
  await page.click('#scanBtn'); // start camera
  await page.waitForFunction(() => document.querySelector('#scanBtn').dataset.state === 'idle');
  // One tap starts a sweep; scans repeat until a spot is seen twice, then stop.
  await page.click('#scanBtn');
  await page.waitForFunction(() => /Seen twice/.test(document.querySelector('#status').textContent), null, { timeout: 30000 });
  await page.click('#scanBtn');
  await page.waitForFunction(() => document.querySelector('#scanBtn').dataset.state === 'idle', null, { timeout: 15000 });
  await shot('lens-found');
  await page.click('#detailsBtn');
  await page.waitForTimeout(350);
  assert.match(await text('#debugInfo'), /frames per bit/);
  assert.match(await text('#debugInfo'), /ignored [1-9]/); // the demo spoon is ignored for its shape
  await page.click('#ignoredToggle');
  assert.match(await text('#debugInfo'), /torch timing: \d+ ms to switch/); // calibration ran
  console.log('      ' + (await text('#debugInfo')).replace(/\n/g, ' | '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
  await page.click('#supportBtn');
  await page.waitForTimeout(350);
  assert.match(await text('#supportTable'), /Torch/);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);
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
  await page.waitForFunction(() => /back camera/.test(document.querySelector('#flipBtn').getAttribute('aria-label')), null, { timeout: 10000 });
  assert.match(await text('#status'), /Front camera on/);
  await page.click('#flipBtn');
  await page.waitForFunction(() => /front camera/.test(document.querySelector('#flipBtn').getAttribute('aria-label')), null, { timeout: 10000 });
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
  assert.match(await text('#summary'), /1 thing worth a closer look/);
  assert.equal(await page.locator('.spot img').count(), 1);
  assert.match(await text('#checks'), /Lens check/);
  assert.match(await text('#checks'), /Directions covered[^]*\d+ of 12/); // demo turns the heading slowly
  assert.match(await text('#checks'), /Night-vision lights[^]*back camera/);
  await shot('results');
  await page.click('#reportBtn');
  await page.waitForTimeout(350);
  await page.fill('#aboutPlace', 'Hostel block B, room 204');
  await page.fill('#aboutName', 'Test student');
  await page.fill('#aboutNotes', 'Checked before moving in.');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#makePdf')]);
  const path = await dl.path();
  const pdf = readFileSync(path);
  if (process.env.PDF_OUT) copyFileSync(path, process.env.PDF_OUT);
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  const shown = (await text('#reportHash')).match(/[0-9a-f]{64}/)[0];
  assert.ok(pdf.toString('latin1').includes(shown), 'content fingerprint printed in the PDF');
  assert.ok(pdf.toString('latin1').includes('Hostel block B, room 204'), 'place printed in the PDF');
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
  assert.match(await text('#verdict'), /A device followed the flashes/);
  await page.locator('#results').scrollIntoViewIfNeeded();
  await shot('challenge-result');
});

await step('network check in a browser points to the Android app', async () => {
  await page.goto(base + '/network.html');
  assert.equal(await page.isVisible('#webOnly'), true);
  assert.equal(await page.isVisible('#runBtn'), false);
  assert.equal(await page.isVisible('#getApp'), true);
  await shot('network');
});

await step('network demo finds the camera hotspot and the video stream, not the TV', async () => {
  await page.goto(base + '/network.html?demo=1');
  await page.click('#runBtn');
  await page.waitForSelector('#found:not([hidden])', { timeout: 20000 });
  const text = await page.locator('#foundList').innerText();
  assert.match(text, /IPC-8F3A21[^]*default hotspot/);
  assert.match(text, /Answers as a video stream/);
  assert.doesNotMatch(text, /Living room TV/);
  await page.click('.find');
  await page.waitForFunction(() => /Warmer|Very close|Keep going/.test(document.querySelector('#word').textContent), null, { timeout: 15000 });
  assert.match(await page.locator('#ssid').innerText(), /IPC-8F3A21/);
});

await step('laptop home shows a QR code for phones', async () => {
  const wide = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const p = await wide.newPage();
  await p.goto(base + '/');
  await p.waitForFunction(() => document.querySelector('#qr').width > 0, null, { timeout: 10000 });
  await wide.close();
});

await step('Wi-Fi map (demo) shows a red source and opens its stats', async () => {
  await page.goto(base + '/map.html?demo=1');
  await page.waitForSelector('.chip.suspicious', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot('map');
  await page.click('.chip.suspicious');
  await page.waitForSelector('#details.open');
  assert.match(await text('#detailBody'), /Suspicious/);
  assert.match(await text('#detailBody'), /Channel/);
  assert.match(await text('#detailBody'), /screen flashes/);
  await page.waitForTimeout(500);
  await shot('map-details');
});

await step('no console errors anywhere', async () => {
  assert.deepEqual(errors, []);
});

await browser.close();
await server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
