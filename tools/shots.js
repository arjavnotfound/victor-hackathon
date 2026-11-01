// Screenshots of every screen and sheet, light and dark, at 390x844 and 360x780.
//   npm run shots            (all)
//   npm run shots -- home    (only names that contain "home")
// Saves docs/screenshots/<name>-<light|dark>-<width>.png. Uses the demo camera.

import { chromium } from 'playwright';
import { build, preview } from 'vite';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';

process.env.NO_SSL = '1';
const OUT = 'docs/screenshots';
const only = process.argv[2] || '';
mkdirSync(OUT, { recursive: true });
if (!only) for (const f of readdirSync(OUT)) if (f.endsWith('.png')) rmSync(`${OUT}/${f}`);

await build({ logLevel: 'error' });
const PORT = 5184;
const server = await preview({ base: '/victor-hackathon/', preview: { port: PORT, strictPort: true, host: 'localhost' }, logLevel: 'error' });
const base = `http://localhost:${PORT}/victor-hackathon`;
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const errors = [];

const sizes = [[390, 844], [360, 780]];
for (const scheme of ['light', 'dark']) {
  for (const [w, h] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${page.url()}: ${e.message}`));
    const shot = async (name, full = false) => {
      if (only && !name.includes(only)) return;
      await page.waitForTimeout(150);
      await page.screenshot({ path: `${OUT}/${name}-${scheme}-${w}.png` });
      // Long pages: also the bottom, as the user sees it after scrolling.
      if (full && await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 40)) {
        await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${name}-end-${scheme}-${w}.png` });
        await page.evaluate(() => scrollTo(0, 0));
      }
    };
    const sheet = async (btn, name) => {
      await page.click(btn);
      await page.waitForTimeout(400);
      await shot(name);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    };
    const want = (...names) => !only || names.some((n) => n.includes(only));

    // Home, empty then with a result
    await page.goto(base + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await shot('home', true);
    if (want('home-settings')) await sheet('[data-sheet=settings]', 'home-settings');

    if (want('lens')) {
      await page.goto(base + '/lens.html?demo=1');
      await shot('lens-start');
      await page.click('#scanBtn');
      await page.waitForFunction(() => document.querySelector('#scanBtn').textContent === 'Scan');
      await page.click('#scanBtn');
      await page.waitForTimeout(2500);
      await shot('lens-scanning');
      await page.waitForFunction(() => !document.querySelector('#scanBtn').disabled, null, { timeout: 20000 });
      for (let k = 0; k < 3 && !/Seen twice/.test(await page.locator('#status').innerText()); k++) {
        await page.waitForTimeout(800);
        await page.click('#scanBtn');
        await page.waitForFunction(() => !document.querySelector('#scanBtn').disabled, null, { timeout: 20000 });
      }
      await shot('lens-found');
      await sheet('#detailsBtn', 'lens-details');
      await page.click('#detailsBtn');
      await page.waitForTimeout(400);
      await page.click('#ignoredToggle');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      await shot('lens-ignored');
      await sheet('#supportBtn', 'lens-phone');
      await page.click('#saveBtn');
      await page.goto(base + '/lens.html');
      await page.click('#scanBtn');
      await page.waitForTimeout(1500);
      await shot('lens-no-torch');
    }
    if (want('ir')) {
      await page.goto(base + '/ir.html?demo=1');
      await shot('ir-start');
      await page.click('#scanBtn');
      await page.waitForFunction(() => /Bright point/.test(document.querySelector('#status').textContent), null, { timeout: 15000 });
      await shot('ir-found');
      await page.click('#saveBtn');
      await sheet('#detailsBtn', 'ir-details');
    }
    if (want('results', 'home-last')) {
      await page.goto(base + '/results.html?demo=1');
      await shot('results', true);
      if (want('results-clear')) await sheet('#clearBtn', 'results-clear');
      await page.goto(base + '/');
      await shot('home-last');
      await page.evaluate(() => localStorage.removeItem('victor.snapshots'));
      await page.goto(base + '/results.html');
      await shot('results-nothing', true);
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await shot('results-empty');
    }
    await page.goto(base + '/help.html');
    await shot('help', true);
    await page.goto(base + '/how.html');
    await shot('how', true);
    await page.goto(base + '/network.html');
    await shot('network-web');
    if (want('network-demo')) {
      await page.goto(base + '/network.html?demo=1');
      if (await page.isVisible('#runBtn')) {
        await page.click('#runBtn');
        await page.waitForTimeout(1200);
        await shot('network-demo-progress');
        await page.waitForSelector('#found:not([hidden])', { timeout: 30000 });
        await page.waitForTimeout(600);
        await shot('network-demo', true);
      }
    }
    if (want('challenge')) {
      await page.goto(base + '/challenge.html');
      await shot('challenge', true);
      await page.click('#demoBtn');
      await page.waitForSelector('#results:not([hidden])', { timeout: 30000 });
      await page.locator('#results').scrollIntoViewIfNeeded();
      await shot('challenge-result');
    }
    await ctx.close();
  }
}
await browser.close();
await server.close();
console.log(errors.length ? errors.join('\n') : 'shots done, no page errors');
