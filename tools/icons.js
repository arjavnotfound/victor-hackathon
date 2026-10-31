// Renders the app icon (public/icon.svg) to every PNG the web app and the
// Android app need, plus plain splash screens.
//   node tools/icons.js
import { chromium } from 'playwright';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const svg = readFileSync('public/icon.svg', 'utf8');
const COLOR = svg.match(/fill="(#[0-9a-f]{6})"/i)[1];
// Foreground only (transparent), smaller, for Android adaptive icons: the
// launcher crops to the middle 66% of the square.
const fg = svg.replace(/<rect[^>]*\/>/, '').replace('viewBox="0 0 512 512"', 'viewBox="-128 -128 768 768"');
const RES = 'android/app/src/main/res';

const browser = await chromium.launch();
const page = await browser.newPage();
async function render(markup, w, h, path, bg = 'transparent') {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<body style="margin:0;background:${bg};display:grid;place-items:center;height:100vh">${markup}</body>`);
  await page.screenshot({ path, omitBackground: bg === 'transparent' });
}
const sized = (s, n) => s.replace('<svg ', `<svg width="${n}" height="${n}" `);
const round = (s, n) => sized(s, n).replace('<rect ', `<rect rx="${256}" `);

// Web app
for (const n of [192, 512]) await render(sized(svg, n), n, n, `public/icon-${n}.png`);
await render(sized(svg, 180), 180, 180, 'public/apple-touch-icon.png');

// Android launcher icons (48 dp base, adaptive foreground 108 dp base)
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
if (existsSync(RES)) {
  for (const [d, k] of Object.entries(dens)) {
    await render(sized(svg, 48 * k), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher.png`);
    await render(round(svg, 48 * k), 48 * k, 48 * k, `${RES}/mipmap-${d}/ic_launcher_round.png`);
    await render(sized(fg, 108 * k), 108 * k, 108 * k, `${RES}/mipmap-${d}/ic_launcher_foreground.png`);
  }
  // Splash screens: the icon small in the middle of the app background.
  for (const dir of readdirSync(RES).filter((f) => f.startsWith('drawable'))) {
    const file = `${RES}/${dir}/splash.png`;
    if (!existsSync(file)) continue;
    const [w, h] = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString().match(/\d+/g).slice(-2).map(Number);
    await render(round(svg, Math.round(Math.min(w, h) * 0.22)), w, h, file, '#f2f2f7');
  }
}
await browser.close();
console.log('icons done, colour', COLOR);
