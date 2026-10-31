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
