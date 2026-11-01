// Results: one calm summary, every check on this phone, saved spots, and the PDF report.

import { getChecks, getSnapshots, getWifiResult, getPhone, clearSession } from './store.js';
import { checkRows, findings, LIMITS } from './report-content.js';
import { buildReport } from './report.js';
import { icon } from './icons.js';
import { $, esc, isDemo, initPage, wireSheetButtons, closeSheet, stagger, when } from './ui.js';

initPage('Results');
wireSheetButtons();

function render() {
  const checks = getChecks(), wifi = getWifiResult(), snaps = getSnapshots();
  const f = findings(checks, wifi, snaps);

  const tone = !f.any ? 'grey' : f.count ? 'warn' : 'ok';
  $('badge').className = `badge ${tone}`;
  $('badge').innerHTML = icon(tone === 'warn' ? 'alert' : tone === 'ok' ? 'check' : 'doc');
  $('summary').textContent = f.text;
  $('summarySub').textContent = !f.any ? 'Start with the lens check. It takes about a minute.'
    : f.count ? 'Look closely at the items below. If you are worried, see what to do next.'
    : `Last check ${when(f.last)}.`;
  $('limits').textContent = LIMITS;

  const ico = { lens: 'lens', ir: 'night', network: 'wifi', wifi: 'laptop', coverage: 'target' };
  $('checks').innerHTML = checkRows(checks, wifi, snaps, when).map((r) => `
    <li><div class="row"><span class="ico ${r.done ? '' : 'grey'}">${icon(ico[r.key])}</span>
      <span class="row-text"><span>${r.name}</span>${r.detail ? `<span class="row-sub">${esc(r.detail)}</span>` : ''}</span>
      <span class="row-value ${r.tone === 'warn' ? 'warn-text' : ''}">${r.tone === 'warn' ? 'Look closer' : r.status}</span></div></li>`).join('');
  stagger($('checks'));
  $('coverNote').hidden = !checks.coverage;

  const netFlags = checks.network?.flagged || [];
  $('netSec').hidden = !netFlags.length;
  $('netList').innerHTML = netFlags.map((n) => `
    <li><div class="row"><span class="ico warn">${icon('wifi')}</span>
      <span class="row-text"><span>${esc(n.label)}</span><span class="row-sub">${esc(n.detail)}</span></span></div></li>`).join('');

  $('spotsSec').hidden = !snaps.length;
  $('spots').innerHTML = snaps.map((s) => `
    <li class="spot"><div class="row">
      ${s.image ? `<img class="thumb" src="${s.image}" alt="Saved spot from the ${s.mode === 'ir' ? 'night-vision' : 'lens'} check">` : `<span class="thumb"></span>`}
      <span class="row-text"><span>${esc(s.label || s.note || 'Saved spot')}</span>
      <span class="row-sub">${s.mode === 'ir' ? 'Night-vision lights' : 'Lens check'} · ${when(s.time)}</span></span></div></li>`).join('');
  stagger($('spots'));
  $('reportBtn').disabled = !f.any;
}

// Place and name are remembered on this phone so the next report is quicker.
const ABOUT = ['aboutPlace', 'aboutName', 'aboutNotes'];
try { const a = JSON.parse(localStorage.getItem('victor.about') || '{}'); for (const k of ABOUT) $(k).value = a[k] || ''; } catch { /* storage blocked */ }

$('makePdf').addEventListener('click', async () => {
  const about = { place: $('aboutPlace').value.trim(), name: $('aboutName').value.trim(), notes: $('aboutNotes').value.trim() };
  try { localStorage.setItem('victor.about', JSON.stringify(Object.fromEntries(ABOUT.map((k) => [k, $(k).value])))); } catch { /* storage blocked */ }
  closeSheet();
  $('reportBtn').disabled = true;
  $('reportNote').hidden = false;
  $('reportNote').textContent = 'Making the report…';
  try {
    const { blob, contentHash, name } = await buildReport({
      snapshots: getSnapshots(), checks: getChecks(), wifi: getWifiResult(), phone: getPhone(), about,
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
    $('reportNote').textContent = 'Saved to your downloads.';
    $('reportSec').hidden = false;
    $('reportName').textContent = name;
    $('reportHash').textContent = contentHash;
  } catch (e) {
    $('reportNote').textContent = 'Could not make the report. Try again.';
    console.warn(e);
  } finally {
    $('reportBtn').disabled = false;
  }
});

$('clearYes').addEventListener('click', () => {
  clearSession();
  $('reportSec').hidden = true;
  $('reportNote').hidden = true;
  closeSheet();
  render();
});

render();
