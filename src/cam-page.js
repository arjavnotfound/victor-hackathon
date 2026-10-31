// Drawing and panel helpers shared by the two camera screens (lens and light).

import { $ } from './ui.js';
import { describeSupport } from './camera.js';
import { getSettings, saveSettings } from './store.js';

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

/** Circle and short label for each spot. `style(spot)` returns { color, text }. */
export function drawSpots(ctx, spots, map, style, unit = 1) {
  ctx.lineWidth = 3 * unit;
  ctx.font = `600 ${14 * unit}px Inter, system-ui, sans-serif`;
  const labelled = [];
  for (const s of spots.slice(0, 6)) {
    const [x, y, k] = map(s.x, s.y);
    const rad = Math.max(20 * unit, Math.sqrt(s.area) * k * 2);
    const { color, text } = style(s);
    ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    // One label per cluster: two lights side by side share a label.
    if (labelled.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < 90 * unit)) continue;
    labelled.push([x, y]);
    // Label on a dark pill so it stays readable on any background.
    const tw = ctx.measureText(text).width;
    const lx = Math.min(x + rad + 6 * unit, ctx.canvas.width - tw - 12 * unit);
    const ly = x + rad + tw + 20 * unit > ctx.canvas.width ? y + rad + 18 * unit : y;
    ctx.fillStyle = '#000000b3';
    ctx.fillRect(lx - 5 * unit, ly - 13 * unit, tw + 10 * unit, 20 * unit);
    ctx.fillStyle = color;
    ctx.fillText(text, lx, ly + 2 * unit);
  }
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
  container.innerHTML = spec.map(([k, label, min, max, step]) =>
    `<label>${label}: <b id="v_${k}">${settings[k]}</b>
      <input type="range" id="s_${k}" min="${min}" max="${max}" step="${step}" value="${settings[k]}"></label>`).join('') +
    '<button class="ghost" id="resetSettings" type="button">Reset to defaults</button>';
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

/** Fill the "What this phone supports" table. */
export function showSupport(table, cam, locked) {
  const rows = describeSupport(cam.caps, cam.track.getSettings?.() || {});
  if (locked) rows.push(['Locked for the scan', locked.length ? locked.join(', ') : 'nothing']);
  table.innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
}

/** Phone and Details buttons each open their panel; only one is open at a time. */
export function wireSheets() {
  const pairs = [['supportBtn', 'support'], ['detailsBtn', 'details']].map(([b, s]) => [$(b), $(s)]);
  for (const [btn, sheet] of pairs) {
    btn.addEventListener('click', () => {
      const open = sheet.hidden;
      for (const [b, s] of pairs) { s.hidden = true; b.setAttribute('aria-pressed', 'false'); }
      sheet.hidden = !open;
      btn.setAttribute('aria-pressed', String(open));
    });
  }
}
