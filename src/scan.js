// Phone lens + IR scanner (Android Chrome).
//
// Lens mode: the torch blinks a random 10-bit code. For every pixel we check
// whether its local contrast rises and falls with the code. Small dots that
// match are lenses (see the physics notes in lens.js).
//
// IR mode: the torch stays off. Many hidden cameras have infrared LEDs for
// night vision (850 nm). Our eyes cannot see that light, but many phone
// cameras can, and show it as a purple or white glow. We look for small,
// very bright dots.
//
// Add ?demo=1 to the URL to use a simulated camera (for laptops and tests).

import { makeCode, codeToString } from './code.js';
import { toGray, localContrast, correlateCode, findBlobs, updateTracks, blinkImage } from './lens.js';
import { addSnapshot, getSnapshots, clearSnapshots } from './store.js';
import { createDemoCamera } from './scan-demo.js';

const $ = (id) => document.getElementById(id);
const video = $('video'), overlay = $('overlay'), statusEl = $('status');
const octx = overlay.getContext('2d');

// Analysis size: the long side is 320 px. Small enough to run every frame on
// a phone, big enough that a lens a few metres away is still 1-3 pixels.
const LONG_SIDE = 320;

const settings = {};
for (const id of ['rMin', 'ampMin', 'maxArea', 'bitMs', 'settleMs', 'irMin']) {
  const el = $(id);
  const show = () => { settings[id] = Number(el.value); $('v_' + id).textContent = el.value; };
  el.addEventListener('input', show);
  show();
}

const isDemo = new URLSearchParams(location.search).has('demo');
let stream = null, track = null, torchOk = false, facing = 'environment';
let mode = 'lens', busy = false, irLoop = false;
let W = 0, H = 0, small = null, sctx = null;
let lastBlobs = [], tracks = [], scans = 0, lastCode = null;
let demoCam = null;

function setStatus(text, kind = '') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + kind;
}

// ---------- camera ----------

async function startCamera() {
  stopCamera();
  if (isDemo) {
    demoCam = demoCam || createDemoCamera();
    stream = demoCam.stream;
  } else {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('This browser cannot open the camera here. Use Chrome over https.', 'bad');
      return false;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
  }
  track = stream.getVideoTracks()[0];
  video.srcObject = stream;
  await video.play().catch(() => {});
  await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));

  // Analysis canvas keeps the same shape as the video.
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = LONG_SIDE / Math.max(vw, vh);
  W = Math.round(vw * s); H = Math.round(vh * s);
  small = document.createElement('canvas');
  small.width = W; small.height = H;
  sctx = small.getContext('2d', { willReadFrequently: true });

  const caps = isDemo ? { torch: true } : (track.getCapabilities?.() || {});
  torchOk = !!caps.torch;
  if (!isDemo && torchOk) await lockCamera(caps);
  resizeOverlay();
  $('snapBtn').disabled = false;
  $('flipBtn').disabled = isDemo;
  return true;
}

function stopCamera() {
  if (stream && !isDemo) stream.getTracks().forEach((t) => t.stop());
  stream = null; track = null;
}

/**
 * Lock exposure, focus and white balance where the phone allows it.
 * Why: auto exposure would see the torch come on, darken the picture to
 * compensate, and partly cancel the very blink we are trying to measure.
 * We lock while the torch is on, so the lit scene is not blown out to white
 * and a lens dot still stands out above it.
 */
async function lockCamera(caps) {
  try {
    await setTorch(true);
    await sleep(700); // let auto exposure settle under the torch
    const st = track.getSettings();
    const adv = {};
    if (caps.exposureMode?.includes('manual')) {
      adv.exposureMode = 'manual';
      if (st.exposureTime) adv.exposureTime = st.exposureTime;
    }
    if (caps.focusMode?.includes('manual')) {
      adv.focusMode = 'manual';
      if (st.focusDistance) adv.focusDistance = st.focusDistance;
    }
    if (caps.whiteBalanceMode?.includes('manual')) {
      adv.whiteBalanceMode = 'manual';
      if (st.colorTemperature) adv.colorTemperature = st.colorTemperature;
    }
    if (Object.keys(adv).length) await track.applyConstraints({ advanced: [adv] });
  } catch (e) {
    console.warn('Could not lock camera settings', e);
  } finally {
    await setTorch(false);
  }
}

async function setTorch(on) {
  if (isDemo) { demoCam.torch = !!on; return; }
  if (!torchOk || !track) return;
  try { await track.applyConstraints({ advanced: [{ torch: !!on }] }); } catch { /* ignore */ }
}

// ---------- lens scan ----------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

function grabGray(out) {
  sctx.drawImage(video, 0, 0, W, H);
  return toGray(sctx.getImageData(0, 0, W, H).data, out);
}

async function runLensScan() {
  if (!torchOk) {
    setStatus('This phone or browser cannot control the torch. Use Chrome on Android, or try IR mode.', 'bad');
    return;
  }
  busy = true;
  $('scanBtn').disabled = true;
  const code = makeCode(10);
  lastCode = code;
  drawBits(code, -1);
  const { bitMs, settleMs } = settings;
  const n = W * H;
  const sums = code.map(() => new Float32Array(n));
  const counts = code.map(() => 0);
  const gray = new Float32Array(n);
  setStatus('Scanning. Hold still…');

  const t0 = performance.now() + 60;
  for (let i = 0; i < code.length; i++) {
    const start = t0 + i * bitMs;
    while (performance.now() < start) await nextFrame();
    setTorch(code[i]); // not awaited: the settle window covers the delay
    drawBits(code, i);
    // Skip the first `settleMs`: the torch and the camera sensor need a moment
    // to change. Frames from that moment are a mix of on and off.
    while (performance.now() < start + bitMs) {
      await nextFrame();
      if (performance.now() < start + settleMs) continue;
      grabGray(gray);
      const s = sums[i];
      for (let p = 0; p < n; p++) s[p] += gray[p];
      counts[i]++;
    }
  }
  await setTorch(false);
  drawBits(code, -1);

  // Every bit needs a few frames, or the average for that bit is meaningless.
  if (Math.min(...counts) < 2) {
    setStatus('The camera sent too few frames. Keep this page on screen, hold still and scan again.', 'bad');
    busy = false;
    $('scanBtn').disabled = false;
    return;
  }

  // Average each bit, then keep only small-scale detail (local contrast).
  sums.forEach((s, i) => {
    const c = Math.max(1, counts[i]);
    for (let p = 0; p < n; p++) s[p] /= c;
  });
  const frames = sums.map((s) => localContrast(s, W, H, 4));
  const { r, amp } = correlateCode(frames, code);
  const raw = blinkImage(sums, code);
  const blobs = findBlobs(r, amp, W, H, { rMin: settings.rMin, ampMin: settings.ampMin, maxArea: settings.maxArea, raw });
  scans++;
  updateTracks(tracks, blobs, W * 0.12);
  lastBlobs = blobs;
  drawHeat(r);

  let maxR = 0;
  for (let p = 0; p < n; p++) if (r[p] > maxR) maxR = r[p];
  $('debugInfo').innerHTML =
    `code ${codeToString(code)}<br>frames per bit ${counts.join(',')}<br>` +
    `max r ${maxR.toFixed(2)} · dots ${blobs.length} · scans ${scans}<br>analysis ${W}×${H}`;

  const confirmed = blobs.filter((b) => b.confirmed);
  if (confirmed.length) {
    setStatus(`Lens confirmed (score ${confirmed[0].score}). Take a snapshot for the report.`, 'good');
  } else if (blobs.length) {
    setStatus(`Possible lens (score ${blobs[0].score}). Move a little to the side and scan again to confirm.`);
  } else {
    setStatus('Nothing blinked back. Try closer (1-3 m), from another angle, with room lights dimmed.');
  }
  busy = false;
  $('scanBtn').disabled = false;
  $('scanBtn').textContent = 'Scan again';
}

// ---------- IR mode ----------

async function runIR() {
  irLoop = true;
  setTorch(false);
  setStatus('IR mode: turn off the lights. Infrared LEDs show up as bright purple or white dots.');
  const n = W * H;
  const gray = new Float32Array(n);
  const contrast = new Float32Array(n);
  while (irLoop && mode === 'ir') {
    await nextFrame();
    grabGray(gray);
    localContrast(gray, W, H, 4, contrast);
    // A pixel counts if it is very bright and much brighter than its
    // surroundings. We reuse the blob finder with "r" = brightness test.
    const r = new Float32Array(n), amp = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      r[p] = gray[p] >= settings.irMin ? 1 : 0;
      amp[p] = contrast[p];
    }
    lastBlobs = findBlobs(r, amp, W, H, { rMin: 0.5, ampMin: 25, maxArea: settings.maxArea })
      .map((b) => ({ ...b, score: Math.min(100, Math.round(b.amp)), ir: true }));
    drawOverlay();
  }
}

// ---------- drawing ----------

function resizeOverlay() {
  const dpr = window.devicePixelRatio || 1;
  overlay.width = overlay.clientWidth * dpr;
  overlay.height = overlay.clientHeight * dpr;
  drawOverlay();
}

// Map analysis pixels to screen pixels. The video uses object-fit: cover,
// so it is scaled up and cropped to fill the screen.
function toScreen(ax, ay) {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const cw = overlay.width, ch = overlay.height;
  const scale = Math.max(cw / vw, ch / vh);
  const offX = (cw - vw * scale) / 2, offY = (ch - vh * scale) / 2;
  return [offX + (ax * vw / W) * scale, offY + (ay * vh / H) * scale, (vw / W) * scale];
}

function drawCircles(ctx, map) {
  for (const b of lastBlobs.slice(0, 8)) {
    const [x, y, k] = map(b.x, b.y);
    const rad = Math.max(18 * (ctx === octx ? (window.devicePixelRatio || 1) : 1), Math.sqrt(b.area) * k * 2);
    const color = b.ir ? '#c58cff' : b.confirmed ? '#3ddc84' : '#ffb547';
    ctx.lineWidth = 3 * (window.devicePixelRatio || 1);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = `bold ${14 * (window.devicePixelRatio || 1)}px system-ui`;
    const label = b.ir ? `IR ${b.score}` : `${b.confirmed ? 'LENS' : 'maybe'} ${b.score}`;
    ctx.fillText(label, x + rad + 4, y + 5);
  }
}

function drawOverlay() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (W) drawCircles(octx, toScreen);
}

function drawHeat(r) {
  const c = $('heat');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  for (let p = 0; p < r.length; p++) {
    const v = Math.max(0, r[p]) ** 3 * 255; // cube so only strong matches stand out
    img.data[p * 4] = img.data[p * 4 + 1] = img.data[p * 4 + 2] = v;
    img.data[p * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function drawBits(code, now) {
  $('bits').innerHTML = code.map((b, i) => `<span class="${b ? 'one' : ''} ${i === now ? 'now' : ''}"></span>`).join('');
}

// ---------- snapshots ----------

function takeSnapshot() {
  if (!W) return;
  const c = document.createElement('canvas');
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = 640 / Math.max(vw, vh);
  c.width = Math.round(vw * s); c.height = Math.round(vh * s);
  const ctx = c.getContext('2d');
  ctx.drawImage(video, 0, 0, c.width, c.height);
  drawCircles(ctx, (ax, ay) => [ax * c.width / W, ay * c.height / H, c.width / W]);
  const top = lastBlobs[0];
  addSnapshot({
    time: new Date().toISOString(),
    mode,
    code: mode === 'lens' && lastCode ? codeToString(lastCode) : '',
    note: top ? `${top.ir ? 'IR dot' : top.confirmed ? 'Confirmed lens' : 'Possible lens'}, score ${top.score}` : 'No dot marked',
    image: c.toDataURL('image/jpeg', 0.75),
  });
  showThumbs();
  setStatus('Snapshot saved. It will be added to the evidence report.', 'good');
}

function showThumbs() {
  $('thumbs').innerHTML = getSnapshots().map((s) => `<img src="${s.image}" alt="${s.note}" title="${s.note}">`).join('');
}

// ---------- buttons ----------

$('scanBtn').addEventListener('click', async () => {
  if (busy) return;
  if (!stream) {
    try {
      if (!(await startCamera())) return;
    } catch (e) {
      setStatus('Camera blocked: ' + e.message + '. Allow camera access and reload.', 'bad');
      return;
    }
    $('scanBtn').textContent = mode === 'lens' ? 'Scan' : 'Pause';
    if (mode === 'ir') runIR();
    else setStatus(torchOk
      ? 'Point at the object from 1-3 m and press Scan.'
      : 'This phone or browser cannot control the torch. Use Chrome on Android, or try IR mode.', torchOk ? '' : 'bad');
    return;
  }
  if (mode === 'lens') runLensScan().then(drawOverlay);
  else if (irLoop) { irLoop = false; $('scanBtn').textContent = 'Resume'; }
  else { $('scanBtn').textContent = 'Pause'; runIR(); }
});

function setMode(m) {
  if (busy) return;
  mode = m;
  irLoop = false;
  lastBlobs = [];
  drawOverlay();
  $('modeLens').classList.toggle('on', m === 'lens');
  $('modeIR').classList.toggle('on', m === 'ir');
  if (isDemo && demoCam) demoCam.ir = m === 'ir';
  if (!stream) return;
  if (m === 'ir') { $('scanBtn').textContent = 'Pause'; runIR(); }
  else { $('scanBtn').textContent = 'Scan'; setStatus('Point at the object from 1-3 m and press Scan.'); }
}
$('modeLens').addEventListener('click', () => setMode('lens'));
$('modeIR').addEventListener('click', () => setMode('ir'));
$('snapBtn').addEventListener('click', takeSnapshot);
$('flipBtn').addEventListener('click', async () => {
  // Front cameras often have a weaker IR filter, so they can see IR LEDs better.
  facing = facing === 'environment' ? 'user' : 'environment';
  await startCamera();
  if (mode === 'ir') runIR();
});
$('debugBtn').addEventListener('click', () => $('debug').classList.toggle('hidden'));
$('clearBtn').addEventListener('click', () => {
  tracks = []; scans = 0; lastBlobs = []; clearSnapshots(); showThumbs(); drawOverlay();
});
window.addEventListener('resize', resizeOverlay);
showThumbs();
if (isDemo) setStatus('Demo camera: a simulated room with one hidden lens. Tap Start camera.');
