// What goes into the report, and its fingerprint (no DOM, no PDF library,
// so it can be tested in node).
//
// The fingerprint is a SHA-256 of the report's contents (text and photos).
// It is printed inside the PDF. A PDF cannot contain the hash of its own
// bytes (adding the hash would change the bytes), so we hash the contents
// instead. Change a word or a photo and the fingerprint no longer matches.

export const LIMITS =
  'This check does not cover everything. It can miss cameras whose lens does not reflect the torch at this angle, ' +
  'cameras with no night-vision lights, and recorders that do not use Wi-Fi.';

export const NOTHING_FOUND = 'Nothing found in what we checked.';

/** Plain words for a saved Wi-Fi result. */
export const WIFI_PLAIN = {
  camera: "A device's Wi-Fi traffic followed the flashes. Worth a closer look.",
  maybe: 'A device partly followed the flashes. Run the Wi-Fi check again.',
  no: "No device's Wi-Fi traffic followed the flashes.",
  none: 'No device in the capture was streaming during the test.',
};

/**
 * How many things are worth a closer look across every check on this phone,
 * and one calm sentence saying so. `snaps` = saved spots.
 */
export function findings(checks = {}, wifi = null, snaps = []) {
  const net = checks.network?.flagged?.length || 0;
  const wifiFlag = !!wifi && (wifi.verdict === 'camera' || wifi.verdict === 'maybe');
  const count = snaps.length + net + (wifiFlag ? 1 : 0);
  const any = !!(checks.lens || checks.ir || checks.network || wifi || snaps.length);
  const times = [checks.lens?.at, checks.ir?.at, checks.network?.at, wifi?.at, ...snaps.map((s) => s.time)].filter(Boolean).sort();
  const text = !any ? 'No checks yet on this phone.'
    : count ? `${count} thing${count > 1 ? 's' : ''} worth a closer look.`
    : NOTHING_FOUND;
  return { count, any, text, last: times.at(-1) || null };
}

/**
 * One row per check for the Results screen and the report:
 * { key, name, done, status, detail, tone: 'ok' | 'warn' | 'grey' }.
 * `whenFn` formats a time (passed in so this stays testable in node).
 */
export function checkRows(checks = {}, wifi = null, snaps = [], whenFn = (t) => t) {
  const spots = (mode) => snaps.filter((s) => s.mode === mode).length;
  const closer = (n, noun = 'spot') => `${n} ${noun}${n > 1 ? 's' : ''} worth a closer look`;
  const row = (key, name, c, n, detail, noun) => (!c
    ? { key, name, done: false, status: 'Not done', detail: '', tone: 'grey' }
    : { key, name, done: true, status: n ? closer(n, noun) : 'Nothing found', detail, tone: n ? 'warn' : 'ok' });
  const L = checks.lens, I = checks.ir, N = checks.network;
  const rows = [
    row('lens', 'Lens check', L, spots('lens'), L && `${L.scans || 0} scan${L.scans === 1 ? '' : 's'}`),
    row('ir', 'Night-vision lights', I, spots('ir'), I && `${I.camera || 'back'} camera`),
    row('network', 'Network', N, N?.flagged?.length || 0,
      N && `${N.nearby} network${N.nearby === 1 ? '' : 's'}, ${N.devices} device${N.devices === 1 ? '' : 's'}`, 'item'),
  ];
  const wf = wifi && (wifi.verdict === 'camera' || wifi.verdict === 'maybe');
  rows.push(wifi
    ? { key: 'wifi', name: 'Wi-Fi traffic', done: true, status: wf ? closer(1, 'device') : 'Nothing found', detail: whenFn(wifi.at), tone: wf ? 'warn' : 'ok' }
    : { key: 'wifi', name: 'Wi-Fi traffic', done: false, status: 'Not done', detail: 'Laptop step', tone: 'grey' });
  return rows;
}

/** One plain line per check: [name, answer]. */
export function checkLines(checks = {}, wifi = null) {
  const when = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const lens = checks.lens
    ? `Yes, ${checks.lens.scans || 0} scan${checks.lens.scans === 1 ? '' : 's'} (last ${when(checks.lens.at)})`
    : 'No';
  const ir = checks.ir ? `Yes, ${checks.ir.camera || 'back'} camera (${when(checks.ir.at)})` : 'No';
  const wf = wifi ? `Yes (${when(wifi.at)}). ${WIFI_PLAIN[wifi.verdict] || ''}`.trim() : 'Not saved on this device';
  const nw = checks.network;
  const net = nw
    ? `Yes, ${nw.nearby} nearby networks and ${nw.devices} devices (${when(nw.at)})${nw.flagged?.length ? `, ${nw.flagged.length} worth a closer look` : ''}`
    : 'No';
  return [['Lens check', lens], ['IR check', ir], ['Network check', net], ['Wi-Fi check', wf]];
}

/**
 * Everything the report says, as one plain object. The fingerprint is taken
 * of exactly this, so the same inputs always give the same fingerprint.
 */
export function reportContent({ made, demo = false, checks = {}, wifi = null, snapshots = [], phone = null, wifiDetail = null }) {
  return {
    made,
    demo: !!demo,
    checks: checkLines(checks, wifi),
    network: checks.network?.flagged || [],
    spots: snapshots.map((s) => ({
      time: s.time, kind: s.mode, label: s.label || s.note || '', code: s.code || '', image: s.image || '',
    })),
    wifiDetail,
    phone,
    limits: LIMITS,
  };
}

export async function sha256Text(text) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const fingerprint = (content) => sha256Text(JSON.stringify(content));
