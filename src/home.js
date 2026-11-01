// Home screen: the last check's result, the laptop QR code and settings.

import { TAGLINE } from './config.js';
import { getChecks, getSnapshots, getWifiResult, clearSession } from './store.js';
import { findings } from './report-content.js';
import { icon } from './icons.js';
import { $, initPage, wireSheetButtons, closeSheet, when } from './ui.js';
import { LANGS, getLang, setLang } from './strings.js';

initPage('');
$('tagline').textContent = TAGLINE;

function showLast() {
  const f = findings(getChecks(), getWifiResult(), getSnapshots());
  $('last').hidden = !f.last;
  if (!f.last) return;
  $('lastIco').className = `ico ${f.count ? 'warn' : 'ok'}`;
  $('lastIco').innerHTML = icon(f.count ? 'alert' : 'check');
  $('lastText').textContent = f.count ? f.text : 'Nothing found';
  $('lastWhen').textContent = when(f.last);
}
showLast();

$('settingsBody').innerHTML = `
  <div class="label">Language</div>
  <div class="seg" role="radiogroup" aria-label="Language">${Object.entries(LANGS).map(([k, v]) => `
    <label><input type="radio" name="lang" value="${k}" ${getLang() === k ? 'checked' : ''}><span lang="${k}">${v}</span></label>`).join('')}</div>
  <div class="label">This phone</div>
  <ul class="group"><li><button class="row" id="clearAll" type="button"><span class="row-text bad-text">Clear results</span></button></li></ul>
  <p class="footer">Removes saved spots and which checks ran. Tuned settings stay.</p>`;
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
