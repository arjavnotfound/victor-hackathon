// Network check screen. Only works inside the Android app, where our
// NetworkCheck plugin can list Wi-Fi networks and local devices.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { summarize, ALL_PORTS } from './network.js';
import { markCheck } from './store.js';
import { icon } from './icons.js';
import { $, esc, initPage, animateNumber, stagger } from './ui.js';

initPage('Network');
const NetworkCheck = registerPlugin('NetworkCheck');
const native = Capacitor.isNativePlatform();
$('webOnly').hidden = native;
$('getApp').hidden = native;
$('appOnly').hidden = !native;
$('runBtn').hidden = !native;

// The whole check takes about 15 s; the bar moves on its own between steps.
let barTimer = null;
function progress(text, from, to, ms) {
  $('status').textContent = text;
  clearInterval(barTimer);
  const t0 = performance.now();
  barTimer = setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    $('bar').style.width = `${from + (to - from) * k}%`;
  }, 200);
}

async function run() {
  $('runBtn').disabled = true;
  $('idle').hidden = true;
  $('progressBox').hidden = false;
  let nearby = [], devices = [];
  const notes = [];

  progress('Looking at Wi-Fi networks around you…', 0, 30, 4500);
  try {
    const r = await NetworkCheck.nearby();
    nearby = r.networks;
    if (!r.locationOn) notes.push('Location is off, so Android may hide nearby networks. Turn it on and check again.');
  } catch (e) {
    notes.push(e.message);
  }

  progress('Looking at devices on this Wi-Fi…', 30, 98, 10000);
  try {
    const r = await NetworkCheck.lan({ ports: ALL_PORTS });
    devices = r.devices;
  } catch (e) {
    notes.push(e.message);
  }
  clearInterval(barTimer);

  const sum = summarize({ nearby, devices });
  markCheck('network', sum);
  $('progressBox').hidden = true;
  $('found').hidden = false;
  animateNumber($('nNearby'), sum.nearby);
  animateNumber($('nDevices'), sum.devices);
  $('foundTitle').textContent = sum.flagged.length ? `${sum.flagged.length} worth a closer look` : 'Nothing found in what we checked';
  $('foundList').hidden = !sum.flagged.length;
  $('foundList').innerHTML = sum.flagged.map((f) => `
    <li><div class="row" style="align-items:flex-start">
      <span class="ico warn">${icon(f.kind === 'nearby' ? 'wifi' : 'phone')}</span>
      <span class="row-text"><span>${esc(f.label)}</span>
        <ul class="why">${f.reasons.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></span>
    </div></li>`).join('');
  stagger($('foundList'));
  $('notes').textContent = notes.join(' ');
  if (sum.flagged.length) navigator.vibrate?.(30);
  $('runBtn').disabled = false;
  $('runBtn').textContent = 'Check again';
}

$('runBtn').addEventListener('click', run);
