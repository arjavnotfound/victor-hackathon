// Results: what was checked, the saved spots, a calm summary and the PDF report.

import { getChecks, getSnapshots, getWifiResult, getPhone, clearSession } from './store.js';
import { checkLines, LIMITS, NOTHING_FOUND } from './report-content.js';
import { buildReport } from './report.js';
import { $, isDemo, initPage } from './ui.js';

initPage('Results');
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function render() {
  const checks = getChecks(), wifi = getWifiResult(), snaps = getSnapshots();
  const anyCheck = checks.lens || checks.ir || checks.network || wifi;
  const wifiFlag = wifi && (wifi.verdict === 'camera' || wifi.verdict === 'maybe');
  const netFlags = checks.network?.flagged || [];

  if (!anyCheck && !snaps.length) $('summary').textContent = 'No checks yet on this phone.';
  else if (snaps.length || wifiFlag || netFlags.length) {
    const n = snaps.length + netFlags.length;
    $('summary').textContent = n
      ? `${n} thing${n > 1 ? 's' : ''} worth a closer look.`
      : 'The Wi-Fi check found something worth a closer look.';
  } else $('summary').textContent = NOTHING_FOUND;
  $('limits').textContent = LIMITS;

  $('checks').innerHTML = checkLines(checks, wifi)
    .map(([k, v]) => `<li><div class="pair"><span>${k}</span><span>${esc(v)}</span></div></li>`).join('');

  $('netSec').hidden = !netFlags.length;
  $('netList').innerHTML = netFlags.map((f) => `<li><b>${esc(f.label)}</b><span class="hint">${esc(f.detail)}</span></li>`).join('');
  $('spotsSec').hidden = !snaps.length;
  $('spots').innerHTML = snaps.map((s) => `
    <li class="spot">
      ${s.image ? `<img src="${s.image}" alt="Saved spot from the ${s.mode === 'ir' ? 'IR' : 'lens'} check">` : ''}
      <span>${esc(s.label || s.note || 'Saved spot')}</span>
      <span class="hint">${s.mode === 'ir' ? 'IR check' : 'Lens check'} · ${new Date(s.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
    </li>`).join('');
}

$('reportBtn').addEventListener('click', async () => {
  $('reportBtn').disabled = true;
  try {
    const { blob, hash, contentHash, name } = await buildReport({
      snapshots: getSnapshots(), checks: getChecks(), wifi: getWifiResult(), phone: getPhone(),
      // Say DEMO whenever the simulated camera or sample Wi-Fi data was used.
      demo: isDemo || /simulated/.test(getPhone()?.camera || '') || !!getWifiResult()?.demo,
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    $('reportNote').hidden = false;
    $('reportNote').innerHTML = `Saved as ${name}. The fingerprint printed inside it:` +
      `<span class="hash">${contentHash}</span><span class="hash">File SHA-256: ${hash}</span>`;
  } catch (e) {
    $('reportNote').hidden = false;
    $('reportNote').textContent = 'Could not make the report: ' + e.message;
  } finally {
    $('reportBtn').disabled = false;
  }
});

$('clearBtn').addEventListener('click', () => {
  if (!confirm('Clear the saved spots and checks on this phone?')) return;
  clearSession();
  $('reportNote').hidden = true;
  render();
});

render();
