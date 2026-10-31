import { describe, it, expect } from 'vitest';
import { seeded } from '../src/code.js';
import { findBrightSpots, updateIrTracks, visibleFlagged } from '../src/ir.js';

const W = 160, H = 120, FRAME_MS = 33;

// A dark room with sensor noise. `paint(g)` adds things to one frame.
function frame(rand, paint) {
  const g = new Float32Array(W * H);
  for (let p = 0; p < g.length; p++) g[p] = 20 + rand() * 12;
  paint?.(g);
  return g;
}
const dot = (g, x, y) => { for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g[(y + dy) * W + x + dx] = 255; };
const lamp = (g) => { for (let y = 30; y < 70; y++) for (let x = 20; x < 60; x++) g[y * W + x] = 255; };

// Run `n` frames through the detector; `paint(i, g)` draws frame i.
function run(n, paint) {
  const rand = seeded(4), tracks = [];
  let everFlagged = false;
  for (let i = 0; i < n; i++) {
    const t = i * FRAME_MS;
    const spots = findBrightSpots(frame(rand, (g) => paint(i, g)), W, H);
    updateIrTracks(tracks, spots, t);
    if (visibleFlagged(tracks, t).length) everFlagged = true;
  }
  return { tracks, everFlagged };
}

describe('IR check', () => {
  it('flags a steady bright dot after about a second', () => {
    const { tracks, everFlagged } = run(40, (i, g) => dot(g, 100, 50));
    expect(everFlagged).toBe(true);
    expect(tracks).toHaveLength(1);
    expect(Math.abs(tracks[0].x - 100.5)).toBeLessThan(1);
  });

  it('does not flag a steady dot before a second has passed', () => {
    const { everFlagged } = run(25, (i, g) => dot(g, 100, 50)); // about 0.8 s
    expect(everFlagged).toBe(false);
  });

  it('ignores a big bright lamp', () => {
    const { tracks, everFlagged } = run(60, (i, g) => lamp(g));
    expect(everFlagged).toBe(false);
    expect(tracks).toHaveLength(0);
  });

  it('ignores a one-frame flash', () => {
    const { everFlagged } = run(60, (i, g) => { if (i === 10) dot(g, 100, 50); });
    expect(everFlagged).toBe(false);
  });

  it('flags a dot that blinks steadily', () => {
    // On for 0.3 s, off for 0.4 s, so no single run reaches a second.
    const { everFlagged } = run(90, (i, g) => { if ((i * FRAME_MS) % 700 < 300) dot(g, 100, 50); });
    expect(everFlagged).toBe(true);
  });

  it('follows a dot that moves slowly as the phone pans', () => {
    const { everFlagged, tracks } = run(45, (i, g) => dot(g, 40 + i, 50));
    expect(everFlagged).toBe(true);
    expect(tracks).toHaveLength(1);
  });

  it('keeps a small dot next to a lamp, drops the lamp', () => {
    const rand = seeded(2);
    const spots = findBrightSpots(frame(rand, (g) => { lamp(g); dot(g, 120, 90); }), W, H);
    expect(spots).toHaveLength(1);
    expect(spots[0].x).toBeGreaterThan(119);
  });
});
