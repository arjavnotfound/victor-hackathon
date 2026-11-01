// Network check screen. Only works inside the Android app, where our
// NetworkCheck plugin can list Wi-Fi networks and local devices.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { summarize, ALL_PORTS } from './network.js';
import { markCheck } from './store.js';
import { icon } from './icons.js';
import { $, esc, initPage, animateNumber, stagger, isDemo } from './ui.js';
import { demoPlugin } from './net-demo.js';

initPage('Network');
const NetworkCheck = isDemo ? demoPlugin : registerPlugin('NetworkCheck');
const native = Capacitor.isNativePlatform() || isDemo;
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

  // Both scans run at the same time; the Android side sends a line for each
  // step of the device scan, so the user sees what it is doing.
  progress('Looking at Wi-Fi networks and devices around you…', 0, 95, 14000);
  const sub = await NetworkCheck.addListener('progress', (e) => { $('status').textContent = e.text; });
  const [near, lan] = await Promise.allSettled([NetworkCheck.nearby(), NetworkCheck.lan({ ports: ALL_PORTS })]);
  sub.remove();
  if (near.status === 'fulfilled') {
    nearby = near.value.networks;
    if (!near.value.locationOn) notes.push('Location is off, so Android may hide nearby networks. Turn it on and check again.');
  } else notes.push(near.reason.message);
  if (lan.status === 'fulfilled') devices = lan.value.devices;
  else notes.push(lan.reason.message);
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
