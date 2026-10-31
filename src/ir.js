// IR check maths (no DOM, so it can be tested in node).
//
// Physics: many hidden cameras have small infrared LEDs (around 850 nm) so
// they can see in the dark. Our eyes cannot see that light, but most phone
// camera sensors can, and show it as a small white or purple dot. With the
// room lights off and the torch off, such a dot is one of the brightest,
// smallest things in the picture.
//
// What we must not flag: a lamp or a window (big bright area), a passing
// reflection or a camera glitch (bright for one frame only). So we keep small
// isolated dots and only flag one that stays bright for about a second, or
// keeps blinking on and off.

import { findBlobs } from './lens.js';

/** All IR check thresholds in one place (tunable in the Details panel). */
export const IR_DEFAULTS = {
  brightMin: 225,    // grey level a pixel needs to count as "very bright" (0..255)
  contrastMin: 60,   // how much brighter the dot must be than the ring around it
  maxArea: 60,       // biggest dot in analysis pixels; bigger is a lamp or a window
  steadyMs: 1000,    // bright this long without a break = flagged
  blinks: 3,         // or switched on this many separate times = flagged (a steady blink)
};

// How long a tracked dot may disappear before it counts as "off", and before
// we forget it. 1.5 s keeps slow blinks (about once a second) as one track.
const GAP_MS = 250;
const FORGET_MS = 1500;

/**
 * Find small, very bright, isolated dots in one grey frame.
 * Returns [{ x, y, area, peak }].
 */
export function findBrightSpots(gray, w, h, opts = {}) {
  const { brightMin, contrastMin, maxArea } = { ...IR_DEFAULTS, ...opts };
  // Reuse the lens blob finder: "r" marks bright pixels, "amp" is unused.
  const mask = new Float32Array(gray.length);
  for (let p = 0; p < gray.length; p++) mask[p] = gray[p] >= brightMin ? 1 : 0;
  const blobs = findBlobs(mask, mask, w, h, { rMin: 0.5, ampMin: 0.5, minArea: 1, maxArea });
  const out = [];
  for (const b of blobs) {
    // Ring just outside the dot. A lone LED has dark surroundings; the edge
    // of something big and bright does not.
    const radius = Math.sqrt(b.area / Math.PI) + 3;
    let ringMax = 0, peak = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(b.x + radius * Math.cos(a)), y = Math.round(b.y + radius * Math.sin(a));
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      ringMax = Math.max(ringMax, gray[y * w + x]);
    }
    const cx = Math.round(b.x), cy = Math.round(b.y);
    peak = gray[cy * w + cx];
    if (peak - ringMax >= contrastMin) out.push({ x: b.x, y: b.y, area: b.area, peak });
  }
  return out;
}

/**
 * Follow dots from frame to frame. `t` is the frame time in ms.
 * Each track remembers when its current bright run started and how many
 * separate runs it has had. A track is `flagged` once it stays bright for
 * `steadyMs`, or has switched on `blinks` times. Once flagged it stays flagged
 * until it is forgotten.
 */
export function updateIrTracks(tracks, spots, t, opts = {}) {
  const { steadyMs, blinks, maxDist = 20 } = { ...IR_DEFAULTS, ...opts };
  const used = new Set();
  for (const s of spots) {
    let best = null, bestD = maxDist;
    for (const tr of tracks) {
      if (used.has(tr)) continue;
      const d = Math.hypot(tr.x - s.x, tr.y - s.y);
      if (d < bestD) { bestD = d; best = tr; }
    }
    if (!best) {
      best = { x: s.x, y: s.y, area: s.area, runStart: t, runs: 1, lastSeen: t, flagged: false };
      tracks.push(best);
    } else if (t - best.lastSeen > GAP_MS) {
      best.runStart = t; best.runs++; // it was off for a while: a new blink
    }
    used.add(best);
    Object.assign(best, { x: s.x, y: s.y, area: s.area, lastSeen: t });
    if (t - best.runStart >= steadyMs || best.runs >= blinks) best.flagged = true;
  }
  // Forget dots not seen for a while (the camera moved on, or it was a flash).
  for (let i = tracks.length - 1; i >= 0; i--) if (t - tracks[i].lastSeen > FORGET_MS) tracks.splice(i, 1);
  return tracks;
}

/** Tracks to draw now: flagged ones that were seen in the last moment. */
export const visibleFlagged = (tracks, t) => tracks.filter((tr) => tr.flagged && t - tr.lastSeen <= GAP_MS * 2);
