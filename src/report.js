// PDF report (jsPDF). Built entirely in the browser.
// Two fingerprints: one of the report's contents, printed inside the PDF
// (see report-content.js), and one of the finished file, shown on screen.

import { jsPDF } from 'jspdf';
import { drawTraffic, drawRssi, LIGHT } from './charts.js';
import { codeToString } from './code.js';
import { APP_NAME } from './config.js';
import { reportContent, fingerprint, NOTHING_FOUND, LIMITS } from './report-content.js';

const VERDICT_TEXT = {
  camera: 'Camera very likely: its traffic followed the secret code.',
  maybe: 'Possible camera: partly followed the code. Run the challenge again.',
  no: 'No device followed the code.',
};

/**
 * Returns { blob, hash, contentHash, name }. `checks`, `wifi` (the short saved
 * Wi-Fi result) and `phone` come from store.js; `session`/`result`/`device`
 * are the full Wi-Fi analysis when the report is made on the Wi-Fi page.
 */
export async function buildReport({
  session, result, device, snapshots = [], fileName = '', demo = false, checks = {}, wifi = null, phone = null,
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;
  let y = 18;
  const line = (txt, size = 10, bold = false, color = 20) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size); doc.setTextColor(color);
    for (const l of doc.splitTextToSize(txt, W - 2 * M)) {
      if (y > 282) { doc.addPage(); y = 18; }
      doc.text(l, M, y); y += size * 0.45 + 1.2;
    }
  };
  const gap = (h = 3) => { y += h; };
  const kv = (k, v) => line(`${k}: ${v}`, 10);
  const now = new Date();
  const top = device || result?.devices[0];
  const content = reportContent({
    made: now.toISOString(), demo, checks, wifi, snapshots, phone,
    wifiDetail: result ? {
      code: session ? codeToString(session.code) : '', fileHash: result.fileHash,
      devices: result.devices.slice(0, 6).map((x) => ({ mac: x.mac, score: +x.score.toFixed(3), verdict: x.verdict })),
    } : null,
  });
  const contentHash = await fingerprint(content);

  line(`${APP_NAME} privacy check report`, 20, true);
  line(`Made ${now.toLocaleString()} (UTC ${now.toISOString()})`, 9, false, 90);
  if (demo) line('DEMO: this report uses simulated data, not a real room.', 10, true, 180);
  gap();

  line('1. What was checked', 13, true);
  for (const [k, v] of content.checks) kv(k, v);
  gap();

  line('2. Spots worth a closer look', 13, true);
  if (!snapshots.length) line(NOTHING_FOUND, 10);
  for (const s of snapshots) {
    if (y > 200) { doc.addPage(); y = 18; }
    const kind = s.mode === 'ir' ? 'IR check' : `Lens check${s.code ? ', torch code ' + s.code : ''}`;
    line(`${new Date(s.time).toLocaleString()}  ·  ${kind}  ·  ${s.label || s.note || ''}`, 9);
    if (!s.image) { line('(photo too large to keep)', 9, false, 100); continue; }
    const props = doc.getImageProperties(s.image);
    const iw = 110, ih = iw * props.height / props.width;
    doc.addImage(s.image, 'JPEG', M, y, iw, ih);
    y += ih + 4;
  }
  line(LIMITS, 9, false, 60);
  gap();

  line('3. Wi-Fi check details', 13, true);
  if (result && session) {
    kv('Secret code', `${codeToString(session.code)} (${session.code.length} bits, ${session.bitMs / 1000} s per bit; 1 = screen flickering)`);
    kv('Challenge started', session.startMs ? new Date(session.startMs).toISOString() : 'not recorded (whole capture searched)');
    kv('Capture file', `${fileName || 'unnamed'} (${result.format}, ${(result.fileBytes / 1024).toFixed(0)} KB)`);
    kv('Capture SHA-256', result.fileHash);
    kv('Frames / transmitters', `${result.totalFrames} frames from ${result.transmitters} transmitters`);
    if (result.channels[0]) kv('Channel', result.channels.map((c) => c.ch).join(', '));
    gap();
    const d = top;
    if (d) {
      line(VERDICT_TEXT[d.verdict], 12, true, d.verdict === 'camera' ? 170 : 20);
      kv('Device address (MAC)', d.mac);
      kv('Maker', `${d.vendor}${d.camChip ? ' (chip maker common in small Wi-Fi cameras)' : ''}`);
      kv('Score', `${d.score.toFixed(2)} (0 = no better than a random code, 1 = perfect)`);
      kv('Correlation r', d.r.toFixed(3));
      kv('p-value', `${d.p.toFixed(3)} (share of 200 random codes that matched as well, +1)`);
      kv('Delay found', `${d.offsetMs} ms`);
      kv('Signal strength', d.meanRssi != null ? `${d.meanRssi.toFixed(0)} dBm on average` : 'not in capture');
      gap(2);
      const c1 = document.createElement('canvas');
      drawTraffic(c1, result, d, LIGHT, 900, 260);
      if (y > 220) { doc.addPage(); y = 18; }
      doc.addImage(c1.toDataURL('image/png'), 'PNG', M, y, W - 2 * M, (W - 2 * M) * 260 / 900);
      y += (W - 2 * M) * 260 / 900 + 2;
      line('Shaded = screen flickering ("1" bits). Orange steps = average traffic in each bit.', 8, false, 100);
      const c2 = document.createElement('canvas');
      drawRssi(c2, result, result.devices.slice(0, 3), LIGHT, 900, 220);
      if (y > 225) { doc.addPage(); y = 18; }
      doc.addImage(c2.toDataURL('image/png'), 'PNG', M, y, W - 2 * M, (W - 2 * M) * 220 / 900);
      y += (W - 2 * M) * 220 / 900 + 4;
    }
    line('Top devices', 11, true);
    for (const x of result.devices.slice(0, 6)) {
      line(`${x.mac}  ${x.vendor.padEnd(14)}  score ${x.score.toFixed(2)}  p ${x.p.toFixed(3)}  ${x.verdict}`, 9);
    }
  } else {
    line(wifi ? content.checks[2][1] : 'Not run on this device.', 10);
  }
  gap();

  line('4. Phone and browser', 13, true);
  if (phone) {
    if (phone.model) kv('Phone', phone.model + (phone.platform ? ` (${phone.platform})` : ''));
    if (phone.camera) kv('Camera', phone.camera);
    kv('Browser', phone.browser || 'unknown');
    if (phone.support) kv('Camera controls', phone.support.map(([k, v]) => `${k}: ${v}`).join('; '));
  } else {
    line('Not recorded.', 10);
  }
  gap();

  line('5. How the checks work', 13, true);
  line('Lens: the phone torch blinked a random code. A camera lens reflects light straight back to its source, so it blinks back in the same code. Only small dots that matched the code were marked. A spot seen again after the phone moved is less likely to be a passing reflection.', 9);
  line('IR: with the lights and the torch off, the phone camera looked for small bright points that stayed on or blinked steadily, like the night-vision lights some cameras have.', 9);
  line('Wi-Fi: the screen flickered in a random code in front of the object. A streaming camera must send more data when its picture changes, so its traffic rises and falls with the code. Each device was scored by correlation, and compared with 200 random codes to get the p-value.', 9);
  line('Limits: a high score is strong evidence, not proof in law. Cameras that only record to a memory card, or use mobile data, do not show up in the Wi-Fi test.', 9);
  gap();
  gap();
  line('6. Fingerprint', 13, true);
  line(`Content fingerprint (SHA-256): ${contentHash}`, 9, true);
  line('This code is worked out from everything in this report, photos included, so if anyone changes the contents later the code will no longer match.', 9);
  gap();
  line(`Made with ${APP_NAME}. Team VICTOR.`, 8, false, 100);

  const bytes = doc.output('arraybuffer');
  const d = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const name = `${APP_NAME.toLowerCase()}-report-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.pdf`;
  return { blob: new Blob([bytes], { type: 'application/pdf' }), hash, contentHash, name };
}
