// IR check: torch off, room dark, look for small bright dots that stay on
// or blink steadily (night-vision LEDs). Maths and physics notes in ir.js.

import { toGray } from './lens.js';
import { findBrightSpots, updateIrTracks, visibleFlagged, IR_DEFAULTS } from './ir.js';
import { addSnapshot, getSnapshots, markCheck, savePhone } from './store.js';
import { openCamera, closeCamera, setTorch, phoneInfo } from './camera.js';
import { $, isDemo, initPage } from './ui.js';
import { makeGrabber, attachStream, screenMapper, drawSpots, sizeOverlay, snapshot, buildSliders, showSupport, wireSheets } from './cam-page.js';

initPage('IR check');
const video = $('video'), overlay = $('overlay');
const octx = overlay.getContext('2d');
const LABEL = 'Bright point, worth a closer look';

const settings = buildSliders($('sliders'), 'ir', IR_DEFAULTS, [
  ['brightMin', 'Brightness needed (0-255)', 120, 254, 1],
  ['contrastMin', 'Brighter than around it by', 10, 200, 1],
  ['maxArea', 'Biggest dot (pixels)', 2, 300, 1],
  ['steadyMs', 'Steady for (ms)', 200, 3000, 50],
  ['blinks', 'Or blinks this many times', 2, 10, 1],
]);

let cam = null, grab = null, running = false, facing = 'environment';
let tracks = [], shown = [];

const style = () => ({ color: '#d3b4ff', text: 'Bright point' });

function setStatus(text, warn = false) {
  $('status').textContent = text;
  $('status').className = 'cam-status' + (warn ? ' warn' : '');
}

async function start() {
  closeCamera(cam);
  running = false;
  cam = await openCamera({ facing, demo: isDemo });
  if (cam.demo) cam.demo.ir = true;
  else await setTorch(cam, false); // the torch would light up everything and hide the dots
  await attachStream(video, cam.stream);
  grab = makeGrabber(video);
  tracks = []; shown = [];
  showSupport($('supportTable'), cam);
  savePhone(await phoneInfo(cam));
  markCheck('ir', { camera: facing === 'user' ? 'front' : 'back' });
  $('flipBtn').disabled = !!cam.demo;
  $('scanBtn').textContent = 'Pause';
  setStatus('Turn off the room lights. Then slowly point the camera around the room. Many phones see more infrared with the front camera, so try both.');
  loop();
}

async function loop() {
  running = true;
  const gray = new Float32Array(grab.W * grab.H);
  let frames = 0, t0 = performance.now();
  while (running) {
    await new Promise((r) => requestAnimationFrame(r));
    if (!running) break;
    const t = performance.now();
    toGray(grab.rgba(), gray);
    const spots = findBrightSpots(gray, grab.W, grab.H, settings);
    updateIrTracks(tracks, spots, t, { ...settings, maxDist: grab.W * 0.06 });
    shown = visibleFlagged(tracks, t);
    redraw();
    $('saveBtn').disabled = !shown.length;
    if (++frames % 30 === 0) {
      $('debugInfo').innerHTML = `${(30000 / (t - t0)).toFixed(0)} fps · dots now ${spots.length} · ` +
        `tracked ${tracks.length} · flagged ${shown.length}<br>analysis ${grab.W}x${grab.H}`;
      t0 = t;
    }
    if (shown.length) setStatus(`${LABEL}. Save this spot, or keep looking.`);
  }
}

function redraw() {
  const dpr = sizeOverlay(overlay);
  octx.clearRect(0, 0, overlay.width, overlay.height);
  if (grab) drawSpots(octx, shown, screenMapper(video, overlay, grab.W, grab.H), style, dpr);
}

function showSaved() {
  const n = getSnapshots().length;
  $('saved').textContent = n ? `${n} spot${n > 1 ? 's' : ''} saved for the results.` : '';
}

$('scanBtn').addEventListener('click', async () => {
  if (!cam) {
    try { await start(); } catch (e) {
      setStatus(e.name === 'NotAllowedError'
        ? 'The camera is blocked. Allow camera access for this site, then reload.'
        : 'Could not open the camera: ' + e.message, true);
    }
  } else if (running) {
    running = false;
    $('scanBtn').textContent = 'Resume';
  } else {
    $('scanBtn').textContent = 'Pause';
    loop();
  }
});

$('flipBtn').addEventListener('click', async () => {
  $('flipBtn').disabled = true;
  facing = facing === 'environment' ? 'user' : 'environment';
  try { await start(); } catch (e) { setStatus('Could not switch camera: ' + e.message, true); }
  $('flipBtn').disabled = !!cam?.demo;
  $('flipBtn').textContent = facing === 'user' ? 'Use back camera' : 'Use front camera';
  if (facing === 'user') setStatus('Front camera on. Turn the screen away from you and point it around the room.');
});

$('saveBtn').addEventListener('click', () => {
  if (!shown.length) return;
  addSnapshot({
    time: new Date().toISOString(),
    mode: 'ir',
    label: LABEL,
    note: facing === 'user' ? 'front camera' : 'back camera',
    image: snapshot(video, shown, grab.W, grab.H, style),
  });
  showSaved();
  setStatus('Spot saved. It will be in your results and report.');
});

wireSheets();
$('clearBtn').addEventListener('click', () => { tracks = []; shown = []; redraw(); });
window.addEventListener('resize', redraw);
showSaved();
if (isDemo) setStatus('Demo camera: a simulated dark room with night-vision lights. Tap Start camera.');
