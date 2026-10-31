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
} from './lens.js';
import { addSnapshot, getSnapshots, markCheck, savePhone, getChecks } from './store.js';
import { openCamera, setTorch, lockForTorch, phoneInfo } from './camera.js';
import { $, isDemo, initPage } from './ui.js';
import {
  makeGrabber, attachStream, screenMapper, drawSpots, sizeOverlay, snapshot, buildSliders, showSupport, wireSheets,
} from './cam-page.js';

initPage('Lens check');
const video = $('video'), overlay = $('overlay');
const octx = overlay.getContext('2d');

const settings = buildSliders($('sliders'), 'lens', LENS_DEFAULTS, [
  ['rMin', 'Match needed (correlation)', 0.5, 0.99, 0.01],
  ['ampMin', 'Smallest blink (grey levels)', 1, 60, 1],
  ['maxArea', 'Biggest dot (pixels)', 2, 200, 1],
  ['bitMs', 'Bit length (ms)', 200, 700, 10],
  ['settleMs', 'Settle time (ms)', 40, 300, 10],
  ['bits', 'Code length (bits)', 6, 16, 1],
]);

let cam = null, grab = null, busy = false, torchOk = false;
let spots = [], tracks = [], scans = getChecks().lens?.scans || 0, lastCode = null;

const style = (s) => ({ color: s.confirmed ? '#7fe0c6' : '#ffc27a', text: s.confirmed ? 'Seen twice' : 'Possible reflection' });

function setStatus(text, warn = false) {
  $('status').textContent = text;
  $('status').className = 'cam-status' + (warn ? ' warn' : '');
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
  $('scanBtn').textContent = 'Scan';
  if (torchOk) setStatus('Point the phone at the area. Hold steady. Then move a little to the side and scan again.');
  else setStatus('This phone or browser does not let the page use the torch, so the lens check cannot run here. The IR check still works.', true);
}

// ---------- scan ----------

const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

async function scan() {
  busy = true;
  $('scanBtn').disabled = true;
  setStatus('Getting the camera ready…');
  const locked = await lockForTorch(cam);
  showSupport($('supportTable'), cam, locked);

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
  const fps = frames / ((code.length * (bitMs - settleMs)) / 1000);
  busy = false;
  $('scanBtn').disabled = false;

  if (tooManyMisses()) {
    setStatus('The torch did not switch on. This phone or browser may not allow it. The IR check still works.', true);
    return;
  }
  // Every bit needs a few frames, or the average for that bit is meaningless.
  if (Math.min(...counts) < 2) {
    setStatus('The camera sent too few pictures. Keep this page open, hold steady and scan again.', true);
    return;
  }

  // Average each bit, then keep only small-scale detail (local contrast).
  sums.forEach((s, i) => { for (let p = 0; p < n; p++) s[p] /= counts[i]; });
  const contrast = sums.map((s) => localContrast(s, W, H, 4));
  const { r, amp } = correlateCode(contrast, code);
  const blobs = findBlobs(r, amp, W, H, {
    rMin: settings.rMin, ampMin: settings.ampMin, maxArea: settings.maxArea, raw: blinkImage(sums, code),
  });
  scans++;
  updateTracks(tracks, blobs, W * settings.trackDist);
  spots = blobs;
  markCheck('lens', { scans });
  drawHeat(r, W, H);
  let maxR = 0;
  for (let p = 0; p < n; p++) if (r[p] > maxR) maxR = r[p];
  $('debugInfo').innerHTML =
    `code ${codeToString(code)}<br>frames per bit ${counts.join(',')} · ${fps.toFixed(0)} fps<br>` +
    `best match ${maxR.toFixed(2)} · dots ${blobs.length} · scans ${scans}<br>` +
    `top score ${blobs[0]?.score ?? '-'} · torch misses ${torchMisses} · analysis ${W}x${H}`;

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

// ---------- drawing ----------

function redraw() {
  const dpr = sizeOverlay(overlay);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (grab) drawSpots(octx, spots, screenMapper(video, overlay, grab.W, grab.H), style, dpr);
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

function drawBits(code, now) {
  $('bits').innerHTML = code.map((b, i) => `<span class="${b ? 'one' : ''} ${i === now ? 'now' : ''}"></span>`).join('');
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
  if (!torchOk) return setStatus('This phone or browser does not let the page use the torch. The IR check still works.', true);
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

wireSheets();
$('clearBtn').addEventListener('click', () => { tracks = []; spots = []; redraw(); $('saveBtn').disabled = true; });
window.addEventListener('resize', redraw);
showSaved();
if (isDemo) setStatus('Demo camera: a simulated room. Tap Start camera, then Scan twice.');
