// Glint listener: lets the phone app run a Wi-Fi traffic scan.
//
//   node tools/mac/listener.mjs          real scans (needs the Sniffer, see below)
//   node tools/mac/listener.mjs --demo   simulated room, for trying the flow
//
// The phone asks for a scan; this program starts the built-in Wireless
// Diagnostics Sniffer, stops it after the asked time, picks up the capture
// file it writes to /var/tmp, runs the same analysis as the app and keeps the
// result for the phone to collect.
//
// Why the Sniffer: it is the only way this Mac can hear other devices' Wi-Fi
// (the command-line monitor mode gets 0 frames, see MAC_ENV_REPORT.md).
// Pressing its Start and Stop buttons from a script needs a one-time
// permission: System Settings > Privacy & Security > Accessibility, turn on
// the Terminal app. Without it, press Start and Stop in the Sniffer window by
// hand; the file is still picked up and analysed on its own.
//
// While the Sniffer runs, this Mac leaves the Wi-Fi network, so the phone
// cannot reach it until the scan ends. The phone keeps asking until it can.

import http from 'node:http';
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCapture } from '../../src/pcap.js';
import { analyzeCapture, summarizeCapture } from '../../src/analysis.js';
import { fromCapture, fromTraffic } from '../../src/airmap.js';
import { makeDemoCapture } from '../../src/sim.js';
import { makeCode } from '../../src/code.js';

const PORT = Number(process.env.PORT) || 5174;
const DEMO = process.argv.includes('--demo');
const FOLDERS = ['/var/tmp', join(homedir(), 'Downloads/Sniffer captures')];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One scan at a time. `phase`: idle, capturing, waiting (for the file), analysing, done, error.
let state = { phase: 'idle', id: 0 };

// ---------- the Sniffer ----------

/** Press the Sniffer's Start or Stop button. Returns true if it worked. */
function sniffer(button) {
  const script = `
    tell application "Wireless Diagnostics" to activate
    delay 1
    tell application "System Events" to tell process "Wireless Diagnostics"
      if not (exists window "Sniffer") then click menu item "Sniffer" of menu "Window" of menu bar 1
      delay 1
      repeat with e in (entire contents of window "Sniffer")
        try
          if class of e is button and name of e is "${button}" then
            click e
            return "ok"
          end if
        end try
      end repeat
    end tell
    return "no button"`;
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 20000 }, (err, out) => resolve(!err && out.trim() === 'ok'));
  });
}

/** Newest .pcap in the Sniffer folders written after `since` (ms), or null. */
async function newestCapture(since = 0) {
  let best = null;
  for (const dir of FOLDERS) {
    let names = [];
    try { names = await readdir(dir); } catch { continue; }
    for (const n of names) {
      if (!/\.pcap(ng)?$/i.test(n)) continue;
      const path = join(dir, n);
      const st = await stat(path).catch(() => null);
      if (st && st.mtimeMs > since && st.size > 24 && (!best || st.mtimeMs > best.mtime)) best = { path, name: n, mtime: st.mtimeMs, size: st.size };
    }
  }
  return best;
}

/** Wait until the file stops growing (the Sniffer has finished writing it). */
async function settled(file) {
  for (let last = -1; ;) {
    const { size } = await stat(file.path);
    if (size === last) return;
    last = size;
    await sleep(800);
  }
}

// ---------- analysis (the same code the app runs) ----------

function analyse(buffer, job, name) {
  const cap = parseCapture(buffer);
  if (!cap.t.length) throw new Error('The capture has no packets in it.');
  const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  const out = { at: new Date().toISOString(), mode: job.mode, file: name, frames: cap.t.length, summary: summarizeCapture(cap) };
  if (job.mode === 'flash' && job.code) {
    const result = analyzeCapture(cap, { code: job.code, startMs: job.startMs, bitMs: job.bitMs });
    Object.assign(result, { summary: out.summary, fileHash: hash, fileBytes: buffer.byteLength, format: cap.format, linkTypes: [...cap.linkTypes] });
    out.analysis = result;
    out.sources = fromCapture(result);
  } else {
    out.sources = fromTraffic(cap);
  }
  return out;
}

// ---------- one scan ----------

async function run(job) {
  const id = ++state.id;
  const set = (s) => { if (state.id === id) state = { ...state, ...s }; };
  const t0 = Date.now();
  set({ phase: 'capturing', mode: job.mode, startedAt: t0, seconds: job.seconds, auto: null, result: null, error: null });
  try {
    let buffer, name;
    if (DEMO) {
      set({ auto: true });
      await sleep(job.seconds * 1000);
      set({ phase: 'analysing' });
      const code = job.code || makeCode(12);
      const startMs = job.startMs || Date.now() - job.seconds * 1000 + 3000;
      buffer = makeDemoCapture({ code, startMs, seed: (Math.random() * 1e6) | 0 }).buffer;
      name = 'simulated room';
    } else {
      // A flash test must already be recording when the flashes start.
      const auto = await sniffer('Start');
      set({ auto });
      log(auto ? 'Sniffer started' : 'Could not press Start (allow Accessibility for Terminal, or press it by hand)');
      await sleep(Math.max(0, t0 + job.seconds * 1000 - Date.now()));
      if (auto) await sniffer('Stop');
      set({ phase: 'waiting' });
      // The file appears when the Sniffer stops. By hand that can take a while.
      let file = null;
      for (const end = Date.now() + (auto ? 60e3 : 300e3); !file && Date.now() < end; await sleep(1000)) file = await newestCapture(t0);
      if (!file) throw new Error('No capture file arrived. Is the Sniffer window open on the right channel?');
      await settled(file);
      set({ phase: 'analysing' });
      buffer = new Uint8Array(await readFile(file.path)).buffer;
      name = file.name;
    }
    const result = analyse(buffer, job, name);
    set({ phase: 'done', result });
    log(`Done: ${name}, ${result.frames} packets, ${result.sources.length} sources`);
  } catch (e) {
    set({ phase: 'error', error: e.message });
    log('Error: ' + e.message);
  }
}

// ---------- web ----------

function send(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    // The phone app can be opened from another address (the Android app, or
    // the dev server), so any page may ask.
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

const readBody = (req) => new Promise((resolve) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 1e5) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
});

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/hello') return send(res, 200, { ok: true, demo: DEMO, phase: state.phase });
  if (url.pathname === '/api/status') return send(res, 200, state);
  if (url.pathname === '/api/scan' && req.method === 'POST') {
    if (['capturing', 'waiting', 'analysing'].includes(state.phase)) return send(res, 409, { error: 'A scan is already running.' });
    const b = await readBody(req);
    // Checked here: this is the only input that comes from outside.
    const seconds = Math.min(120, Math.max(10, Number(b.seconds) || 30));
    const code = Array.isArray(b.code) && b.code.length >= 6 && b.code.length <= 32 && b.code.every((v) => v === 0 || v === 1) ? b.code : null;
    const job = { mode: b.mode === 'flash' && code ? 'flash' : 'listen', seconds, code, startMs: Number(b.startMs) || null, bitMs: Number(b.bitMs) || 2000 };
    run(job);
    return send(res, 202, { ok: true, seconds });
  }
  if (url.pathname === '/api/latest') {
    // The newest capture on this Mac, read as a plain listen.
    try {
      const file = await newestCapture(0);
      if (!file) return send(res, 404, { error: 'No capture files yet.' });
      const r = analyse(new Uint8Array(await readFile(file.path)).buffer, { mode: 'listen' }, file.name);
      return send(res, 200, r);
    } catch (e) { return send(res, 500, { error: e.message }); }
  }
  send(res, 404, { error: 'Not found' });
});

function log(t) { console.log(`${new Date().toLocaleTimeString()}  ${t}`); }
server.listen(PORT, '0.0.0.0', () => log(`Glint listener on port ${PORT}${DEMO ? ' (simulated room)' : ''}`));
