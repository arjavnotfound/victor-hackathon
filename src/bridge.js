// Talks to the CRCD listener, which runs the Wi-Fi traffic scans
// (tools/mac/listener.mjs). In the browser it is reached through the dev
// server at /api; the Android app uses the address saved in Settings.

const KEY = 'crcd.listener';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function listenerBase() {
  try { return (localStorage.getItem(KEY) || '').replace(/\/+$/, ''); } catch { return ''; }
}
export function setListenerBase(v) {
  try { localStorage.setItem(KEY, v.trim()); } catch { /* storage blocked */ }
}

async function call(path, opts = {}, ms = 2500) {
  const r = await fetch(listenerBase() + path, { ...opts, signal: AbortSignal.timeout(ms) });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Listener answered ${r.status}`);
  return body;
}

/** Is the listener there? Resolves to its hello, or null. */
export async function hello() {
  // The public copy of the app has no listener next to it.
  if (!listenerBase() && location.hostname.endsWith('github.io')) return null;
  try { const h = await call('/api/hello', {}, 1500); return h.ok ? h : null; } catch { return null; }
}

/** Ask for a scan: { mode: 'listen' | 'flash', seconds, code?, startMs?, bitMs? }. */
export const startScan = (job) => call('/api/scan', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(job),
});

export const status = () => call('/api/status');

/**
 * Wait for the scan to finish. The listener is out of reach while it
 * listens (it leaves the Wi-Fi network), so failed requests are expected
 * and simply retried. `onPhase(state)` is called with each answer.
 */
export async function waitForResult(onPhase = () => {}, maxMs = 6 * 60e3) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    try {
      const s = await status();
      onPhase(s);
      if (s.phase === 'done') return s.result;
      if (s.phase === 'error') throw Object.assign(new Error(s.error), { fromListener: true });
    } catch (e) {
      if (e.fromListener) throw e;
      onPhase(null); // out of reach for now
    }
    await sleep(1500);
  }
  throw new Error('The scan took too long.');
}
