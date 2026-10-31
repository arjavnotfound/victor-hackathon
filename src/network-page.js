// Network check screen. Only works inside the Android app, where our
// NetworkCheck plugin can list Wi-Fi networks and local devices.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { summarize, ALL_PORTS } from './network.js';
import { markCheck } from './store.js';
import { $, initPage } from './ui.js';

initPage('Network check');
const NetworkCheck = registerPlugin('NetworkCheck');
const native = Capacitor.isNativePlatform();
$('webOnly').hidden = native;
$('appOnly').hidden = !native;

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function run() {
  $('runBtn').disabled = true;
  $('found').hidden = true;
  $('counts').textContent = '';
  let nearby = [], devices = [], notes = [];

  $('status').textContent = 'Looking at Wi-Fi networks around you…';
  try {
    const r = await NetworkCheck.nearby();
    nearby = r.networks;
    if (!r.locationOn) notes.push('Location is off, so Android may hide nearby networks. Turn it on and check again.');
  } catch (e) {
    notes.push(e.message);
  }

  $('status').textContent = 'Looking at devices on this Wi-Fi. This takes about 15 seconds…';
  try {
    const r = await NetworkCheck.lan({ ports: ALL_PORTS });
    devices = r.devices;
  } catch (e) {
    notes.push(e.message);
  }

  const sum = summarize({ nearby, devices });
  markCheck('network', sum);
  $('status').textContent = notes.join(' ');
  $('counts').textContent = `Looked at ${sum.nearby} nearby network${sum.nearby === 1 ? '' : 's'} and ${sum.devices} device${sum.devices === 1 ? '' : 's'} on this Wi-Fi.`;
  $('found').hidden = false;
  $('foundTitle').textContent = sum.flagged.length
    ? `${sum.flagged.length} worth a closer look`
    : 'Nothing found in what we checked.';
  $('foundList').innerHTML = sum.flagged
    .map((f) => `<li><b>${esc(f.label)}</b><span class="hint">${esc(f.detail)}</span></li>`).join('');
  if (sum.flagged.length) navigator.vibrate?.(30);
  $('runBtn').disabled = false;
  $('runBtn').textContent = 'Check again';
}

$('runBtn').addEventListener('click', run);
