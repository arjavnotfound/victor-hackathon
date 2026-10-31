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
