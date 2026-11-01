import { describe, it, expect } from 'vitest';
import { makeCode, seeded } from '../src/code.js';
import { localContrast, correlateCode, findBlobs, updateTracks, blinkImage, spotLabel } from '../src/lens.js';

// Build N synthetic grey frames: noisy room, a 2x2 lens that follows the code,
// a big 30x20 glossy patch that also follows the code, and an LED with its own pattern.
function scene(code, rand, { lensAt = [100, 60], raw = false } = {}) {
  const W = 320, H = 180;
  const ledPattern = makeCode(code.length, rand);
  return code.map((bit, i) => {
    const g = new Float32Array(W * H);
    for (let p = 0; p < g.length; p++) g[p] = 50 + bit * 20 + (rand() - 0.5) * 10;
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) g[(lensAt[1] + y) * W + lensAt[0] + x] += bit * 120;
    for (let y = 20; y < 40; y++) for (let x = 200; x < 230; x++) g[y * W + x] += bit * 90;
    g[150 * W + 300] += ledPattern[i] * 150;
    return raw ? g : localContrast(g, W, H, 4);
  });
}

describe('lens finder', () => {
  it('finds the small lens and ignores the big glossy patch', () => {
    const rand = seeded(7);
    const code = makeCode(10, rand);
    const { r, amp } = correlateCode(scene(code, rand), code);
    const blobs = findBlobs(r, amp, 320, 180, { rMin: 0.8, ampMin: 6, maxArea: 40 });
    expect(blobs.length).toBeGreaterThanOrEqual(1);
    expect(Math.abs(blobs[0].x - 100.5)).toBeLessThan(2);
    expect(Math.abs(blobs[0].y - 60.5)).toBeLessThan(2);
    expect(blobs[0].score).toBeGreaterThan(80);
    // nothing reported inside the glossy patch
    expect(blobs.some((b) => b.x > 205 && b.x < 225 && b.y > 25 && b.y < 35)).toBe(false);
  });

  it('drops the corner of a big shiny patch with the ring test', () => {
    const rand = seeded(5);
    const code = makeCode(10, rand);
    const rawFrames = scene(code, seeded(9), { raw: true });
    const frames = rawFrames.map((g) => localContrast(g, 320, 180, 4));
    const { r, amp } = correlateCode(frames, code);
    const blobs = findBlobs(r, amp, 320, 180, { raw: blinkImage(rawFrames, code) });
    expect(blobs.some((b) => b.x > 195 && b.x < 235 && b.y > 15 && b.y < 45)).toBe(false);
    expect(Math.abs(blobs[0].x - 100.5)).toBeLessThan(2);
  });

  it('confirms a lens seen in two scans after moving a little', () => {
    const rand = seeded(3);
    const tracks = [];
    for (const at of [[100, 60], [108, 64]]) {
      const code = makeCode(10, rand);
      const { r, amp } = correlateCode(scene(code, rand, { lensAt: at }), code);
      const blobs = findBlobs(r, amp, 320, 180);
      updateTracks(tracks, blobs, 38);
      if (at[0] === 108) expect(blobs[0].confirmed).toBe(true);
      else expect(blobs[0].confirmed).toBe(false);
    }
  });

  it('makes balanced codes', () => {
    const rand = seeded(11);
    for (let k = 0; k < 50; k++) {
      const c = makeCode(12, rand);
      const ones = c.reduce((a, b) => a + b, 0);
      expect(ones).toBeGreaterThanOrEqual(4);
      expect(ones).toBeLessThanOrEqual(8);
    }
  });

  it('a glint seen once stays a possible reflection', () => {
    const tracks = [];
    updateTracks(tracks, [{ x: 50, y: 50, score: 90 }], 38);
    // Second scan after moving: the glint is gone, a different dot appears far away.
    const second = [{ x: 200, y: 120, score: 85 }];
    updateTracks(tracks, second, 38);
    expect(second[0].confirmed).toBe(false);
    expect(spotLabel(second[0])).toBe('Possible reflection');
    expect(tracks).toHaveLength(2);
  });

  it('a spot found again nearby is seen twice, and says so in plain words', () => {
    const tracks = [];
    updateTracks(tracks, [{ x: 50, y: 50, score: 90 }], 38);
    const second = [{ x: 60, y: 56, score: 88 }];
    updateTracks(tracks, second, 38);
    expect(second[0].confirmed).toBe(true);
    expect(spotLabel(second[0])).toBe('Seen twice, worth a closer look');
  });

  it('two spots in one scan cannot both claim the same earlier spot', () => {
    const tracks = [];
    updateTracks(tracks, [{ x: 50, y: 50, score: 90 }], 38);
    const second = [{ x: 52, y: 50, score: 90 }, { x: 55, y: 52, score: 80 }];
    updateTracks(tracks, second, 38);
    expect(second.filter((b) => b.confirmed)).toHaveLength(1);
  });
});

import { estimateTorchLag, timingFromCalibration, estimateShift } from '../src/lens.js';

describe('torch calibration', () => {
  // Simulated phone: 30 fps, torch shows up 150 ms after the command and
  // takes 60 ms to reach full brightness.
  function record(lag = 150, ramp = 60) {
    const switches = [], samples = [];
    for (let i = 0; i < 6; i++) switches.push({ t: 300 + i * 700, on: i % 2 === 0 });
    const level = (t) => {
      let v = 40;
      for (const s of switches) {
        const f = Math.min(1, Math.max(0, (t - s.t - lag) / ramp));
        if (f > 0) v = s.on ? 40 + 30 * f : 70 - 30 * f;
      }
      return v;
    };
    for (let t = 0; t < 300 + 6 * 700; t += 33) samples.push({ t, v: level(t) + Math.sin(t) * 0.5 });
    return { samples, switches };
  }

  it('measures how slow the torch is', () => {
    const { samples, switches } = record(150, 60);
    const cal = estimateTorchLag(samples, switches);
    expect(cal.n).toBe(6);
    expect(cal.lagMs).toBeGreaterThan(150);
    expect(cal.lagMs).toBeLessThan(230);
    expect(cal.riseMs).toBeGreaterThanOrEqual(cal.lagMs);
    expect(cal.riseMs).toBeLessThan(270);
  });

  it('returns null when the torch never changes the picture', () => {
    const { samples, switches } = record();
    expect(estimateTorchLag(samples.map((s) => ({ t: s.t, v: 50 })), switches)).toBeNull();
  });

  it('turns a slow torch into longer settle and bit times', () => {
    const fast = timingFromCalibration({ riseMs: 70 }, 30);
    const slow = timingFromCalibration({ riseMs: 260 }, 30);
    expect(slow.settleMs).toBeGreaterThan(fast.settleMs);
    expect(slow.bitMs).toBeGreaterThan(fast.bitMs);
    // at least 6 frames left to average in each bit
    expect((slow.bitMs - slow.settleMs) / (1000 / 30)).toBeGreaterThanOrEqual(6);
  });
});

describe('hand movement', () => {
  it('finds how far the picture moved', () => {
    const rand = seeded(21), W = 320, H = 180;
    // Smooth random texture, like a real room at low resolution.
    const base = new Float32Array((W + 60) * (H + 60));
    for (let p = 0; p < base.length; p++) base[p] = rand() * 255;
    const tex = localContrast(base, W + 60, H + 60, 3).map((v, i) => base[i] - v); // box blur
    const crop = (ox, oy) => {
      const g = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = tex[(y + oy) * (W + 60) + x + ox];
      return g;
    };
    // Camera moves right/down by (7, 4), so content moves left/up.
    const a = crop(20, 20), b = crop(27, 24);
    const moved = estimateShift(a, b, W, H);
    expect(moved).toMatchObject({ dx: -7, dy: -4 });
    expect(moved.gain).toBeGreaterThan(0.5);
    expect(estimateShift(a, a, W, H)).toMatchObject({ dx: 0, dy: 0 });
  });
});

import { shapeOk, mergeRejects } from '../src/lens.js';

// A map where the given pixels follow the code perfectly (r = 1, big blink).
function mapOf(w, h, pixels) {
  const r = new Float32Array(w * h), amp = new Float32Array(w * h);
  for (const [x, y] of pixels) { r[y * w + x] = 1; amp[y * w + x] = 30; }
  return { r, amp };
}
const disc = (cx, cy, rad) => {
  const px = [];
  for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad + rad) px.push([cx + x, cy + y]);
  return px;
};

describe('shape test', () => {
  it('keeps a small round dot', () => {
    const { r, amp } = mapOf(100, 60, disc(30, 30, 2));
    const rejects = [];
    const blobs = findBlobs(r, amp, 100, 60, { rejects });
    expect(blobs).toHaveLength(1);
    expect(rejects).toHaveLength(0);
  });

  it('drops a long slanted streak, like the edge of a spoon', () => {
    const px = [];
    for (let i = 0; i < 14; i++) px.push([20 + i, 10 + i], [21 + i, 10 + i]); // 2 px thick, 45 degrees
    const { r, amp } = mapOf(100, 60, px);
    const rejects = [];
    expect(findBlobs(r, amp, 100, 60, { rejects })).toHaveLength(0);
    expect(rejects[0].reason).toBe('shape');
  });

  it('drops a long straight streak', () => {
    const px = [];
    for (let i = 0; i < 12; i++) px.push([30 + i, 20], [30 + i, 21]);
    const { r, amp } = mapOf(100, 60, px);
    expect(findBlobs(r, amp, 100, 60)).toHaveLength(0);
  });

  it('drops a big blob, like a mirror', () => {
    const { r, amp } = mapOf(100, 60, disc(50, 30, 6)); // about 120 px, over maxArea 40
    const rejects = [];
    expect(findBlobs(r, amp, 100, 60, { rejects })).toHaveLength(0);
    expect(rejects).toEqual([expect.objectContaining({ reason: 'shape' })]);
  });

  it('never judges the shape of a dot too small to have one', () => {
    expect(shapeOk({ area: 2, bw: 2, bh: 1 })).toBe(true);
    expect(shapeOk({ area: 12, bw: 12, bh: 1 })).toBe(false);
    expect(shapeOk({ area: 21, bw: 5, bh: 5 })).toBe(true);
    expect(shapeOk({ area: 6, bw: 3, bh: 3 })).toBe(true); // a small pixelated dot
    expect(shapeOk({ area: 28, bw: 15, bh: 14 })).toBe(false); // a slanted 2 px streak
  });

  it('reports a small thing that changed but not in the pattern', () => {
    const w = 60, h = 40, n = w * h;
    const r = new Float32Array(n), amp = new Float32Array(n), sd = new Float32Array(n);
    for (const [x, y] of disc(20, 20, 1)) { sd[y * w + x] = 20; r[y * w + x] = 0.1; }
    sd[5 * w + 50] = 20; // one noisy pixel: not reported
    const rejects = [];
    findBlobs(r, amp, w, h, { rejects, sd });
    expect(rejects).toEqual([expect.objectContaining({ reason: 'flash' })]);
  });
});

describe('ignored spots', () => {
  it('shows one circle per streak, not one per piece', () => {
    const pieces = [0, 4, 8, 12].map((i) => ({ x: 20 + i, y: 10 + i * 0.7, area: 1 + (i === 8 ? 3 : 0), reason: 'shape' }));
    const merged = mergeRejects([...pieces, { x: 80, y: 40, area: 3, reason: 'flash' }]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ x: 28, area: 7, reason: 'shape' });
  });
});

import { isIsolated } from '../src/lens.js';

describe('isolation test', () => {
  it('passes a lone dot and fails a dot that sits on a thin slanted streak', () => {
    const w = 60, h = 40;
    const lone = new Float32Array(w * h); lone[20 * w + 30] = 50;
    expect(isIsolated(lone, w, h, 30, 20, 50)).toBe(true);
    const streak = new Float32Array(w * h);
    for (let i = -15; i <= 15; i++) streak[Math.round(20 + i * 0.75) * w + 30 + i] = 45; // 1 px line, about 37 degrees
    streak[20 * w + 30] = 50;
    expect(isIsolated(streak, w, h, 30, 20, 50)).toBe(false);
  });
});
