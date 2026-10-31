import { describe, it, expect } from 'vitest';
import { makeDemoCapture, DEMO_DEVICES } from '../src/sim.js';
import { parseCapture, readRadiotap } from '../src/pcap.js';
import { analyzeCapture, clipSpikes, pearson } from '../src/analysis.js';
import { makeCode, seeded } from '../src/code.js';

const START = Date.UTC(2026, 10, 1, 10, 0, 0);

function run(seed) {
  const code = makeCode(12, seeded(seed));
  const bytes = makeDemoCapture({ code, startMs: START, seed });
  const cap = parseCapture(bytes.buffer);
  return { cap, res: analyzeCapture(cap, { code, startMs: START }) };
}

describe('Wi-Fi challenge analyzer', () => {
  for (const seed of [1, 2, 3, 42]) {
    it(`picks the camera and rejects the decoys (seed ${seed})`, () => {
      const { res } = run(seed);
      const top = res.devices[0];
      expect(top.mac).toBe(DEMO_DEVICES.camera);
      expect(top.score).toBeGreaterThan(0.7);
      expect(top.p).toBeLessThan(0.01);
      expect(top.verdict).toBe('camera');
      expect(top.vendor).toBe('Espressif');
      for (const d of res.devices.slice(1)) {
        expect(d.score).toBeLessThan(0.6);
        expect(d.verdict).not.toBe('camera');
      }
    });
  }

  it('over 20 different runs: camera always found, decoys average near 0, false alarms rare', () => {
    const decoyScores = [];
    let falseAlarms = 0;
    for (let seed = 100; seed < 120; seed++) {
      const { res } = run(seed);
      expect(res.devices[0].mac).toBe(DEMO_DEVICES.camera);
      expect(res.devices[0].verdict).toBe('camera');
      for (const d of res.devices.slice(1)) {
        if (d.verdict === 'camera') falseAlarms++;
        decoyScores.push(d.score);
      }
    }
    const mean = decoyScores.reduce((a, b) => a + b, 0) / decoyScores.length;
    expect(mean).toBeLessThan(0.25);
    expect(falseAlarms).toBeLessThanOrEqual(1); // out of 80 decoys
  });

  it('finds the camera delay as a positive time offset', () => {
    const { res } = run(5);
    expect(res.devices[0].offsetMs).toBeGreaterThanOrEqual(300);
    expect(res.devices[0].offsetMs).toBeLessThanOrEqual(900);
  });

  it('still works without the start time (searches the whole capture)', () => {
    const code = makeCode(12, seeded(9));
    const cap = parseCapture(makeDemoCapture({ code, startMs: START, seed: 9 }).buffer);
    const res = analyzeCapture(cap, { code, startMs: null });
    expect(res.mode).toBe('whole capture');
    expect(res.devices[0].mac).toBe(DEMO_DEVICES.camera);
  });

  it('a wrong code gives no camera verdict', () => {
    const code = makeCode(12, seeded(4));
    const cap = parseCapture(makeDemoCapture({ code, startMs: START, seed: 4 }).buffer);
    const wrong = makeCode(12, seeded(999));
    const res = analyzeCapture(cap, { code: wrong, startMs: START });
    expect(res.devices.every((d) => d.verdict !== 'camera')).toBe(true);
  });

  it('reads radiotap signal and channel', () => {
    const { cap } = run(1);
    expect(cap.freq[0]).toBe(2437);
    expect(cap.rssi.every((v) => v <= -20 && v >= -95)).toBe(true);
    expect(readRadiotap(new DataView(new Uint8Array([0, 0, 9, 0, 0x20, 0, 0, 0, 0xd0]).buffer), 0).rssi).toBe(-48);
  });

  it('clips keyframe spikes and keeps normal bins', () => {
    const bins = [10, 12, 11, 30, 31, 29, 500, 10, 30];
    const c = clipSpikes(bins);
    expect(c[6]).toBeLessThan(200);
    expect(c[3]).toBe(30);
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
  });
});
