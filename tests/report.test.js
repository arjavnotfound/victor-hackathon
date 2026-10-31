import { describe, it, expect } from 'vitest';
import { reportContent, fingerprint, checkLines, LIMITS } from '../src/report-content.js';

const base = {
  made: '2026-11-01T08:00:00.000Z',
  checks: { lens: { at: '2026-11-01T07:58:00.000Z', scans: 2 } },
  snapshots: [{ time: '2026-11-01T07:59:00.000Z', mode: 'lens', label: 'Seen twice, worth a closer look', image: 'data:image/jpeg;base64,AAAA' }],
  phone: { model: 'Pixel 7' },
};

describe('report fingerprint', () => {
  it('is a 64-character hex SHA-256 and repeatable', async () => {
    const a = await fingerprint(reportContent(base));
    const b = await fingerprint(reportContent(base));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
  });

  it('changes when a photo or a word changes', async () => {
    const a = await fingerprint(reportContent(base));
    const photo = { ...base, snapshots: [{ ...base.snapshots[0], image: 'data:image/jpeg;base64,AAAB' }] };
    const label = { ...base, snapshots: [{ ...base.snapshots[0], label: 'Possible reflection' }] };
    expect(await fingerprint(reportContent(photo))).not.toBe(a);
    expect(await fingerprint(reportContent(label))).not.toBe(a);
  });

  it('matches the known SHA-256 of a fixed text', async () => {
    const { sha256Text } = await import('../src/report-content.js');
    expect(await sha256Text('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('lists the checks in plain words and always carries the limits line', () => {
    const lines = checkLines(base.checks, null);
    expect(lines[0][1]).toMatch(/^Yes, 2 scans/);
    expect(lines[1][1]).toBe('No');
    expect(lines[2][1]).toBe('No');
    expect(lines[3][1]).toBe('Not saved on this device');
    expect(reportContent(base).limits).toBe(LIMITS);
  });
});
