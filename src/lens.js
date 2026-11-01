// Lens finder maths (no DOM, so it can be tested in node).
//
// Physics: a camera lens focuses light onto a flat sensor. Light that comes in
// through the lens bounces off the sensor and goes back out the way it came,
// straight back toward the light source (retro-reflection, the "cat's eye"
// effect). The phone torch is a few millimetres from the phone camera, so the
// phone sees a hidden lens as a tiny bright dot that is bright when the torch
// is on and dark when it is off.
//
// Ordinary shiny things (a screw, a glossy sticker, a spoon) also reflect the
// torch, but only at one exact angle, and they are usually bigger than a lens
// dot or shaped like a streak. So we keep only small round dots, and we ask
// for the same dot again after the phone has moved a little.

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
 * happen to correlate, and `sd`, how much the pixel changed at all over the
 * scan (so we can show things that blink but not in our pattern).
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
  const sd = new Float32Array(len);
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
    sd[p] = Math.sqrt(den / n);
  }
  return { r, amp, sd };
}

/**
 * Shape test for one candidate spot. A lens glint is tiny, round and solid:
 * it fills most of its outline and is about as wide as it is tall. The edge
 * of a spoon or a glossy frame lights up as a thin streak instead: long (low
 * aspect) or slanted (low fill). Below `shapeMinArea` pixels a spot is too
 * small to have a shape, so it always passes.
 *
 * "Fill" is measured against the round outline (ellipse) that fits the
 * bounding box, not the box itself: a perfectly round dot only covers π/4
 * (79%) of its box, and a small pixelated one even less (6 pixels in a 3x3
 * box). Against the ellipse a round dot scores about 1, a slanted streak
 * well under 0.5.
 */
export function shapeOk({ area, bw, bh }, { fillMin = 0.7, aspectMin = 0.6, shapeMinArea = 6 } = {}) {
  if (area < shapeMinArea) return true;
  const fill = Math.min(1, area / ((Math.PI / 4) * bw * bh));
  const aspect = Math.min(bw, bh) / Math.max(bw, bh);
  return fill >= fillMin && aspect >= aspectMin;
}

/**
 * Flood fill (8-connected, so a slanted streak stays one piece) over pixels
 * where `test(p)` holds. Calls `each(stats)` with area, centre, bounding box,
 * mean r and amp, and the peak of `raw`.
 */
function eachBlob(w, h, test, r, amp, raw, each) {
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !test(start)) continue;
    let area = 0, sx = 0, sy = 0, sr = 0, sa = 0, peak = -Infinity;
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    stack.push(start); seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      const x = p % w, y = (p / w) | 0;
      area++; sx += x; sy += y; sr += r[p]; sa += amp[p];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (raw && raw[p] > peak) peak = raw[p];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < w && ny < h) {
          const q = ny * w + nx;
          if (!seen[q] && test(q)) { seen[q] = 1; stack.push(q); }
        }
      }
    }
    each({ area, x: sx / area, y: sy / area, bw: x1 - x0 + 1, bh: y1 - y0 + 1, r: sr / area, amp: sa / area, peak });
  }
}

/**
 * Group matching pixels into blobs and keep only small, round ones. A lens
 * dot at a few metres covers 1 to a few dozen pixels at 320 px wide.
 * Anything bigger is a mirror, a window or a glossy surface; anything long
 * or slanted is a streak along an edge (see shapeOk).
 *
 * If `rejects` (an array) is given, spots that were dropped are added to it
 * with a reason, so the user can see what was ignored:
 *   'shape' - followed the flash but is a streak, a patch or part of a bigger shiny area
 *   'flash' - something small that changed during the scan, but not in our pattern
 * (`sd` from correlateCode is needed for 'flash').
 */
export function findBlobs(r, amp, w, h, {
  rMin = 0.8, ampMin = 6, minArea = 1, maxArea = 40, fillMin = 0.7, aspectMin = 0.6, shapeMinArea = 6,
  raw = null, sd = null, rejects = null,
} = {}) {
  const hit = new Uint8Array(w * h);
  for (let p = 0; p < hit.length; p++) hit[p] = r[p] >= rMin && amp[p] >= ampMin ? 1 : 0;
  const blobs = [];
  eachBlob(w, h, (p) => hit[p], r, amp, raw, (b) => {
    if (b.area < minArea) return;
    const reject = () => { if (rejects && b.area <= maxArea * 4) rejects.push({ x: b.x, y: b.y, area: b.area, bw: b.bw, bh: b.bh, reason: 'shape' }); };
    if (b.area > maxArea || !shapeOk(b, { fillMin, aspectMin, shapeMinArea })) return reject();
    if (raw && !isIsolated(raw, w, h, b.x, b.y, b.peak)) return reject();
    blobs.push({
      x: b.x, y: b.y, area: b.area, r: b.r, amp: b.amp,
      // Score 0..100: mostly how well it follows the code, a little for how strong the blink is.
      score: Math.round(100 * Math.min(1, b.r * (0.85 + 0.15 * Math.min(1, b.amp / 40)))),
    });
  });
  if (rejects && sd) {
    // Small dots that clearly changed but did not follow the pattern (a
    // standby light on its own timer). A strong change and a dot-like shape
    // are both required, so sensor noise and edges moving with the hand are
    // not shown.
    eachBlob(w, h, (p) => !hit[p] && sd[p] >= 2 * ampMin && r[p] < rMin * 0.5, r, amp, null, (b) => {
      if (b.area >= 2 && b.area <= 12 && b.bw <= 5 && b.bh <= 5 && shapeOk(b, { fillMin, aspectMin, shapeMinArea })) {
        rejects.push({ x: b.x, y: b.y, area: b.area, reason: 'flash' });
      }
    });
  }
  return blobs.sort((a, b) => b.score - a.score);
}

/**
 * One ignored spot per thing: pieces of the same streak (within `dist`
 * analysis pixels of each other) are merged into the biggest piece, which
 * keeps its reason.
 */
export function mergeRejects(rejects, dist = 12) {
  const out = [];
  for (const r of [...rejects].sort((a, b) => b.area - a.area)) {
    const near = out.find((o) => Math.hypot(o.x - r.x, o.y - r.y) < dist);
    if (near) near.area += r.area; else out.push({ ...r });
  }
  return out;
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
  fillMin: 0.7,    // a lens glint fills most of its bounding box; a slanted streak does not
  aspectMin: 0.6,  // and is about as wide as it is tall; the edge of a spoon is long and thin
  showIgnored: 0,  // 1 = draw the spots that were ignored, with the reason
  trackDist: 0.12, // how far a spot may move between scans, as a share of picture width
  calibrated: false, // set once the torch timing has been measured on this phone
};

/** Plain words for a spot. Never claims it is a camera. */
export const spotLabel = (b) => (b.confirmed ? 'Seen twice, worth a closer look' : 'Possible reflection');

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };

/**
 * Torch timing calibration. Phones differ a lot in how long the torch takes
 * to switch and how long the camera takes to show it (often 50 to 300 ms).
 * If we start averaging frames too early in each bit, we mix "on" and "off"
 * pictures and the lens blink gets weaker.
 *
 * `samples` = [{ t, v }]: time (ms) and mean brightness of each frame.
 * `switches` = [{ t, on }]: when we asked the torch to change.
 * For each switch we find when the brightness got half way (t50) and 90% of
 * the way (t90) from the old level to the new one.
 * Returns { lagMs, riseMs, step, n } (medians over usable switches), or null
 * if the torch never visibly changed the picture.
 */
export function estimateTorchLag(samples, switches, { minStep = 2 } = {}) {
  const lag50 = [], lag90 = [], steps = [];
  switches.forEach((sw, i) => {
    const end = switches[i + 1]?.t ?? sw.t + 900;
    const before = samples.filter((s) => s.t >= sw.t - 200 && s.t < sw.t);
    const win = samples.filter((s) => s.t >= sw.t && s.t < end);
    const tail = win.slice(Math.floor(win.length * 0.6));
    if (!before.length || tail.length < 2) return;
    const v0 = before.reduce((a, s) => a + s.v, 0) / before.length;
    const v1 = tail.reduce((a, s) => a + s.v, 0) / tail.length;
    const step = v1 - v0;
    if (Math.abs(step) < minStep) return;
    const at = (frac) => win.find((s) => (s.v - v0) / step >= frac)?.t;
    const t50 = at(0.5), t90 = at(0.9);
    if (t50 == null || t90 == null) return;
    lag50.push(t50 - sw.t); lag90.push(t90 - sw.t); steps.push(Math.abs(step));
  });
  if (!lag50.length) return null;
  return { lagMs: median(lag50), riseMs: median(lag90), step: median(steps), n: lag50.length };
}

/**
 * Bit timing from a calibration and the frame rate: skip frames until the
 * torch has fully changed (plus one frame of margin), then keep at least
 * `framesPerBit` frames to average.
 */
export function timingFromCalibration(cal, fps, { framesPerBit = 6 } = {}) {
  const frame = 1000 / Math.max(5, fps);
  const settleMs = Math.round(Math.min(400, Math.max(60, cal.riseMs + frame)) / 10) * 10;
  const bitMs = Math.round(Math.min(900, Math.max(300, settleMs + framesPerBit * frame)) / 10) * 10;
  return { settleMs, bitMs };
}

/**
 * How far the whole picture moved between two grey frames (the phone in a
 * hand drifts). Block matching: try every shift, keep the one where the two
 * pictures differ least. First on a 4x smaller picture for speed, then
 * refined at full size. Returns { dx, dy, gain } in pixels: content at (x, y)
 * in `a` is at (x + dx, y + dy) in `b`. `gain` (0..1) is how much better the
 * best shift fits than no shift at all; near 0 means "can't tell" (a dark or
 * blank wall), and the caller should not move anything.
 */
export function estimateShift(a, b, w, h, maxShift = 24) {
  const k = 4, sw = Math.floor(w / k), sh = Math.floor(h / k);
  const shrink = (g) => {
    const o = new Float32Array(sw * sh);
    for (let y = 0; y < sh * k; y++) for (let x = 0; x < sw * k; x++) o[((y / k) | 0) * sw + ((x / k) | 0)] += g[y * w + x];
    return o;
  };
  const sa = shrink(a), sb = shrink(b);
  // Mean absolute difference over the overlap, sampled every `step` pixels.
  const cost = (A, B, W, H, dx, dy, step) => {
    let sum = 0, n = 0;
    for (let y = Math.max(0, -dy); y < Math.min(H, H - dy); y += step) {
      for (let x = Math.max(0, -dx); x < Math.min(W, W - dx); x += step) {
        sum += Math.abs(A[y * W + x] - B[(y + dy) * W + x + dx]); n++;
      }
    }
    return n > W * H / (step * step) / 4 ? sum / n : Infinity; // ignore shifts with too little overlap
  };
  const r = Math.ceil(maxShift / k);
  let best = { dx: 0, dy: 0, c: Infinity };
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const c = cost(sa, sb, sw, sh, dx, dy, 1);
    if (c < best.c) best = { dx, dy, c };
  }
  let fine = { dx: best.dx * k, dy: best.dy * k, c: Infinity };
  const cx = fine.dx, cy = fine.dy;
  for (let dy = cy - k; dy <= cy + k; dy++) for (let dx = cx - k; dx <= cx + k; dx++) {
    const c = cost(a, b, w, h, dx, dy, 2);
    if (c < fine.c) fine = { dx, dy, c };
  }
  const still = cost(a, b, w, h, 0, 0, 2);
  return { dx: fine.dx, dy: fine.dy, gain: still > 0 ? 1 - fine.c / still : 0 };
}
