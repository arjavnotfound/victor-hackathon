// "Find it": follow one nearby network's signal to the device sending it.
// Only in the Android app (or with ?demo=1 on a laptop).

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { smooth, fill, word, pulseGap, isSlow } from './finder.js';
import { $, initPage, isDemo } from './ui.js';

initPage('Find it');
const q = new URLSearchParams(location.search);
const bssid = q.get('bssid') || '';
$('ssid').textContent = q.get('ssid') || 'this network';

// Demo: the signal rises as if walking towards the camera, with noise.
const t0 = performance.now();
const demoSignal = async () => {
  const s = (performance.now() - t0) / 1000;
  return { level: Math.round(-80 + Math.min(40, s * 2.5) + (Math.random() - 0.5) * 6), age: 500 };
};
const plugin = isDemo ? { signal: demoSignal } : registerPlugin('NetworkCheck');

const levels = [];
let ref = null, slowCount = 0, latest = null;

async function poll() {
  try {
    const r = await plugin.signal({ bssid });
    if (typeof r.level === 'number') levels.push(r.level);
    // Several old readings in a row: Android is throttling scans.
    slowCount = isSlow(r.age) ? slowCount + 1 : 0;
    $('slow').hidden = slowCount < 3;
  } catch (e) {
    $('word').textContent = 'Cannot read';
    $('dbm').textContent = e.message;
    return setTimeout(poll, 3000);
  }
  latest = smooth(levels);
  const w = word(latest, ref);
  ref = w.ref;
  $('word').textContent = w.word;
  $('dbm').textContent = latest == null ? 'Not heard yet' : `${Math.round(latest)} dBm`;
  $('arc').style.strokeDashoffset = String(314.16 * (1 - (latest == null ? 0 : fill(latest))));
  $('dial').classList.toggle('close', w.word === 'Very close');
  setTimeout(poll, 1000);
}

// Vibration runs on its own clock so the rhythm stays even between readings.
async function buzz() {
  if (latest != null && $('vibrate').checked) {
    if (Capacitor.isNativePlatform()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    else navigator.vibrate?.(40);
  }
  setTimeout(buzz, latest == null ? 1000 : pulseGap(latest));
}

if (!bssid && !isDemo) {
  $('word').textContent = 'No network';
  $('dbm').textContent = 'Open this from the network check.';
} else {
  poll();
  buzz();
}
