// Small canvas charts (no library). Each takes a theme so the same chart can
// be drawn dark for the screen and light for the PDF.

export const DARK = { bg: '#0e0e0f', grid: '#202023', text: '#8b8b90', line: '#ededee', band: 'rgba(255,255,255,.07)', step: '#e5b45a', colors: ['#ededee', '#eb6b6b', '#6fcf97', '#8b8b90'] };
export const LIGHT = { bg: '#ffffff', grid: '#dde1e8', text: '#555e6e', line: '#0b6fb8', band: 'rgba(255,170,40,.22)', step: '#c77700', colors: ['#0b6fb8', '#c62839', '#1a8a4a', '#7a3fc2'] };
// On screen the charts sit on a card, so match the page's light or dark mode.
export const screenTheme = () => (globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches
  ? { ...DARK, bg: '#1c1c1e', grid: '#2c2c2e' } : LIGHT);

function setup(canvas, w, h) {
  const dpr = canvas.isConnected ? window.devicePixelRatio || 1 : 2;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  return ctx;
}

function axes(ctx, w, h, pad, t, xLabel, x0, x1, yLabel) {
  ctx.fillStyle = t.bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = t.grid; ctx.lineWidth = 1;
  ctx.fillStyle = t.text; ctx.font = '11px system-ui, sans-serif';
  const step = niceStep((x1 - x0) / 8);
  for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
    const px = pad.l + ((x - x0) / (x1 - x0)) * (w - pad.l - pad.r);
    ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.stroke();
    ctx.fillText(`${Math.round(x)}`, px - 6, h - pad.b + 14);
  }
  ctx.fillText(xLabel, w - pad.r - ctx.measureText(xLabel).width, h - 4);
  ctx.save(); ctx.translate(12, pad.t + 4); ctx.fillText(yLabel, 0, 0); ctx.restore();
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  for (const m of [1, 2, 5, 10]) if (m * p >= raw) return m * p;
  return 10 * p;
}

/**
 * Traffic vs code. Shaded bands = "1" bits (screen flickering), shifted by the
 * best time offset. Thin line = bytes per 100 ms after spike clipping.
 * Thick steps = total per bit (what the correlation actually uses).
 */
export function drawTraffic(canvas, res, dev, t = DARK, w = canvas.clientWidth || 800, h = 240) {
  const ctx = setup(canvas, w, h);
  const pad = { l: 16, r: 12, t: 22, b: 30 };
  const bins = dev.bins;
  const binS = res.binMs / 1000;
  // x axis = seconds from where bit 0 starts for this device (after its delay)
  const codeStartBin = dev.bestOff;
  const x0 = -codeStartBin * binS, x1 = (bins.length - codeStartBin) * binS;
  axes(ctx, w, h, pad, t, 'seconds from code start (camera time)', x0, x1, 'traffic (bytes per 100 ms) vs code');
  const X = (s) => pad.l + ((s - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const max = Math.max(1, ...bins);
  const Y = (v) => h - pad.b - (v / max) * (h - pad.t - pad.b);
  const bitS = res.bitMs / 1000;
  // code bands
  res.code.forEach((b, i) => {
    if (!b) return;
    ctx.fillStyle = t.band;
    ctx.fillRect(X(i * bitS), pad.t, X((i + 1) * bitS) - X(i * bitS), h - pad.t - pad.b);
  });
  // traffic line
  ctx.strokeStyle = t.line; ctx.lineWidth = 1.2; ctx.beginPath();
  bins.forEach((v, i) => { const px = X((i - codeStartBin) * binS), py = Y(v); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
  ctx.stroke();
  // per-bit average as steps
  ctx.strokeStyle = t.step; ctx.lineWidth = 2.5; ctx.beginPath();
  dev.bitSums.forEach((s, i) => {
    const avg = s / res.binsPerBit;
    ctx.moveTo(X(i * bitS), Y(avg)); ctx.lineTo(X((i + 1) * bitS), Y(avg));
  });
  ctx.stroke();
  // code digits on top
  ctx.fillStyle = t.text; ctx.font = 'bold 11px ui-monospace, monospace';
  res.code.forEach((b, i) => ctx.fillText(String(b), X((i + 0.5) * bitS) - 3, pad.t - 6));
}

/** Signal strength over time for up to 4 devices. Stronger (less negative) = closer. */
export function drawRssi(canvas, res, devs, t = DARK, w = canvas.clientWidth || 800, h = 200) {
  const ctx = setup(canvas, w, h);
  const pad = { l: 40, r: 12, t: 22, b: 30 };
  const span = (res.binsPerBit * res.code.length * res.binMs) / 1000 + 2 * 4;
  const all = devs.flatMap((d) => d.rssi);
  const x1 = Math.max(span, ...all.map((p) => p[0]));
  axes(ctx, w, h, pad, t, 'seconds', 0, x1, 'signal strength (dBm)');
  let lo = Math.min(-90, ...all.map((p) => p[1])), hi = Math.max(-30, ...all.map((p) => p[1]));
  const X = (s) => pad.l + (s / x1) * (w - pad.l - pad.r);
  const Y = (v) => h - pad.b - ((v - lo) / (hi - lo)) * (h - pad.t - pad.b);
  ctx.fillStyle = t.text;
  for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) ctx.fillText(String(v), 6, Y(v) + 4);
  devs.forEach((d, k) => {
    ctx.fillStyle = t.colors[k % t.colors.length];
    for (const [s, v] of d.rssi) ctx.fillRect(X(s) - 1, Y(v) - 1, 2.2, 2.2);
    ctx.fillText(`${d.mac}  ${d.meanRssi != null ? d.meanRssi.toFixed(0) + ' dBm' : ''}`, w - pad.r - 190, pad.t + 12 + k * 14);
  });
}
