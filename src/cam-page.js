// Drawing and panel helpers shared by the two camera screens (lens and light).

import { $ } from './ui.js';
import { describeSupport } from './camera.js';
import { getSettings, saveSettings, getChecks, markCheck } from './store.js';
import { headingOf, addHeading, emptyCoverage, countSeen, coverageText } from './coverage.js';

// Analysis size: the long side is 320 px. Small enough to run every frame on
// a phone, big enough that a lens a few metres away is still 1-3 pixels.
const LONG_SIDE = 320;

/** Small canvas that reads the video at analysis size. */
export function makeGrabber(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = LONG_SIDE / Math.max(vw, vh);
  const W = Math.round(vw * s), H = Math.round(vh * s);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  return {
    W, H,
    /** RGBA bytes of the current frame. */
    rgba() { ctx.drawImage(video, 0, 0, W, H); return ctx.getImageData(0, 0, W, H).data; },
  };
}

/** Wait until the video has a real size. */
export async function attachStream(video, stream) {
  video.srcObject = stream;
  await video.play().catch(() => {});
  if (!video.videoWidth) await new Promise((r) => video.addEventListener('loadedmetadata', r, { once: true }));
}

/**
 * Map analysis pixels to screen pixels. The video uses object-fit: cover,
 * so it is scaled up and cropped to fill the screen.
 */
export function screenMapper(video, overlay, W, H) {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const cw = overlay.width, ch = overlay.height;
  const scale = Math.max(cw / vw, ch / vh);
  const offX = (cw - vw * scale) / 2, offY = (ch - vh * scale) / 2;
  return (ax, ay) => [offX + (ax * vw / W) * scale, offY + (ay * vh / H) * scale, (vw / W) * scale];
}

/**
 * Circle and short label for each spot. `style(spot)` returns { color, text }.
 * A spot with `born` (a performance.now() time) fades and grows in over 300 ms.
 */
export function drawSpots(ctx, spots, map, style, unit = 1, now = 0) {
  ctx.lineWidth = 3 * unit;
  ctx.font = `600 ${13 * unit}px -apple-system, system-ui, Inter, Roboto, sans-serif`;
  const labelled = [];
  for (const s of spots.slice(0, 6)) {
    const [x, y, k] = map(s.x, s.y);
    if (x < 0 || y < 0 || x > ctx.canvas.width || y > ctx.canvas.height) continue; // cropped off screen
    const age = s.born && now ? Math.min(1, (now - s.born) / 300) : 1;
    const grow = 1 - (1 - age) ** 3;
    ctx.globalAlpha = age;
    const { color, text, small } = style(s);
    const rad = (small ? 11 * unit : Math.max(20 * unit, Math.sqrt(s.area) * k * 2)) * (0.7 + 0.3 * grow);
    ctx.lineWidth = (small ? 2 : 3) * unit;
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    // One label per cluster: two lights side by side share a label.
    if (labelled.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 90 * unit)) continue;
    labelled.push([x, y]);
    // Label on a dark pill so it stays readable on any background.
    const tw = ctx.measureText(text).width;
    const lx = Math.min(x + rad + 6 * unit, ctx.canvas.width - tw - 12 * unit);
    const ly = x + rad + tw + 20 * unit > ctx.canvas.width ? y + rad + 18 * unit : y;
    ctx.fillStyle = 'rgba(0, 0, 0, .7)';
    ctx.beginPath();
    ctx.roundRect?.(lx - 7 * unit, ly - 14 * unit, tw + 14 * unit, 22 * unit, 11 * unit);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.fillText(text, lx, ly + 2 * unit);
  }
  ctx.globalAlpha = 1;
}

/** Overlay canvas sized to the screen in device pixels. */
export function sizeOverlay(overlay) {
  const dpr = window.devicePixelRatio || 1;
  overlay.width = overlay.clientWidth * dpr;
  overlay.height = overlay.clientHeight * dpr;
  return dpr;
}

/** A 640 px JPEG of the current frame with the circles drawn on it. */
export function snapshot(video, spots, W, H, style) {
  const c = document.createElement('canvas');
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = 640 / Math.max(vw, vh);
  c.width = Math.round(vw * s); c.height = Math.round(vh * s);
  const ctx = c.getContext('2d');
  ctx.drawImage(video, 0, 0, c.width, c.height);
  drawSpots(ctx, spots, (ax, ay) => [ax * c.width / W, ay * c.height / H, c.width / W], style, 1);
  return c.toDataURL('image/jpeg', 0.75);
}

/**
 * Sliders in the Details panel. `spec` is [[key, label, min, max, step], ...].
 * Changes are saved, so tuning on the phone survives a reload.
 */
export function buildSliders(container, name, defaults, spec) {
  const settings = getSettings(name, defaults);
  container.innerHTML = '<ul class="group">' + spec.map(([k, label, min, max, step]) =>
    `<li><label class="slider-row"><span class="top"><span>${label}</span><b id="v_${k}">${settings[k]}</b></span>
      <input type="range" id="s_${k}" min="${min}" max="${max}" step="${step}" value="${settings[k]}"></label></li>`).join('') +
    '<li><button class="row" id="resetSettings" type="button"><span class="row-text" style="color:var(--accent)">Reset to defaults</span></button></li></ul>';
  for (const [k] of spec) {
    $('s_' + k).addEventListener('input', (e) => {
      settings[k] = Number(e.target.value);
      $('v_' + k).textContent = e.target.value;
      saveSettings(name, settings);
    });
  }
  $('resetSettings').addEventListener('click', () => {
    Object.assign(settings, defaults);
    saveSettings(name, settings);
    for (const [k] of spec) { $('s_' + k).value = settings[k]; $('v_' + k).textContent = settings[k]; }
  });
  return settings;
}

/** Change settings from code (calibration) and keep the sliders in step. */
export function applySettings(name, settings, values) {
  Object.assign(settings, values);
  saveSettings(name, settings);
  for (const [k, v] of Object.entries(values)) {
    const el = $('s_' + k);
    if (el) { el.value = v; $('v_' + k).textContent = v; }
  }
}

/** Fill the "What this phone supports" list. */
export function showSupport(list, cam, locked) {
  const rows = describeSupport(cam.caps, cam.track.getSettings?.() || {});
  if (locked) rows.push(['Locked for the scan', locked.length ? locked.join(', ') : 'nothing']);
  list.innerHTML = rows.map(([k, v]) => `<li><div class="row"><span class="row-text">${k}</span><span class="row-value">${v}</span></div></li>`).join('');
}

/**
 * Coverage ring: while `isActive()` is true (a scan is running), note which
 * way the phone points (see coverage.js) and fill that slice of the ring.
 * The ring stays hidden until the phone gives a compass reading, so phones
 * without the sensor (and laptops) never show it. In demo mode a slowly
 * turning heading is simulated so the ring can be seen on a laptop.
 */
export function startCoverage(el, isActive, { demo = false } = {}) {
  let seen = getChecks().coverage?.seen || emptyCoverage();
  const draw = () => {
    const arcs = seen.map((on, i) => {
      // 30 degree slice with a 4 degree gap; 0 = up (north).
      const a0 = ((i * 30 + 2 - 90) * Math.PI) / 180, a1 = ((i * 30 + 28 - 90) * Math.PI) / 180;
      const p = (a) => `${28 + 24 * Math.cos(a)} ${28 + 24 * Math.sin(a)}`;
      return `<path d="M${p(a0)}A24 24 0 0 1 ${p(a1)}" style="stroke:${on ? 'var(--accent)' : 'rgba(255,255,255,.25)'}"/>`;
    }).join('');
    el.innerHTML = `<svg viewBox="0 0 56 56" fill="none" stroke-width="4" stroke-linecap="round" aria-hidden="true">${arcs}</svg><b>${countSeen(seen)}/12</b>`;
    el.setAttribute('aria-label', coverageText(seen));
  };
  const note = (h) => {
    if (el.hidden) { el.hidden = false; draw(); }
    if (!isActive() || h == null) return;
    const before = countSeen(seen);
    addHeading(seen, h);
    if (countSeen(seen) !== before) { markCheck('coverage', { seen }); draw(); }
  };
  el.hidden = true;
  if (demo) {
    setInterval(() => note((performance.now() / 50) % 360), 200);
    return;
  }
  const type = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(type, (e) => { const h = headingOf(e); if (h != null) note(h); });
}
