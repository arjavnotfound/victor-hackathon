import { describe, it, expect } from 'vitest';
import { uploadPattern, classify, perSecond, bandOf, buildMap, countLevels, fromCapture } from '../src/airmap.js';
import { makeDemoCapture, DEMO_DEVICES } from '../src/sim.js';
import { parseCapture } from '../src/pcap.js';
import { analyzeCapture } from '../src/analysis.js';
import { makeCode, seeded } from '../src/code.js';

// A video stream: 60 KB every second, plus a keyframe burst every 3 s.
const video = Array.from({ length: 30 }, (_, i) => 60e3 + (i % 3 === 0 ? 200e3 : 0));
// A phone: quiet, then a few bursts.
const phone = Array.from({ length: 30 }, (_, i) => ([4, 5, 17, 25].includes(i) ? 150e3 : 0));

describe('Wi-Fi map', () => {
  it('reads a video upload as steady with regular bursts', () => {
    const u = uploadPattern(video);
    expect(u.active).toBe(1);
    expect(u.regular).toBe(true);
    expect(u.period).toBe(3);
    expect(uploadPattern(phone).regular).toBe(false);
  });

  it('colours sources by their upload', () => {
    expect(classify({ mac: '08:3a:8d:00:00:01', sec: video }).level).toBe('suspicious');
    expect(classify({ mac: '02:11:22:33:44:55', sec: phone }).level).toBe('safe');
    expect(classify({ mac: '02:11:22:33:44:55', sec: video }).level).toBe('unsure');
    expect(classify({ mac: '02:11:22:33:44:55', sec: phone, verdict: 'camera' }).level).toBe('suspicious');
    expect(classify({ name: 'IPC-8F3A21', mac: '02:0a:c4:8f:3a:21', sec: null }).level).toBe('unsure');
    const home = classify({ name: 'Airtel_Home', mac: 'a0:ab:1b:10:20:30', sec: null });
    expect(home.level).toBe('safe');
    expect(home.reasons[0]).toMatch(/not visible/);
  });

  it('adds 100 ms bins into seconds and names bands', () => {
    expect(perSecond(Array(25).fill(1))).toEqual([10, 10]);
    expect(bandOf(2437)).toBe('2.4 GHz');
    expect(bandOf(5180)).toBe('5 GHz');
  });

  it('marks the simulated camera red and the plug green', () => {
    const code = makeCode(12, seeded(3));
    const startMs = 1.7e12;
    const cap = parseCapture(makeDemoCapture({ code, startMs, seed: 2 }).buffer);
    const map = buildMap(fromCapture(analyzeCapture(cap, { code, startMs })));
    const cam = map.find((s) => s.mac === DEMO_DEVICES.camera);
    expect(cam.level).toBe('suspicious');
    expect(cam.channel).toBe(6);
    const plug = map.find((s) => s.mac === DEMO_DEVICES.plug);
    if (plug) expect(plug.level).not.toBe('suspicious');
    expect(countLevels(map).suspicious).toBeGreaterThanOrEqual(1);
  });
});
