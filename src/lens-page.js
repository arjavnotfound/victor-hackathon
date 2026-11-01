// Lens check (Android Chrome).
//
// The torch blinks a random code. For every pixel we check whether its local
// contrast rises and falls with the code. Small dots that match are spots
// worth a closer look (see the physics notes in lens.js). A spot found again
// after the phone has moved a little is much less likely to be a glint.
//
// Add ?demo=1 to the URL to use a simulated camera (for laptops and tests).

import { makeCode, codeToString } from './code.js';
import {
  toGray, localContrast, correlateCode, findBlobs, updateTracks, blinkImage, LENS_DEFAULTS, spotLabel,
  estimateTorchLag, timingFromCalibration, estimateShift, mergeRejects,
} from './lens.js';
import { addSnapshot, getSnapshots, markCheck, savePhone, getChecks } from './store.js';
import { openCamera, setTorch, lockForTorch, phoneInfo } from './camera.js';
import { $, isDemo, initPage, wireSheetButtons } from './ui.js';
import {
  makeGrabber, attachStream, screenMapper, drawSpots, sizeOverlay, snapshot, buildSliders, showSupport, startCoverage, applySettings,
} from './cam-page.js';

initPage('Lens check');
const video = $('video'), overlay = $('overlay');
const octx = overlay.getContext('2d');

const settings = buildSliders($('sliders'), 'lens', LENS_DEFAULTS, [
  ['rMin', 'Match needed (correlation)', 0.5, 0.99, 0.01],
  ['ampMin', 'Smallest blink (grey levels)', 1, 60, 1],
  ['maxArea', 'Biggest dot (pixels)', 2, 200, 1],
  ['fillMin', 'Roundness: fills its box at least', 0.3, 1, 0.05],
  ['aspectMin', 'Roundness: width to height at least', 0.2, 1, 0.05],
  ['bitMs', 'Bit length (ms)', 200, 900, 10],
  ['settleMs', 'Settle time (ms)', 40, 400, 10],
  ['bits', 'Code length (bits)', 6, 16, 1],
]);

let cam = null, grab = null, busy = false, torchOk = false, calTried = false;
let spots = [], ignored = [], tracks = [], scans = getChecks().lens?.scans || 0, lastCode = null;

const style = (s) => ({ color: s.confirmed ? '#ffb340' : 'rgba(255, 255, 255, .9)', text: s.confirmed ? 'Seen twice' : 'Possible reflection' });
const REASON = { shape: 'Wrong shape', flash: "Doesn't follow the flash" };
const ignoredStyle = (s) => ({ color: 'rgba(200, 200, 205, .75)', text: REASON[s.reason], small: true });

function setStatus(text, warn = false) {
  $('status').textContent = text;
  $('status').parentElement.classList.toggle('warn', warn);
}

// ---------- camera ----------

async function start() {
  cam = await openCamera({ demo: isDemo });
  await attachStream(video, cam.stream);
  grab = makeGrabber(video);
  torchOk = !!cam.caps.torch;
  showSupport($('supportTable'), cam);
  savePhone(await phoneInfo(cam));
  redraw();
  followHand();
  $('scanBtn').textContent = 'Scan';
  if (torchOk) setStatus('Point the phone at the area. Hold steady. Then move a little to the side and scan again.');
  else setStatus('This phone or browser does not let the page use the torch, so the lens check cannot run here. The night-vision check still works.', true);
  if (!torchOk) { $('scanBtn').textContent = 'Go to the night-vision check'; $('hint').hidden = true; }
}

// ---------- scan ----------

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function scan() {
  busy = true;
  $('scanBtn').disabled = true;
  document.body.classList.add('scanning');
  $('hint').hidden = true;
  setStatus('Getting the camera ready…');
  const locked = await lockForTorch(cam);
  showSupport($('supportTable'), cam, locked);
  if (!settings.calibrated && !calTried) await calibrate();

  const code = makeCode(settings.bits);
  lastCode = code;
  const { bitMs, settleMs } = settings;
  const { W, H } = grab;
  const n = W * H;
  const sums = code.map(() => new Float32Array(n));
  const counts = code.map(() => 0);
  const gray = new Float32Array(n);
  let torchMisses = 0, frames = 0;
  // One slow read-back should not end the scan; most of the code failing should.
  const tooManyMisses = () => torchMisses > code.length / 2;
  setStatus('Scanning. Hold steady…');
  $('hint').hidden = true;

  const t0 = performance.now() + 60;
  for (let i = 0; i < code.length && !tooManyMisses(); i++) {
    const start = t0 + i * bitMs;
    while (performance.now() < start) await nextFrame();
    // Not awaited: the settle window below covers the delay. The result is
    // checked so a torch that never switches on is reported, not hidden.
    setTorch(cam, code[i]).then((ok) => { if (!ok) torchMisses++; });
    drawBits(code, i);
    // Skip the first `settleMs`: the torch and the camera sensor need a moment
    // to change. Frames from that moment are a mix of on and off.
    while (performance.now() < start + bitMs) {
      await nextFrame();
      if (performance.now() < start + settleMs) continue;
      toGray(grab.rgba(), gray);
      const s = sums[i];
      for (let p = 0; p < n; p++) s[p] += gray[p];
      counts[i]++; frames++;
    }
  }
  await setTorch(cam, false);
  drawBits(code, -1);
  document.body.classList.remove('scanning');
  const fps = frames / ((code.length * (bitMs - settleMs)) / 1000);
  busy = false;
  $('scanBtn').disabled = false;

  if (tooManyMisses()) {
    setStatus('The torch did not switch on. This phone or browser may not allow it. The night-vision check still works.', true);
    return;
  }
  // Every bit needs a few frames, or the average for that bit is meaningless.
  if (Math.min(...counts) < 2) {
    setStatus('The camera sent too few pictures. Keep this page open, hold steady and scan again.', true);
    applySettings('lens', settings, { bitMs: Math.min(900, bitMs + 150) });
    return;
  }
  // Fewer than 4 frames in a bit makes the average noisy: use longer bits next time.
  if (Math.min(...counts) < 4) applySettings('lens', settings, { bitMs: Math.min(900, bitMs + 100) });

  // Average each bit, then keep only small-scale detail (local contrast).
  sums.forEach((s, i) => { for (let p = 0; p < n; p++) s[p] /= counts[i]; });
  const contrast = sums.map((s) => localContrast(s, W, H, 4));
  const { r, amp, sd } = correlateCode(contrast, code);
  const rejects = [];
  const blobs = findBlobs(r, amp, W, H, {
    rMin: settings.rMin, ampMin: settings.ampMin, maxArea: settings.maxArea,
    fillMin: settings.fillMin, aspectMin: settings.aspectMin, raw: blinkImage(sums, code), sd, rejects,
  });
  ignored = mergeRejects(rejects).slice(0, 6);
  scans++;
  updateTracks(tracks, blobs, W * settings.trackDist);
  spots = blobs;
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = performance.now();
    for (const b of spots) b.born = t;
  }
  markCheck('lens', { scans });
  drawHeat(r, W, H);
  let maxR = 0;
  for (let p = 0; p < n; p++) if (r[p] > maxR) maxR = r[p];
  $('debugInfo').innerHTML =
    `code ${codeToString(code)}<br>frames per bit ${counts.join(',')} · ${fps.toFixed(0)} fps<br>` +
    `best match ${maxR.toFixed(2)} · dots ${blobs.length} · ignored ${ignored.length} · scans ${scans}<br>` +
    `top score ${blobs[0]?.score ?? '-'} · torch misses ${torchMisses} · analysis ${W}x${H}<br>` +
    `torch timing: ${settings.calLag ? `${settings.calLag} ms to switch` : 'not measured'}`;
  if (spots.length) navigator.vibrate?.(spots.some((s) => s.confirmed) ? [30, 60, 30] : 30);

  $('saveBtn').disabled = !spots.length;
  $('scanBtn').textContent = 'Scan again';
  if (spots.some((s) => s.confirmed)) {
    setStatus('Seen twice, worth a closer look. Save this spot, or keep checking.');
  } else if (spots.length) {
    setStatus('Possible reflection. Move a little to the side and scan again to see if it stays.');
  } else {
    setStatus('Nothing blinked back here. Point at the next area and scan, or try from 1 to 2 metres away.');
  }
  redraw();
}

/**
 * Measure this phone's torch timing once (see estimateTorchLag in lens.js):
 * blink the torch slowly, watch the middle of the picture get brighter and
 * darker, and set the settle time and bit length from what we saw.
 */
async function calibrate() {
  calTried = true;
  setStatus('Measuring how fast this torch reacts. Hold steady…');
  const { W, H } = grab;
  const gray = new Float32Array(W * H);
  const samples = [], switches = [];
  const t0 = performance.now() + 200;
  for (let i = 0; i < 6; i++) {
    const t = t0 + i * 650;
    while (performance.now() < t) { await nextFrame(); sample(); }
    switches.push({ t: performance.now(), on: i % 2 === 0 });
    setTorch(cam, i % 2 === 0);
  }
  const end = performance.now() + 650;
  while (performance.now() < end) { await nextFrame(); sample(); }
  await setTorch(cam, false);

  function sample() {
    // Mean brightness of the middle half of the picture, where the user points.
    toGray(grab.rgba(), gray);
    let sum = 0, n = 0;
    for (let y = H >> 2; y < (H * 3) >> 2; y++) for (let x = W >> 2; x < (W * 3) >> 2; x++) { sum += gray[y * W + x]; n++; }
    samples.push({ t: performance.now(), v: sum / n });
  }
  const span = (samples.at(-1).t - samples[0].t) / 1000;
  const fps = samples.length / span;
  const cal = estimateTorchLag(samples, switches);
  if (!cal) return; // the torch did not visibly light the scene; keep the defaults
  applySettings('lens', settings, { ...timingFromCalibration(cal, fps), calibrated: true, calLag: Math.round(cal.riseMs) });
}

/**
 * Between scans, keep the circles on their spots while the hand moves:
 * estimate how far the picture shifted since the last frame and move the
 * spots (and the remembered tracks) by the same amount. This also makes
 * "seen twice" matching fairer after the user steps to the side.
 */
async function followHand() {
  const { W, H } = grab;
  let prev = new Float32Array(W * H), cur = new Float32Array(W * H), have = false, k = 0;
  for (;;) {
    await nextFrame();
    if (busy || (!spots.length && !tracks.length) || ++k % 2) { have = false; continue; }
    toGray(grab.rgba(), cur);
    if (have) {
      const { dx, dy, gain } = estimateShift(prev, cur, W, H);
      if ((dx || dy) && gain > 0.15) {
        for (const s of [...spots, ...tracks, ...ignored]) { s.x += dx; s.y += dy; }
        redraw();
      }
    }
    [prev, cur] = [cur, prev];
    have = true;
  }
}

// ---------- drawing ----------

function redraw() {
  const dpr = sizeOverlay(overlay);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const now = performance.now();
  if (!grab) return;
  const map = screenMapper(video, overlay, grab.W, grab.H);
  if (settings.showIgnored) drawSpots(octx, ignored, map, ignoredStyle, dpr);
  drawSpots(octx, spots, map, style, dpr, now);
  // Keep drawing while new circles are still fading in.
  if (spots.some((s) => s.born && now - s.born < 300)) requestAnimationFrame(redraw);
}

function drawHeat(r, W, H) {
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

/** Thin bar that fills as the flash code plays; hidden when idle. */
function drawBits(code, now) {
  $('progress').classList.toggle('on', now >= 0);
  $('progress').firstElementChild.style.width = now >= 0 ? `${((now + 1) / code.length) * 100}%` : '0';
}

function showSaved() {
  const n = getSnapshots().length;
  $('saved').textContent = n ? `${n} spot${n > 1 ? 's' : ''} saved for the results.` : '';
}

// ---------- buttons ----------

$('scanBtn').addEventListener('click', async () => {
  if (busy) return;
  if (!cam) {
    try { await start(); } catch (e) {
      setStatus(e.name === 'NotAllowedError'
        ? 'The camera is blocked. Allow camera access for this site, then reload.'
        : 'Could not open the camera: ' + e.message, true);
    }
    return;
  }
  if (!torchOk) { location.href = $('nextBtn').href; return; }
  scan();
});

$('saveBtn').addEventListener('click', () => {
  if (!spots.length) return;
  const top = spots[0];
  addSnapshot({
    time: new Date().toISOString(),
    mode: 'lens',
    label: spotLabel(top),
    code: lastCode ? codeToString(lastCode) : '',
    image: snapshot(video, spots, grab.W, grab.H, style),
  });
  showSaved();
  setStatus('Spot saved. It will be in your results and report.');
});

wireSheetButtons();
$('clearBtn').addEventListener('click', () => { tracks = []; spots = []; ignored = []; redraw(); $('saveBtn').disabled = true; });
$('ignoredToggle').checked = !!settings.showIgnored;
$('ignoredToggle').addEventListener('change', (e) => { applySettings('lens', settings, { showIgnored: e.target.checked ? 1 : 0 }); redraw(); });
$('recalBtn').addEventListener('click', () => {
  applySettings('lens', settings, { calibrated: false });
  calTried = false;
  setStatus('The torch timing will be measured again on the next scan.');
});
window.addEventListener('resize', redraw);
showSaved();
startCoverage($('cover'), () => busy, { demo: isDemo });
if (isDemo) setStatus('Demo camera: a simulated room. Tap Start camera, then Scan twice.');
