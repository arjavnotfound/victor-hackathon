// Tiny wrapper around localStorage. Everything stays on this device.
// Wrapped in try/catch because private windows can block storage.

const SNAP_KEY = 'victor.snapshots';
const SESSION_KEY = 'victor.challenge';
const MAX_SNAPS = 4;

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export const getSnapshots = () => read(SNAP_KEY, []);
export function addSnapshot(snap) {
  const list = [snap, ...getSnapshots()].slice(0, MAX_SNAPS);
  // If storage is full, drop the oldest until it fits.
  while (list.length && !write(SNAP_KEY, list)) list.pop();
  return list;
}
export const clearSnapshots = () => write(SNAP_KEY, []);

export const getChallenge = () => read(SESSION_KEY, null);
export const saveChallenge = (s) => write(SESSION_KEY, s);
