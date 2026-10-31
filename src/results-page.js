// Results: what was checked, the saved spots, a calm summary and the PDF report.

import { getChecks, getSnapshots, getWifiResult, getPhone, clearSession } from './store.js';
import { checkLines, LIMITS, NOTHING_FOUND } from './report-content.js';
import { buildReport } from './report.js';
import { $, isDemo, initPage } from './ui.js';

initPage('Results');

function render() {
  const checks = getChecks(), wifi = getWifiResult(), snaps = getSnapshots();
  const anyCheck = checks.lens || checks.ir || wifi;
  const wifiFlag = wifi && (wifi.verdict === 'camera' || wifi.verdict === 'maybe');

  if (!anyCheck && !snaps.length) $('summary').textContent = 'No checks yet on this phone.';
  else if (snaps.length || wifiFlag) {
    const n = snaps.length;
    $('summary').textContent = n
      ? `${n} spot${n > 1 ? 's' : ''} worth a closer look.`
      : 'The Wi-Fi check found something worth a closer look.';
  } else $('summary').textContent = NOTHING_FOUND;
  $('limits').textContent = LIMITS;

  $('checks').innerHTML = checkLines(checks, wifi)
    .map(([k, v]) => `<li><span>${k}</span><span>${v}</span></li>`).join('');

  $('spotsSec').hidden = !snaps.length;
  $('spots').innerHTML = snaps.map((s) => `
    <figure class="spot" style="margin:0 0 20px">
      ${s.image ? `<img src="${s.image}" alt="Saved spot from the ${s.mode === 'ir' ? 'IR' : 'lens'} check">` : ''}
      <p>${s.label || s.note || 'Saved spot'}</p>
      <p class="when">${s.mode === 'ir' ? 'IR check' : 'Lens check'} · ${new Date(s.time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
    </figure>`).join('');
}

$('reportBtn').addEventListener('click', async () => {
  $('reportBtn').disabled = true;
  try {
    const { blob, hash, contentHash, name } = await buildReport({
      snapshots: getSnapshots(), checks: getChecks(), wifi: getWifiResult(), phone: getPhone(), demo: isDemo,
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
