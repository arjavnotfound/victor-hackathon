import { describe, it, expect, beforeEach } from 'vitest';
import * as store from '../src/store.js';

// A localStorage stand-in with a size limit, like a real browser.
function fakeStorage(limit = 1e6) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      const used = [...m].reduce((a, [kk, vv]) => a + (kk === k ? 0 : vv.length), 0);
      if (used + v.length > limit) throw new Error('QuotaExceededError');
      m.set(k, String(v));
    },
  };
}

describe('store', () => {
  beforeEach(() => { globalThis.localStorage = fakeStorage(); });

  it('records checks and keeps earlier fields', () => {
    store.markCheck('lens', { scans: 1 });
    store.markCheck('lens', { scans: 2 });
    store.markCheck('ir', { camera: 'front' });
    const c = store.getChecks();
    expect(c.lens.scans).toBe(2);
    expect(c.ir.camera).toBe('front');
    expect(c.lens.at).toMatch(/^\d{4}-/);
  });

  it('keeps the newest snapshots, at most six', () => {
    for (let i = 0; i < 9; i++) store.addSnapshot({ time: String(i), mode: 'lens', image: 'x' });
    const s = store.getSnapshots();
    expect(s).toHaveLength(6);
    expect(s[0].time).toBe('8');
  });

  it('drops a photo that is far too big but keeps the spot', () => {
    store.addSnapshot({ time: '1', mode: 'ir', image: 'x'.repeat(store.MAX_IMAGE_CHARS + 1) });
    expect(store.getSnapshots()[0].image).toBe('');
  });

  it('drops the oldest snapshots when storage is full', () => {
    globalThis.localStorage = fakeStorage(250_000);
    for (let i = 0; i < 6; i++) store.addSnapshot({ time: String(i), image: 'x'.repeat(60_000) });
    const s = store.getSnapshots();
    expect(s.length).toBeLessThan(6);
    expect(s[0].time).toBe('5');
  });

  it('survives storage that throws (private window)', () => {
    globalThis.localStorage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(store.getChecks()).toEqual({});
    expect(store.getSnapshots()).toEqual([]);
    expect(() => store.markCheck('lens')).not.toThrow();
  });

  it('clearSession forgets spots and checks but keeps settings', () => {
    store.saveSettings('lens', { rMin: 0.7 });
    store.markCheck('lens');
    store.addSnapshot({ time: '1' });
    store.clearSession();
    expect(store.getChecks()).toEqual({});
    expect(store.getSnapshots()).toEqual([]);
    expect(store.getSettings('lens', { rMin: 0.8, bits: 10 })).toEqual({ rMin: 0.7, bits: 10 });
  });
});
