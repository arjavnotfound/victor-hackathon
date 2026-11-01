import { describe, it, expect } from 'vitest';
import { smooth, fill, word, pulseGap, isSlow } from '../src/finder.js';

describe('find it', () => {
  it('smooths the last four readings', () => {
    expect(smooth([-90, -60, -62, -58, -60])).toBe(-60);
    expect(smooth([])).toBe(null);
  });

  it('fills the ring with signal strength', () => {
    expect(fill(-95)).toBe(0);
    expect(fill(-30)).toBe(1);
    expect(fill(-60)).toBeGreaterThan(fill(-70));
  });

  it('says warmer or colder only past the noise', () => {
    let r = word(-70, null);
    expect(r.word).toBe('Start walking');
    r = word(-69, r.ref);
    expect(r.word).toBe('Keep going');
    r = word(-67, r.ref); // -67 vs -70: 3 dB stronger
    expect(r.word).toBe('Warmer');
    r = word(-72, r.ref);
    expect(r.word).toBe('Colder');
    expect(word(-40, -60).word).toBe('Very close');
    expect(word(null, -60).word).toBe('Searching');
  });

  it('pulses faster when stronger, and spots slow updates', () => {
    expect(pulseGap(-45)).toBeLessThan(pulseGap(-80));
    expect(isSlow(12000)).toBe(true);
    expect(isSlow(2000)).toBe(false);
  });
});
