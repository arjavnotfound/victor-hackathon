import { describe, it, expect, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { makeCode } from '../src/code.js';

// The listener in simulated-room mode, on its own port, driven like the phone does.
const PORT = 5199, base = `http://127.0.0.1:${PORT}`;
const proc = spawn(process.execPath, ['tools/mac/listener.mjs', '--demo'], { env: { ...process.env, PORT: String(PORT) } });
afterAll(() => proc.kill());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (p) => (await fetch(base + p)).json();

describe('listener', () => {
  it('runs a flash test asked for by the phone and finds the camera', async () => {
    for (let i = 0; i < 50 && !(await get('/api/hello').catch(() => null)); i++) await sleep(100);
    const code = makeCode(12);
    const r = await fetch(base + '/api/scan', { method: 'POST', body: JSON.stringify({ mode: 'flash', code, startMs: Date.now() - 20000, seconds: 10 }) });
    expect(r.status).toBe(202);
    // A second scan while one runs is refused.
    expect((await fetch(base + '/api/scan', { method: 'POST', body: '{}' })).status).toBe(409);
    let s;
    for (let i = 0; i < 30; i++) { await sleep(1000); s = await get('/api/status'); if (s.phase === 'done') break; }
    expect(s.phase).toBe('done');
    expect(s.result.analysis.devices[0].verdict).toBe('camera');
    expect(s.result.sources.some((x) => x.verdict === 'camera')).toBe(true);
  }, 40000);
});
