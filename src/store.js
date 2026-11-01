// Tiny wrapper around localStorage. Everything stays on this device.
// Wrapped in try/catch because private windows can block storage.
// Pages share results through here: which checks were done, saved spots
// (with snapshots), phone info, the last Wi-Fi result and tuned settings.

const SNAP_KEY = 'victor.snapshots';
const SESSION_KEY = 'victor.challenge';
const CHECKS_KEY = 'victor.checks';
const PHONE_KEY = 'victor.phone';
const WIFI_KEY = 'victor.wifi';
const SETTINGS_KEY = 'victor.settings.';
const AIR_KEY = 'victor.air';
const MAX_SNAPS = 6;
// A 640 px JPEG is usually 40-90k characters as a data URL. Anything far
// bigger is skipped so a few snapshots cannot fill the ~5 MB storage.
export const MAX_IMAGE_CHARS = 400_000;

function read(key, fallback) {
  try { return JSON.parse(globalThis.localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { globalThis.localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

// ---------- saved spots (snapshots) ----------
// A snapshot: { time, mode: 'lens' | 'ir', label, image (data URL), code?, note? }

export const getSnapshots = () => read(SNAP_KEY, []);
export function addSnapshot(snap) {
  if (snap.image && snap.image.length > MAX_IMAGE_CHARS) snap = { ...snap, image: '' };
  const list = [snap, ...getSnapshots()].slice(0, MAX_SNAPS);
  // If storage is full, drop the oldest until it fits.
  while (list.length && !write(SNAP_KEY, list)) list.pop();
  return list;
}
export const clearSnapshots = () => write(SNAP_KEY, []);

// ---------- which checks were done ----------

export const getChecks = () => read(CHECKS_KEY, {});
/** Record that a check ran. `extra` is merged in (e.g. { scans: 3 }). */
export function markCheck(kind, extra = {}) {
  const checks = getChecks();
  checks[kind] = { ...checks[kind], ...extra, at: new Date().toISOString() };
  write(CHECKS_KEY, checks);
  return checks;
}

// ---------- phone and browser info ----------

export const getPhone = () => read(PHONE_KEY, null);
export const savePhone = (info) => write(PHONE_KEY, { ...getPhone(), ...info });

// ---------- Wi-Fi check (laptop page) ----------

export const getChallenge = () => read(SESSION_KEY, null);
export const saveChallenge = (s) => write(SESSION_KEY, s);
export const getWifiResult = () => read(WIFI_KEY, null);
export const saveWifiResult = (r) => write(WIFI_KEY, r);

// ---------- Wi-Fi map sources ----------
// { capture: [...sources from the traffic test], nearby: [...from the Android scan], at }

export const getAir = () => read(AIR_KEY, { capture: [], nearby: [] });
export const saveAir = (part) => write(AIR_KEY, { ...getAir(), ...part, at: new Date().toISOString() });

// ---------- tuned thresholds from the Details panel ----------

export const getSettings = (name, defaults) => ({ ...defaults, ...read(SETTINGS_KEY + name, {}) });
export const saveSettings = (name, values) => write(SETTINGS_KEY + name, values);

/** Start a fresh check: forget spots and which checks ran. Tuned settings stay. */
export function clearSession() {
  write(SNAP_KEY, []);
  write(CHECKS_KEY, {});
}
