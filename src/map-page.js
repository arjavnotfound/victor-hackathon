// Wi-Fi map: every Wi-Fi source as a dot in 3D (see airmap.js for what the
// axes and colours mean). Drag to turn, pinch to zoom, two fingers to move,
// tap a dot for its numbers and the reasons behind its colour.
//
// Data comes from the traffic test (upload per second, replayed as "live")
// and from the Android nearby scan (name, channel, signal). `?demo=1` runs
// the real analysis on a simulated room.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { buildMap, countLevels, placeOf, fromCapture, fromNearby } from './airmap.js';
import { getAir, saveAir } from './store.js';
import { $, esc, initPage, isDemo, openSheet, wireSheetButtons } from './ui.js';
import { markSvg } from './icons.js';
import { demoPlugin } from './net-demo.js';
import { makeDemoCapture } from './sim.js';
import { parseCapture } from './pcap.js';
import { analyzeCapture } from './analysis.js';
import { makeCode, seeded } from './code.js';
import { hello, startScan, status, waitForResult } from './bridge.js';

initPage('Wi-Fi map');
const COLOR = { safe: '#34d17a', unsure: '#ffb547', suspicious: '#ff5a52' };
const WORD = { safe: 'Safe', unsure: 'Unsure', suspicious: 'Suspicious' };
const native = Capacitor.isNativePlatform();
const NetworkCheck = isDemo ? demoPlugin : native ? registerPlugin('NetworkCheck') : null;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const rate = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : b >= 1e3 ? `${Math.round(b / 1e3)} KB/s` : `${Math.round(b)} B/s`);

$('loadMark').innerHTML = markSvg('live');
$('emptyMark').innerHTML = markSvg();

// ---------- data ----------

async function loadSources() {
  if (isDemo) {
    // The real analysis on a simulated capture, plus made-up nearby networks.
    const code = makeCode(12, seeded(3)), startMs = 1.7e12;
    const cap = parseCapture(makeDemoCapture({ code, startMs, seed: 2 }).buffer);
    const capture = fromCapture(analyzeCapture(cap, { code, startMs }));
    const { networks } = await demoPlugin.nearby();
    return [...capture, ...fromNearby(networks)];
  }
  // In the Android app the map scans the air itself on opening: no button, no laptop.
  if (NetworkCheck) {
    $('loadText').textContent = 'Listening to Wi-Fi around you…';
    try { saveAir({ nearby: fromNearby((await NetworkCheck.nearby()).networks) }); } catch { /* keep the last scan */ }
  }
  const air = getAir();
  return [...(air.capture || []), ...(air.nearby || [])];
}

// ---------- scene ----------

const host = $('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
host.append(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.03);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
// Portrait phones see less across, so the home view sits closer and higher.
const portrait = innerWidth < innerHeight;
const HOME = portrait
  ? { pos: new THREE.Vector3(-1, 11, 15), target: new THREE.Vector3(0, 1.2, 0) }
  : { pos: new THREE.Vector3(-2, 7.5, 17), target: new THREE.Vector3(0.5, 1.6, 0) };
camera.position.set(-6, 14, 30); // starts far away and glides in
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.minDistance = 4;
controls.maxDistance = 40;
controls.maxPolarAngle = Math.PI * 0.49; // stay above the floor
controls.autoRotate = !reduced;
controls.autoRotateSpeed = 0.5;
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(4, 10, 6);
scene.add(sun);

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  // Phones in portrait see less across, so step back a little.
  camera.fov = innerWidth < innerHeight ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/** Flat text that always faces the camera. */
function textSprite(text, { h = 0.45, color = 'rgba(235,235,245,.55)', weight = 500 } = {}) {
  const c = document.createElement('canvas'), ctx = c.getContext('2d');
  const font = `${weight} 60px -apple-system, system-ui, Inter, Roboto, sans-serif`;
  ctx.font = font;
  c.width = Math.ceil(ctx.measureText(text).width) + 16; c.height = 80;
  ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set((h * c.width) / c.height, h, 1);
  return s;
}

/** Soft round light, used as the glow around each dot. */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d'), g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();

const line = (pts, color = 0xffffff, opacity = 0.12) => new THREE.Line(
  new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(...p))),
  new THREE.LineBasicMaterial({ color, transparent: true, opacity }));

/** Floor for each band, with a line and number for common channels, and the upload scale. */
function drawFrame(has6) {
  const bands = [
    { name: '2.4 GHz', x0: -7.4, x1: -1.6, ticks: [[2412, 1], [2437, 6], [2462, 11]] },
    { name: '5 GHz', x0: -0.4, x1: 7.4, ticks: [[5180, 36], [5260, 52], [5500, 100], [5745, 149], [5825, 165]] },
  ];
  if (has6) bands.push({ name: '6 GHz', x0: 8.1, x1: 11.9, ticks: [[5955, 1], [6415, 93], [7115, 233]] });
  for (const b of bands) {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.x1 - b.x0, 9),
      new THREE.MeshBasicMaterial({ color: 0x18181b, transparent: true, opacity: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set((b.x0 + b.x1) / 2, 0, 0);
    scene.add(floor);
    scene.add(line([[b.x0, 0.01, 4.5], [b.x1, 0.01, 4.5], [b.x1, 0.01, -4.5], [b.x0, 0.01, -4.5], [b.x0, 0.01, 4.5]], 0xffffff, 0.18));
    const name = textSprite(b.name, { h: 0.6, color: 'rgba(245,245,247,.9)', weight: 600 });
    name.position.set((b.x0 + b.x1) / 2, 0.05, 5.6);
    scene.add(name);
    for (const [f, ch] of b.ticks) {
      const [x] = placeOf({ freq: f });
      scene.add(line([[x, 0.01, -4.5], [x, 0.01, 4.5]], 0xffffff, 0.14));
      const t = textSprite(`ch ${ch}`, { h: 0.42 });
      t.position.set(x, 0.05, 4.95);
      scene.add(t);
    }
  }
  // Upload scale on the left: the same log scale as placeOf.
  const x = -8.2;
  scene.add(line([[x, 0, -4.5], [x, 5.2, -4.5]], 0xffffff, 0.25));
  for (const [y, label] of [[1.5, '1 KB/s'], [2.5, '10 KB/s'], [3.5, '100 KB/s'], [4.5, '1 MB/s']]) {
    scene.add(line([[x, y, -4.5], [x + 0.25, y, -4.5]], 0xffffff, 0.35));
    const t = textSprite(label, { h: 0.32 });
    t.position.set(x - 0.75, y, -4.5);
    scene.add(t);
  }
}

// ---------- dots ----------

let dots = [], selected = null;
const hitTargets = [];

function addDots(map) {
  map.forEach((s, i) => {
    const [x, y, z] = placeOf(s);
    const color = new THREE.Color(COLOR[s.level]);
    const red = s.level === 'suspicious';
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const r = red ? 0.32 : 0.2;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: red ? 0.9 : 0.5, roughness: 0.35 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: red ? 0.9 : 0.45 }));
    glow.scale.setScalar(red ? 2.6 : 1.3);
    // A bigger see-through ball, so a fingertip can hit a small dot.
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    hit.userData.i = i;
    hitTargets.push(hit);
    const head = new THREE.Group();
    head.add(ball, glow, hit);
    g.add(head);
    // Stem down to the floor and a ring where it lands, to read the channel.
    const stem = line([[0, 0, 0], [0, 1, 0]], color.getHex(), red ? 0.7 : 0.35);
    g.add(stem);
    const foot = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    foot.rotation.x = -Math.PI / 2;
    foot.position.y = 0.02;
    g.add(foot);
    // Red dots send out a slow ring on the floor, so they are seen at a glance.
    let wave = null;
    if (red) {
      wave = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
      wave.rotation.x = -Math.PI / 2;
      wave.position.y = 0.03;
      g.add(wave);
    }
    scene.add(g);
    const mean = s.sec?.length ? s.sec.reduce((a, b) => a + b, 0) / s.sec.length : 0;
    dots.push({ s, g, head, ball, glow, stem, wave, y, mean, born: i * 70 });
  });
}

// ---------- labels over red dots (and the selected one) ----------

function updateTags() {
  const show = dots.filter((d) => d.s.level === 'suspicious' || d === selected);
  const box = $('tags');
  while (box.children.length < show.length) box.append(document.createElement('div'));
  [...box.children].forEach((el, i) => {
    const d = show[i];
    if (!d) { el.hidden = true; return; }
    const p = new THREE.Vector3().setFromMatrixPosition(d.head.matrixWorld).project(camera);
    el.hidden = p.z > 1;
    el.className = 'tag';
    el.style.setProperty('--c', COLOR[d.s.level]);
    el.style.left = `${((p.x + 1) / 2) * innerWidth}px`;
    el.style.top = `${((1 - p.y) / 2) * innerHeight}px`;
    el.textContent = d.s.name.length > 22 ? d.s.name.slice(0, 21) + '…' : d.s.name;
  });
}

// ---------- tap a dot ----------

const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
  ray.setFromCamera(new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const hit = ray.intersectObjects(hitTargets)[0];
  if (hit) select(dots[hit.object.userData.i]);
});
controls.addEventListener('start', () => {
  controls.autoRotate = false;
  $('hint').style.opacity = 0;
});

/** Glide the camera so `target` is in the middle. */
let flight = null;
function flyTo(target, pos) {
  flight = { t0: performance.now(), from: [controls.target.clone(), camera.position.clone()], to: [target, pos] };
}

function select(d) {
  selected = d;
  controls.autoRotate = false;
  const at = new THREE.Vector3().setFromMatrixPosition(d.head.matrixWorld);
  const off = camera.position.clone().sub(controls.target).setLength(9);
  flyTo(at, at.clone().add(off));
  showDetails(d);
  navigator.vibrate?.(d.s.level === 'suspicious' ? [20, 40, 20] : 10);
}

$('resetBtn').addEventListener('click', () => { selected = null; flyTo(HOME.target.clone(), HOME.pos.clone()); });

// ---------- details sheet ----------

function signalBars(dbm) {
  const n = dbm == null ? 0 : dbm > -55 ? 4 : dbm > -65 ? 3 : dbm > -75 ? 2 : 1;
  return `<span class="bars">${[5, 8, 11, 14].map((h, i) => `<i style="height:${h}px" class="${i < n ? 'on' : ''}"></i>`).join('')}</span>`;
}

function showDetails(d) {
  const s = d.s, c = COLOR[s.level];
  const live = s.sec?.length;
  const findLink = s.bssid && NetworkCheck
    ? `<a class="btn" style="margin-top:16px" href="find.html?${new URLSearchParams({ bssid: s.bssid, ssid: s.name, ...(isDemo ? { demo: 1 } : {}) })}">Find it</a>` : '';
  $('detailBody').innerHTML = `
    <span class="pill" style="--c:${c}">${WORD[s.level]}</span>
    <div class="src-name">${esc(s.name)}</div>
    <div class="caption">${esc(s.mac || '')}${s.vendor && s.vendor !== s.name ? ` · ${esc(s.vendor)}` : ''}</div>
    <div class="stats">
      <div class="stat"><b>${s.channel || '–'}</b><span>Channel</span></div>
      <div class="stat"><b>${esc(s.band)}</b><span>Band</span></div>
      <div class="stat"><b>${s.rssi == null ? '–' : Math.round(s.rssi)}<small style="font-size:14px;color:var(--muted)"> dBm</small>${signalBars(s.rssi)}</b><span>Signal</span></div>
      <div class="stat"><b id="liveRate">${live ? rate(d.mean) : '–'}</b><span>${live ? 'Upload now' : 'Upload not visible'}</span></div>
    </div>
    ${live
      ? `<div class="label">Upload over time</div><canvas id="chart"></canvas><p class="caption" style="margin:6px 4px 0">Replay of the traffic test, ${s.sec.length} s.</p>`
      : '<p class="caption" style="margin:14px 4px 0">A phone cannot see how much other devices upload. Run the traffic test on a laptop to measure it.</p>'}
    <div class="label">Why it is ${WORD[s.level].toLowerCase()}</div>
    <ul class="why" style="--c:${c}">${s.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    ${findLink}`;
  $('details').querySelector('h3').textContent = s.from === 'capture' ? 'Traffic test' : 'Nearby network';
  openSheet($('details'), () => { selected = null; });
}

/** Bars for each second of upload, with a line at the second being replayed. */
function drawChart(d, now) {
  const c = $('chart');
  if (!c) return;
  const dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const ctx = c.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const sec = d.s.sec, max = Math.max(...sec) || 1, bw = (w - 16) / sec.length;
  sec.forEach((v, i) => {
    ctx.fillStyle = i <= now ? COLOR[d.s.level] : 'rgba(255,255,255,.18)';
    const bh = Math.max(1, (v / max) * (h - 20));
    ctx.fillRect(8 + i * bw, h - 8 - bh, Math.max(1, bw - 1), bh);
  });
  ctx.fillStyle = '#fff';
  ctx.fillRect(8 + now * bw + bw / 2 - 0.5, 6, 1, h - 14);
}

// ---------- verdict chips ----------

function showVerdict(map) {
  const n = countLevels(map);
  const order = ['suspicious', 'unsure', 'safe'].filter((k) => n[k]);
  $('verdict').innerHTML = order.map((k, i) =>
    `<button class="chip ${k}" data-level="${k}" style="--c:${COLOR[k]};--i:${i}"><i></i>${n[k]} <span>${WORD[k].toLowerCase()}</span></button>`).join('');
  // Tapping a chip jumps to the next dot of that colour.
  const seen = {};
  for (const b of $('verdict').children) {
    b.addEventListener('click', () => {
      const list = dots.filter((d) => d.s.level === b.dataset.level);
      seen[b.dataset.level] = ((seen[b.dataset.level] ?? -1) + 1) % list.length;
      select(list[seen[b.dataset.level]]);
    });
  }
}

// ---------- loop ----------

const t0 = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const t = now - t0;
  if (flight) {
    const k = Math.min(1, (now - flight.t0) / 700), e = 1 - (1 - k) ** 3;
    controls.target.lerpVectors(flight.from[0], flight.to[0], e);
    camera.position.lerpVectors(flight.from[1], flight.to[1], e);
    if (k === 1) flight = null;
  } else if (t < 1600 && !reduced) {
    // Opening glide from far away to the home view.
    camera.position.lerp(HOME.pos, 0.06);
  }
  const second = Math.floor(t / 1000);
  for (const d of dots) {
    // Dots rise out of the floor one after another.
    const up = reduced ? 1 : Math.min(1, Math.max(0, (t - 300 - d.born) / 700));
    const y = d.y * (1 - (1 - up) ** 3);
    d.head.position.y = y;
    d.stem.scale.y = Math.max(0.001, y);
    // "Live" upload: the dot breathes with the second being replayed.
    if (d.s.sec?.length) {
      const v = d.s.sec[second % d.s.sec.length] / (d.mean || 1);
      const k = 0.85 + 0.3 * Math.min(2, v);
      d.ball.scale.setScalar(d.ball.scale.x + (k - d.ball.scale.x) * 0.15);
    }
    if (d.wave) {
      const p = (t % 2200) / 2200;
      d.wave.scale.setScalar(0.3 + p * 1.6);
      d.wave.material.opacity = 0.55 * (1 - p);
      d.glow.material.opacity = 0.7 + 0.25 * Math.sin(t / 300);
    }
  }
  if (selected?.s.sec?.length) {
    const i = second % selected.s.sec.length;
    if (selected.lastI !== i) {
      selected.lastI = i;
      if ($('liveRate')) $('liveRate').textContent = rate(selected.s.sec[i]);
      drawChart(selected, i);
    }
  }
  controls.update();
  renderer.render(scene, camera);
  updateTags();
}

// ---------- start ----------

async function start() {
  const listener = isDemo ? null : await hello();
  // A scan may have finished (or still be running) while this page was closed.
  if (listener) {
    const s = await status().catch(() => null);
    if (s?.phase === 'done' && s.result && s.result.at > (getAir().captureAt || '')) saveAir({ capture: s.result.sources, captureAt: s.result.at });
    if (['capturing', 'waiting', 'analysing'].includes(s?.phase)) follow(s);
  }
  $('listenBtn').hidden = !listener;
  const sources = await loadSources();
  if (!sources.length) {
    $('loading').classList.add('gone');
    $('empty').hidden = false;
    $('scanBtn').hidden = !NetworkCheck;
    $('emptyListen').hidden = !listener;
    if (listener) $('emptyText').textContent = 'Listen for 30 seconds to see every device nearby and how much it uploads.';
    return;
  }
  const map = buildMap(sources);
  drawFrame(map.some((s) => s.freq >= 5925));
  addDots(map);
  showVerdict(map);
  $('loading').classList.add('gone');
  requestAnimationFrame(frame);
}

$('scanBtn').addEventListener('click', async () => {
  $('scanBtn').disabled = true;
  $('scanBtn').textContent = 'Scanning…';
  try {
    const { networks } = await NetworkCheck.nearby();
    saveAir({ nearby: fromNearby(networks) });
    location.reload();
  } catch (e) {
    $('emptyText').textContent = e.message;
    $('scanBtn').disabled = false;
    $('scanBtn').textContent = 'Scan nearby networks';
  }
});

// ---------- listening (traffic scan) ----------

/** Full-screen countdown while the air is being listened to, then rebuild the map. */
async function follow(first) {
  $('listening').hidden = false;
  const end = first.startedAt + first.seconds * 1000;
  const tick = setInterval(() => {
    const left = Math.ceil((end - Date.now()) / 1000);
    $('lsCount').textContent = Math.max(0, left);
    if (left <= 0) { $('lsTitle').textContent = 'Reading what it heard'; $('lsText').textContent = 'A few more seconds.'; }
  }, 250);
  try {
    const r = await waitForResult((s) => { if (s?.phase === 'waiting' && !s.auto) $('lsText').textContent = 'Waiting for the capture to finish.'; });
    saveAir({ capture: r.sources, captureAt: r.at });
    location.reload();
  } catch (e) {
    clearInterval(tick);
    $('lsTitle').textContent = 'The scan did not finish';
    $('lsText').textContent = e.message;
    setTimeout(() => { $('listening').hidden = true; }, 4000);
  }
}

async function listen() {
  try {
    const { seconds } = await startScan({ mode: 'listen', seconds: 30 });
    follow({ startedAt: Date.now(), seconds });
  } catch (e) {
    $('hint').textContent = e.message;
    $('hint').style.opacity = 1;
  }
}
$('listenBtn').addEventListener('click', listen);
$('emptyListen').addEventListener('click', listen);

wireSheetButtons();
start();
