// Coverage ring maths (no DOM, testable in node).
//
// While a lens or night-vision scan runs, we note which way the phone points,
// using its compass. The full circle is split into 12 slices of 30 degrees.
// A slice counts once the phone pointed into it during a scan. This shows
// where the user pointed, not that a direction is clear.

export const SLICES = 12;

/**
 * Compass heading (0 = north, clockwise, degrees) from a deviceorientation
 * event, or null if the phone does not give a real compass reading.
 * - iPhone Safari gives `webkitCompassHeading` directly.
 * - Android Chrome gives `alpha` with `absolute: true` (from the
 *   deviceorientationabsolute event). alpha turns counter-clockwise, so the
 *   heading is 360 - alpha.
 * A relative alpha (absolute false) still tells us how far the phone turned
 * since the page opened, which is all the ring needs, so it is used too.
 */
export function headingOf(e) {
  if (e == null) return null;
  if (typeof e.webkitCompassHeading === 'number') return norm(e.webkitCompassHeading);
  if (typeof e.alpha === 'number') return norm(360 - e.alpha);
  return null;
}

const norm = (d) => ((d % 360) + 360) % 360;

/** Which slice a heading falls in (0..11). */
export const sliceOf = (deg) => Math.floor(norm(deg) / (360 / SLICES)) % SLICES;

/** Mark the slice for a heading. `seen` is an array of 12 booleans. Returns it. */
export function addHeading(seen, deg) {
  if (deg == null || Number.isNaN(deg)) return seen;
  seen[sliceOf(deg)] = true;
  return seen;
}

export const emptyCoverage = () => Array(SLICES).fill(false);
export const countSeen = (seen = []) => seen.filter(Boolean).length;

/** Combine two coverage arrays (lens and night-vision scans share one ring). */
export const mergeCoverage = (a = [], b = []) => emptyCoverage().map((_, i) => !!(a[i] || b[i]));

/** Plain sentence for results and the report. */
export const coverageText = (seen) => `You checked ${countSeen(seen)} of ${SLICES} directions.`;
