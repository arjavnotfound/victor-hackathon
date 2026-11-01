// Wi-Fi challenge page: flicker the code, then analyze the Mac capture.

import { makeCode, codeToString } from './code.js';
import { saveAir } from './store.js';
import { fromCapture } from './airmap.js';
import { getChallenge, saveChallenge, getSnapshots, saveWifiResult, getWifiResult, getChecks, getPhone } from './store.js';
import { drawTraffic, drawRssi, screenTheme } from './charts.js';
import { buildReport } from './report.js';
import { initPage } from './ui.js';

const $ = (id) => document.getElementById(id);
initPage('Wi-Fi traffic');
const BIT_MS = 2000;
const FLICKER_HZ = 5; // fast enough to change almost every video frame's content

let session = getChallenge();       // { code: [..], startMs, bitMs }
let result = null, selected = 0, fileName = '', isDemo = false;

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'progress') $('progress').textContent = m.text;
  if (m.type === 'error') { $('progress').textContent = 'Could not read that file: ' + m.text; }
  if (m.type === 'summary') {
    $('progress').textContent = '';
    showSummary(m.summary, 'No secret code yet, so this file can\'t be tested for a camera. Run Step 1 with the Sniffer recording, then drop the new file. Here is what is in this one:');
  }
  if (m.type === 'done') {
    result = m.result; selected = 0; $('progress').textContent = '';
    // A short copy for the phone's Results page and report.
    const top = result.devices[0];
    saveWifiResult({ at: new Date().toISOString(), verdict: top ? top.verdict : 'none', mac: top?.mac || '', demo: isDemo, fileHash: m.result.fileHash });
    saveAir({ capture: fromCapture(result) });
    if (result.devices.length) showResult();
    else showSummary(result.summary, 'Nothing in this file was streaming video during the test, so there is no camera to score. Check the Sniffer was on the right channel and recording while the screen flashed. Here is what it did catch:');
  }
};

function showSession() {
  $('codeLine').textContent = session ? `Saved code: ${codeToString(session.code)}` : '';
  if (!session) { $('sessionNote').textContent = 'No challenge run yet on this device. Run one, or type the code and start time.'; return; }
  $('codeIn').value = codeToString(session.code);
  $('startIn').value = session.startMs ? new Date(session.startMs).toISOString() : '';
  $('sessionNote').textContent = `Last challenge: ${new Date(session.startMs).toLocaleString()}. Code and start time are filled in for you.`;
}

// ---------- 1. flicker ----------

/**
 * Bit 1 = the screen alternates black/white 5 times a second. Every video
 * frame the camera captures is different from the last, so its encoder must
 * send lots of data. Bit 0 = steady grey, nothing changes, little data.
 * The start time is taken from the wall clock (Date.now) because the Mac
 * Sniffer stamps packets with wall-clock time too.
 */
async function runChallenge() {
  const code = makeCode(12);
  // The code is saved right away, so it is kept even if you skip the flashing.
  // Start time = when bit 1 begins (after the 3 s countdown).
  session = { code, startMs: Date.now() + 3000, bitMs: BIT_MS };
  saveChallenge(session);
  isDemo = false;
  showSession();

  const fl = $('flicker');
  fl.classList.add('on');
  try { await fl.requestFullscreen?.(); } catch { /* fine without */ }
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch { /* fine */ }
  let skipped = false;
  $('skipBtn').onclick = (e) => { e.stopPropagation(); skipped = true; };

  for (let c = 3; c > 0 && !skipped; c--) {
    fl.style.background = '#777'; $('count').textContent = c;
    $('flickInfo').textContent = 'Point the screen at the object.';
    await new Promise((r) => setTimeout(r, 1000));
  }
  $('count').textContent = '';
  if (!skipped) {
    session.startMs = Date.now(); // exact moment bit 1 starts
    saveChallenge(session);
    showSession();
  }
  const t0 = performance.now();
  const total = code.length * BIT_MS;
  await new Promise((resolve) => {
    const tick = () => {
      const el = performance.now() - t0;
      if (skipped || el >= total) return resolve();
      const i = Math.floor(el / BIT_MS);
      if (code[i]) fl.style.background = Math.floor(el / (500 / FLICKER_HZ)) % 2 ? '#fff' : '#000';
      else fl.style.background = '#777';
      $('flickInfo').textContent = `bit ${i + 1} of ${code.length}`;
      $('flickBar').style.width = `${(el / total) * 100}%`;
      requestAnimationFrame(tick);
    };
    tick();
  });
  fl.classList.remove('on');
  $('flickBar').style.width = '0';
  try { await document.exitFullscreen?.(); } catch { /* fine */ }
  wake?.release?.();
  $('progress').textContent = skipped
    ? 'Skipped. The code is saved and will be used for the next file you drop.'
    : 'Done. Stop the Sniffer on the Mac and drop the capture file below.';
}

// ---------- 2. analyze ----------

function readInputs() {
  const bits = $('codeIn').value.replace(/[^01]/g, '').split('').map(Number);
  const st = $('startIn').value.trim();
  const startMs = st ? Date.parse(st) : null;
  // No code = we can't test for a camera, but we still show what is in the file.
  return { code: bits.length >= 6 ? bits : null, startMs: Number.isFinite(startMs) ? startMs : null, bitMs: BIT_MS };
}

async function analyzeFile(file) {
  const opts = readInputs();
  if (opts.code) session = { ...opts };
  $('results').hidden = true;
  $('summary').hidden = true;
  fileName = file.name;
  isDemo = false;
  $('progress').textContent = `Loading ${file.name}…`;
  const buffer = await file.arrayBuffer();
  worker.postMessage({ type: 'analyze', buffer, opts }, [buffer]);
}

function runDemo() {
  // A fresh secret code, as if the challenge had just been run 40 s ago.
  const code = makeCode(12);
  const startMs = Date.now() - 40000;
  session = { code, startMs, bitMs: BIT_MS };
  showSession();
  $('sessionNote').textContent = 'Sample data: one hidden camera and four other devices.';
  fileName = 'demo (simulated)';
  isDemo = true;
  worker.postMessage({ type: 'demo', seed: Math.floor(Math.random() * 1e6), opts: session });
}

// ---------- 3. results ----------

function showSummary(sum, message) {
  $('summary').hidden = false;
  $('summaryMsg').textContent = message;
  const secs = Math.max(0, sum.end - sum.start);
  $('summaryInfo').textContent = `${sum.totalFrames} packets over ${secs.toFixed(0)} s from ${sum.transmitters} devices` +
    (sum.channels.length ? `, channel ${sum.channels.join(', ')}` : '') + '.';
  $('summaryTable').innerHTML = sum.top.map((d) => `
    <tr><td class="mono">${d.mac}</td><td>${d.vendor}</td><td class="mono">${d.frames}</td>
    <td class="mono">${(d.bytes / 1024).toFixed(0)} KB</td><td class="mono">${d.meanRssi != null ? d.meanRssi.toFixed(0) : '—'}</td></tr>`).join('');
  $('summary').scrollIntoView({ behavior: 'smooth' });
}

const VERDICT = {
  camera: ['A device followed the flashes', 'verdict camera'],
  maybe: ['A device partly followed the flashes', 'verdict maybe'],
  no: ['No device followed the flashes', 'verdict no'],
};

function showResult() {
  $('results').hidden = false;
  $('reportSec').hidden = false;
  const devs = result.devices;
  if (!devs.length) {
    $('verdict').textContent = 'No busy devices in this capture';
    $('verdict').className = 'verdict no';
    $('verdictSub').textContent = 'Check the Sniffer channel and that the capture covers the challenge time.';
    return;
  }
  const top = devs[0];
  const [title, cls] = VERDICT[top.verdict];
  $('verdict').textContent = `${title}${isDemo ? ' (sample data)' : ''}`;
  $('verdict').className = cls;
  $('verdictSub').textContent = top.verdict === 'no'
    ? 'No device\'s traffic followed the code. If you suspect a camera, try another channel or get closer.'
    : `${top.mac} · ${top.vendor} · score ${top.score.toFixed(2)}. ` +
      (top.verdict === 'camera' ? 'Worth a closer look. Run it once more to be sure.' : 'Run it again to check.');
  $('devTable').innerHTML = devs.slice(0, 12).map((d, i) => `
    <tr data-i="${i}" class="${i === selected ? 'sel' : ''}">
      <td class="mono">${d.mac}</td>
      <td>${d.vendor}</td>
      <td class="mono">${d.score.toFixed(2)}</td>
      <td class="mono">${d.p.toFixed(3)}</td>
      <td class="mono">${d.meanRssi != null ? d.meanRssi.toFixed(0) : '—'}</td>
      <td><span class="pill ${d.verdict === 'camera' ? 'bad' : d.verdict === 'maybe' ? 'warn' : 'good'}">${d.verdict}</span></td>
    </tr>`).join('');
  drawCharts();
  const ch = result.channels.map((c) => `${c.ch}`).join(', ') || 'unknown';
  $('capInfo').textContent = `${result.totalFrames} frames, ${result.transmitters} transmitters, channel ${ch}, ` +
    `${result.mode === 'start time' ? 'aligned to the recorded start time' : 'start time unknown, searched the whole capture'}. ` +
    `Capture SHA-256: ${result.fileHash}`;
  $('results').scrollIntoView({ behavior: 'smooth' });
}

function drawCharts() {
  if (!result?.devices.length) return;
  drawTraffic($('traffic'), result, result.devices[selected], screenTheme());
  const others = result.devices.filter((_, i) => i !== selected).slice(0, 2);
  drawRssi($('rssi'), result, [result.devices[selected], ...others], screenTheme());
}

$('devTable').addEventListener('click', (e) => {
  const tr = e.target.closest('tr');
  if (!tr) return;
  selected = Number(tr.dataset.i);
  [...$('devTable').children].forEach((r) => r.classList.toggle('sel', r === tr));
  drawCharts();
});

// ---------- 4. report ----------

async function makeReport() {
  $('reportBtn').disabled = true;
  try {
    const { blob, hash, name } = await buildReport({
      session, result, device: result?.devices[selected], snapshots: getSnapshots(), fileName, demo: isDemo,
      checks: getChecks(), wifi: getWifiResult(), phone: getPhone(),
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('hash').textContent = hash;
    $('hashBox').hidden = false;
  } catch (e) {
    alert('Could not make the report: ' + e.message);
  } finally {
    $('reportBtn').disabled = false;
  }
}

// ---------- wiring ----------

// Dropping a file anywhere on the page counts (and stops the browser opening it).
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.target.closest('#drop')) return;
  if (e.dataTransfer.files[0]) analyzeFile(e.dataTransfer.files[0]);
});
const drop = $('drop');
drop.addEventListener('click', pickFile);

/**
 * Open the file dialog. Chrome's file picker can start in Downloads, where
 * "Sniffer captures" is a shortcut to /var/tmp (where the Mac Sniffer saves).
 * The `id` makes Chrome reopen the last folder you picked from, so after the
 * first time it opens straight in /var/tmp. Other browsers use a plain input.
 */
async function pickFile() {
  if (!window.showOpenFilePicker) return $('fileIn').click();
  try {
    const [handle] = await window.showOpenFilePicker({
      id: 'victor-sniffer',
      startIn: 'downloads',
      types: [{ description: 'Wi-Fi capture', accept: { 'application/octet-stream': ['.pcap', '.pcapng', '.cap'] } }],
    });
    analyzeFile(await handle.getFile());
  } catch (e) {
    if (e.name !== 'AbortError') $('fileIn').click();
  }
}
$('fileIn').addEventListener('change', (e) => e.target.files[0] && analyzeFile(e.target.files[0]));
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault(); drop.classList.remove('over');
  if (e.dataTransfer.files[0]) analyzeFile(e.dataTransfer.files[0]);
});
$('startBtn').addEventListener('click', runChallenge);
$('demoBtn').addEventListener('click', runDemo);
$('reportBtn').addEventListener('click', makeReport);
window.addEventListener('resize', drawCharts);
$('snapCount').textContent = getSnapshots().length;
if (getSnapshots().length) $('reportSec').hidden = false; // lens-only report is still useful
showSession();
