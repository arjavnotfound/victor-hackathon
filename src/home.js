// Home screen: the last check's result, the laptop QR code and settings.

import { getChecks, getSnapshots, getWifiResult, clearSession } from './store.js';
import { findings } from './report-content.js';
import { markSvg } from './icons.js';
import { $, initPage, wireSheetButtons, closeSheet, when } from './ui.js';
import { LANGS, getLang, setLang } from './strings.js';
import { listenerBase, setListenerBase } from './bridge.js';

initPage('');

$('brandMark').innerHTML = markSvg();
$('heroMark').innerHTML = markSvg('live');

/** Ring on the hero: how many of the three phone checks ran, coloured by what they found. */
function showLast() {
  const checks = getChecks();
  const f = findings(checks, getWifiResult(), getSnapshots());
  const done = ['lens', 'ir', 'network'].filter((k) => checks[k]).length;
  const ring = $('lastRing');
  ring.style.setProperty('--c', f.count ? 'var(--warn)' : done ? 'var(--ok)' : 'var(--ink)');
  requestAnimationFrame(() => ring.style.setProperty('--v', done / 3));
  $('lastNum').textContent = f.last ? (f.count || '✓') : '–';
  $('lastText').textContent = !f.last ? 'No checks yet' : f.count ? f.text : 'Nothing found';
  $('lastWhen').textContent = f.last ? `${done} of 3 checks · ${when(f.last)}` : 'Takes about a minute';
  const n = getSnapshots().length;
  $('nSpots').firstChild.textContent = n;
}

// Splash once per visit: the mark draws itself, then fades into the home screen.
try {
  if (!sessionStorage.getItem('splash') && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    sessionStorage.setItem('splash', '1');
    const s = $('splash');
    s.innerHTML = markSvg('draw');
    s.hidden = false;
    setTimeout(() => s.classList.add('gone'), 900);
    setTimeout(() => s.remove(), 1500);
  }
} catch { /* storage blocked: no splash */ }
showLast();

$('settingsBody').innerHTML = `
  <div class="label">Language</div>
  <div class="seg" role="radiogroup" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `
    <label><input type="radio" name="lang" value="${k}" ${getLang() === k ? 'checked' : ''}><span lang="${k}">${v}</span></label>`).join('')}</div>
  <div class="label">Traffic scans</div>
  <ul class="group"><li><label class="field"><span>Listener address</span><input id="listenerIn" inputmode="url" autocomplete="off" placeholder="http://192.168.1.5:5174"></label></li></ul>
  <p class="footer">Only needed in the Android app. In the browser it is found on its own.</p>
  <div class="label">This phone</div>
  <ul class="group"><li><button class="row" id="clearAll" type="button"><span class="row-text bad-text">Clear results</span></button></li></ul>
  <p class="footer">Removes saved spots and which checks ran. Tuned settings stay.</p>`;
$('listenerIn').value = listenerBase();
$('listenerIn').addEventListener('change', (e) => setListenerBase(e.target.value));
$('clearAll').addEventListener('click', () => {
  clearSession();
  showLast();
  closeSheet();
});
for (const r of document.querySelectorAll('input[name=lang]')) {
  r.addEventListener('change', () => { setLang(r.value); location.reload(); });
}
wireSheetButtons();

// QR code for the laptop view only; loaded lazily so phones never fetch it.
if (matchMedia('(min-width: 900px) and (hover: hover)').matches) {
  import('qrcode').then(({ default: QR }) => QR.toCanvas($('qr'),
    location.protocol === 'https:' ? location.href.split('?')[0] : 'https://arjavnotfound.github.io/victor-hackathon/',
    { margin: 0, width: 112 }));
}
