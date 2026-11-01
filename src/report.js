// PDF report (jsPDF). Built entirely in the browser.
// Two fingerprints: one of the report's contents, printed inside the PDF
// (see report-content.js), and one of the finished file, shown on screen.

import { jsPDF } from 'jspdf';
import { drawTraffic, drawRssi, LIGHT } from './charts.js';
import { codeToString } from './code.js';
import { APP_NAME } from './config.js';
import { countSeen } from './coverage.js';
import { reportContent, fingerprint, findings, checkRows, NOTHING_FOUND, LIMITS } from './report-content.js';

const VERDICT_TEXT = {
  camera: "A device's traffic followed the secret code. Worth a closer look.",
  maybe: 'A device partly followed the code. Run the check again.',
  no: 'No device followed the code.',
};

/**
 * Returns { blob, hash, contentHash, name }. `checks`, `wifi` (the short saved
 * Wi-Fi result) and `phone` come from store.js; `session`/`result`/`device`
 * are the full Wi-Fi analysis when the report is made on the Wi-Fi page.
 */
export async function buildReport({
  session, result, device, snapshots = [], fileName = '', demo = false, checks = {}, wifi = null, phone = null, about = {},
}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 15;
  let y = 18;
  const line = (txt, size = 10, bold = false, color = 20) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size); doc.setTextColor(...[].concat(color));
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
    made: now.toISOString(), about, demo, checks, wifi, snapshots, phone,
    wifiDetail: result ? {
      code: session ? codeToString(session.code) : '', fileHash: result.fileHash,
      devices: result.devices.slice(0, 6).map((x) => ({ mac: x.mac, score: +x.score.toFixed(3), verdict: x.verdict })),
    } : null,
  });
  const contentHash = await fingerprint(content);

  // Layout: a tinted header band, a one-line summary, then one section per
  // check. Colours are kept to the app's teal and a calm amber for findings.
  const TEAL = [11, 122, 112], AMBER = [178, 106, 0], GREY = 110;
  const need = (h) => { if (y + h > 282) { doc.addPage(); y = 18; } };
  const section = (title) => {
    need(16); gap(4);
    doc.setDrawColor(220); doc.line(M, y - 4, W - M, y - 4);
    line(title, 13, true); gap(1);
  };
  doc.setFillColor(...TEAL); doc.rect(0, 0, W, 34, 'F');
  doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text(`${APP_NAME} room check`, M, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(now.toLocaleString([], { dateStyle: 'long', timeStyle: 'short' }), M, 23);
  const who = [about.place, about.name && `Checked by ${about.name}`].filter(Boolean).join('  ·  ');
  if (who) doc.text(doc.splitTextToSize(who, W - 2 * M)[0], M, 29);
  y = 44;
  if (demo) line('DEMO: this report uses simulated data, not a real room.', 10, true, AMBER);
  const f = findings(checks, wifi, snapshots);
  doc.setTextColor(...(f.count ? AMBER : TEAL));
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(f.text, M, y); y += 8;
  if (about.notes) { line('Notes', 10, true); line(about.notes, 10); gap(2); }

  section('Checks done');
  for (const r of checkRows(checks, wifi, snapshots, () => '')) {
    need(7);
    const c = r.tone === 'warn' ? AMBER : r.tone === 'ok' ? TEAL : [GREY, GREY, GREY];
    doc.setFillColor(...c); doc.circle(M + 1.5, y - 1.3, 1.3, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(20);
    doc.text(r.name, M + 6, y);
    doc.setTextColor(...c); doc.text(r.status, M + 70, y);
    if (r.detail) { doc.setTextColor(GREY); doc.text(r.detail, W - M, y, { align: 'right' }); }
    y += 6.5;
  }
  if (countSeen(checks.coverage?.seen)) line('Directions covered shows where the phone pointed during scans, not that a direction is clear.', 8, false, GREY);

  section('Saved spots');
  if (!snapshots.length) line(NOTHING_FOUND, 10);
  // Two photos per row with their caption underneath.
  const colW = (W - 2 * M - 6) / 2;
  snapshots.forEach((s, i) => {
    const x = M + (i % 2) * (colW + 6);
    let ih = 30;
    if (s.image) { const p = doc.getImageProperties(s.image); ih = colW * p.height / p.width; }
    if (i % 2 === 0) need(ih + 14);
    const top = y;
    if (s.image) doc.addImage(s.image, 'JPEG', x, top, colW, ih);
    else { doc.setFillColor(240); doc.rect(x, top, colW, ih, 'F'); }
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
    doc.text(doc.splitTextToSize(s.label || s.note || 'Saved spot', colW)[0], x, top + ih + 5);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(GREY);
    doc.text(`${s.mode === 'ir' ? 'Night-vision lights' : 'Lens check'}  ·  ${new Date(s.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`, x, top + ih + 9.5);
    if (i % 2 === 1 || i === snapshots.length - 1) y = top + ih + 15;
  });

  section('Network');
  if (!checks.network) line('Not run on this phone.', 10);
  else if (!content.network.length) line(`${NOTHING_FOUND} ${checks.network.nearby} nearby networks and ${checks.network.devices} devices looked at.`, 10);
  for (const n of content.network) {
    need(12);
    line(n.label, 10, true);
    for (const r of n.reasons || [n.detail]) line(`-  ${r}`, 9, false, 60);
    gap(1);
  }

  need(18); gap(3);
  doc.setFillColor(245, 245, 247);
  const lim = doc.splitTextToSize(LIMITS, W - 2 * M - 8);
  doc.roundedRect(M, y - 4, W - 2 * M, lim.length * 4.4 + 6, 2, 2, 'F');
  doc.setFontSize(9); doc.setTextColor(60); doc.text(lim, M + 4, y + 1); y += lim.length * 4.4 + 6;

  section('Wi-Fi traffic details');
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
    line(wifi ? content.checks[3][1] : 'Not run on this phone.', 10);
  }

  section('Phone used');
  if (phone) {
    if (phone.model) kv('Phone', phone.model + (phone.platform ? ` (${phone.platform})` : ''));
    if (phone.camera) kv('Camera', phone.camera);
    kv('Browser', phone.browser || 'unknown');
    if (phone.support) kv('Camera controls', phone.support.map(([k, v]) => `${k}: ${v}`).join('; '));
  } else {
    line('Not recorded.', 10);
  }

  section('How the checks work');
  line('Lens: the phone torch blinked a random code. A camera lens reflects light straight back to its source, so it blinks back in the same code. Only small dots that matched the code were marked. A spot seen again after the phone moved is less likely to be a passing reflection.', 9);
  line('Network: the app listed Wi-Fi networks nearby and devices on the joined Wi-Fi. It looked for default camera hotspot names, camera chip makers, devices that answer as a video stream, and devices that reply to or announce themselves with the standard camera messages.', 9);
  line('IR: with the lights and the torch off, the phone camera looked for small bright points that stayed on or blinked steadily, like the night-vision lights some cameras have.', 9);
  line('Wi-Fi: the screen flickered in a random code in front of the object. A streaming camera must send more data when its picture changes, so its traffic rises and falls with the code. Each device was scored by correlation, and compared with 200 random codes to get the p-value.', 9);
  line('Limits: a high score is strong evidence, not proof in law. Cameras that only record to a memory card, or use mobile data, do not show up in the Wi-Fi test.', 9);
  need(30); // keep the heading with its fingerprint
  section('Fingerprint');
  doc.setFont('courier', 'normal'); doc.setFontSize(9); doc.setTextColor(20); doc.text(contentHash, M, y); y += 5;
  line('This code is worked out from everything in this report, photos included, so if anyone changes the contents later the code will no longer match.', 9);
  gap();
  line(`Made with ${APP_NAME}. Team VICTOR.`, 8, false, 100);

  const bytes = doc.output('arraybuffer');
  const d = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const name = `${APP_NAME.toLowerCase()}-report-${now.toISOString().replace(/[:.]/g, '-').slice(0, 19)}.pdf`;
  return { blob: new Blob([bytes], { type: 'application/pdf' }), hash, contentHash, name };
}
