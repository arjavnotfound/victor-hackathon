// Renders public/icon.svg to the PNG sizes the app manifest and Android need.
//   node tools/icons.js
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const size of [192, 512, 180]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: size === 180 ? 'public/apple-touch-icon.png' : `public/icon-${size}.png` });
}
await browser.close();
