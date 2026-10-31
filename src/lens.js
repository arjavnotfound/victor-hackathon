// Lens finder maths (no DOM, so it can be tested in node).
//
// Physics: a camera lens focuses light onto a flat sensor. Light that comes in
// through the lens bounces off the sensor and goes back out the way it came,
// straight back toward the light source (retro-reflection, the "cat's eye"
// effect). The phone torch is a few millimetres from the phone camera, so the
// phone sees a hidden lens as a tiny bright dot that is bright when the torch
// is on and dark when it is off.
//
// Ordinary shiny things (a screw, a glossy sticker) also reflect the torch,
// but only at one exact angle, and they are usually bigger than a lens dot.
// So we keep only small dots, and we ask for the same dot again after the
// phone has moved a little.

/** RGBA ImageData bytes -> luminance (0..255) in `out`. */
export function toGray(rgba, out) {
  for (let i = 0, j = 0; j < out.length; i += 4, j++) {
    // ITU-R BT.601 luma weights (how bright each colour looks to the eye).
    out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

/**
 * Local contrast: pixel minus the mean of its (2r+1)x(2r+1) neighbourhood.
 * r = 4 gives a 9x9 box. This throws away slow changes (the whole wall getting
 * brighter under the torch) and keeps small bright dots. Uses an integral
 * image, so each pixel costs 4 lookups whatever the box size.
 */
export function localContrast(gray, w, h, r = 4, out = new Float32Array(w * h)) {
  const W = w + 1;
  const sat = new Float64Array(W * (h + 1)); // summed-area table
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      sat[(y + 1) * W + (x + 1)] = sat[y * W + (x + 1)] + rowSum;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
      const sum = sat[(y1 + 1) * W + (x1 + 1)] - sat[y0 * W + (x1 + 1)]
                - sat[(y1 + 1) * W + x0] + sat[y0 * W + x0];
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      out[y * w + x] = gray[y * w + x] - sum / n;
    }
  }
  return out;
}

/**
 * Per-pixel Pearson correlation between the pixel's local contrast over the
 * N bits and the torch code.
 *
 *   r = Σ (Lᵢ − L̄)(cᵢ − c̄) / sqrt( Σ (Lᵢ − L̄)² · Σ (cᵢ − c̄)² )
 *
 * r ≈ 1: the pixel blinks exactly with the torch (a lens, or a glint).
 * r ≈ 0: unrelated (the room, a lamp, a blinking LED on its own timer).
 *
 * Also returns `amp` = mean(L when torch on) − mean(L when torch off), the
 * size of the blink in grey levels, so we can ignore tiny noisy wiggles that
 * happen to correlate.
 */
export function correlateCode(frames, code) {
  const n = code.length;
  const len = frames[0].length;
  const cMean = code.reduce((a, b) => a + b, 0) / n;
  const cDev = code.map((c) => c - cMean);
  const cNorm = Math.sqrt(cDev.reduce((a, d) => a + d * d, 0));
  const ones = code.reduce((a, b) => a + b, 0);
  const zeros = n - ones;
  const r = new Float32Array(len);
  const amp = new Float32Array(len);
  for (let p = 0; p < len; p++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += frames[i][p];
    mean /= n;
    let num = 0, den = 0, on = 0, off = 0;
    for (let i = 0; i < n; i++) {
      const d = frames[i][p] - mean;
      num += d * cDev[i];
      den += d * d;
      if (code[i]) on += frames[i][p]; else off += frames[i][p];
    }
    r[p] = den > 1e-9 ? num / (Math.sqrt(den) * cNorm) : 0;
    amp[p] = on / ones - off / zeros;
  }
  return { r, amp };
}

/**
 * Group matching pixels into blobs (4-connected flood fill) and keep only
 * small ones. A lens dot at a few metres covers 1 to a few dozen pixels at
 * 320 px wide. Anything bigger is a mirror, a window or a glossy surface.
 */
export function findBlobs(r, amp, w, h, { rMin = 0.8, ampMin = 6, minArea = 1, maxArea = 40, raw = null } = {}) {
  const hit = new Uint8Array(w * h);
  for (let p = 0; p < hit.length; p++) hit[p] = r[p] >= rMin && amp[p] >= ampMin ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const blobs = [];
  const stack = [];
  for (let start = 0; start < hit.length; start++) {
    if (!hit[start] || seen[start]) continue;
    let area = 0, sx = 0, sy = 0, sr = 0, sa = 0, peak = -Infinity;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y; sr += r[p]; sa += amp[p];
      if (raw && raw[p] > peak) peak = raw[p];
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of nb) if (q >= 0 && hit[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
    }
    if (area < minArea || area > maxArea) continue;
    if (raw && !isIsolated(raw, w, h, sx / area, sy / area, peak)) continue;
    const meanR = sr / area;
    blobs.push({
      x: sx / area, y: sy / area, area, r: meanR, amp: sa / area,
      // Score 0..100: mostly how well it follows the code, a little for how strong the blink is.
      score: Math.round(100 * Math.min(1, meanR * (0.85 + 0.15 * Math.min(1, sa / area / 40)))),
    });
  }
  return blobs.sort((a, b) => b.score - a.score);
}

/**
 * Ring test on the raw blink image (mean when torch on − mean when off).
 * A lens is a lone bright dot: the blink at its centre is much bigger than
 * everywhere on a small ring around it. The corner or edge of a big shiny
 * surface also passes the local-contrast test, but part of its ring sits on
 * the same shiny surface and blinks just as hard. Those are dropped.
 */
export function isIsolated(raw, w, h, cx, cy, peak, radius = 5) {
  let ringMax = -Infinity, ringMin = Infinity;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const x = Math.round(cx + radius * Math.cos(a)), y = Math.round(cy + radius * Math.sin(a));
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const v = raw[y * w + x];
    if (v > ringMax) ringMax = v;
    if (v < ringMin) ringMin = v;
  }
  if (ringMax === -Infinity) return true;
  return peak - ringMax >= 0.5 * (peak - ringMin);
}

/** Raw blink image: average of the "on" frames minus average of the "off" frames. */
export function blinkImage(frames, code) {
  const out = new Float32Array(frames[0].length);
  const ones = code.reduce((a, b) => a + b, 0), zeros = code.length - ones;
  for (let i = 0; i < code.length; i++) {
    const k = code[i] ? 1 / ones : -1 / zeros;
    const f = frames[i];
    for (let p = 0; p < out.length; p++) out[p] += k * f[p];
  }
  return out;
}

/**
 * Confirmation across scans. The user moves the phone a little between scans,
 * so a real lens moves a little in the picture but is still there. A glint
 * from a shiny surface usually disappears when the angle changes.
 * `maxDist` is in analysis pixels.
 */
export function updateTracks(tracks, blobs, maxDist = 40) {
  const used = new Set();
  for (const b of blobs) {
    let best = null, bestD = maxDist;
    for (const t of tracks) {
      if (used.has(t)) continue;
      const d = Math.hypot(t.x - b.x, t.y - b.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    if (best) {
      used.add(best);
      best.x = b.x; best.y = b.y; best.hits++; best.score = Math.max(best.score, b.score);
      b.track = best;
    } else {
      const t = { x: b.x, y: b.y, hits: 1, score: b.score };
      tracks.push(t); used.add(t); b.track = t;
    }
  }
  for (const b of blobs) b.confirmed = b.track.hits >= 2;
  return tracks;
}

/**
 * All lens check thresholds in one place. The Details panel on the phone can
 * change them (and remembers them), so they can be tuned on the real phone.
 */
export const LENS_DEFAULTS = {
  bits: 10,        // length of the torch code
  bitMs: 350,      // how long each bit lasts
  settleMs: 120,   // frames from the start of a bit are skipped (torch + sensor lag)
  rMin: 0.8,       // how closely a pixel must follow the code (correlation)
  ampMin: 6,       // smallest blink that counts, in grey levels
  maxArea: 40,     // biggest dot, in analysis pixels; bigger is a mirror or glossy surface
  trackDist: 0.12, // how far a spot may move between scans, as a share of picture width
};

/** Plain words for a spot. Never claims it is a camera. */
export const spotLabel = (b) => (b.confirmed ? 'Seen twice, worth a closer look' : 'Possible reflection');
