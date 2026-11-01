// "Find it" maths (no DOM, testable in node).
//
// Wi-Fi signal strength (RSSI, in dBm) gets stronger as you walk towards the
// transmitter, but it jumps around by several dB from reflections and your
// own body. So we smooth it with a moving average over the last few readings
// and only call "Warmer" or "Colder" when the change is bigger than that noise.

export const WINDOW = 4;       // readings in the moving average
export const STEP_DB = 3;      // change needed to say warmer/colder
export const CLOSE_DBM = -42;  // about one or two metres from a small camera's radio
const FLOOR = -90, CEIL = -35; // range mapped onto the ring

/** Moving average of the last WINDOW readings. */
export function smooth(levels) {
  const last = levels.slice(-WINDOW);
  return last.length ? last.reduce((a, b) => a + b, 0) / last.length : null;
}

/** How full the ring is, 0..1, from a smoothed level. */
export const fill = (dbm) => Math.max(0, Math.min(1, (dbm - FLOOR) / (CEIL - FLOOR)));

/**
 * One word for the user. `prev` is the smoothed level we last compared
 * against; it moves only when we announce a change, so slow steady walking
 * still adds up to "Warmer".
 */
export function word(now, prev) {
  if (now == null) return { word: 'Searching', ref: prev };
  if (now >= CLOSE_DBM) return { word: 'Very close', ref: now };
  if (prev == null) return { word: 'Start walking', ref: now };
  if (now - prev >= STEP_DB) return { word: 'Warmer', ref: now };
  if (prev - now >= STEP_DB) return { word: 'Colder', ref: now };
  return { word: 'Keep going', ref: prev };
}

/** Time between vibration pulses: faster when the signal is stronger. */
export const pulseGap = (dbm) => Math.round(1500 - 1250 * fill(dbm));

/**
 * Android throttles Wi-Fi scans, so readings can stay the same for 30 s or
 * more. If the newest reading is older than this, the page shows a tip.
 */
export const SLOW_MS = 8000;
export const isSlow = (ageMs) => ageMs != null && ageMs > SLOW_MS;
