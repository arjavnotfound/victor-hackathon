// Wi-Fi map maths (no DOM, testable in node).
//
// Every Wi-Fi source we know about becomes one point in a 3D space:
//   across:  its frequency (2.4 GHz channels on the left, 5 GHz on the right)
//   up:      how much it uploads (log scale, so a smart plug and a video
//            stream both fit on screen)
//   depth:   signal strength (strong = near you, weak = far back)
// and gets a colour from how its upload behaves:
//   safe        normal traffic: bursts, then quiet
//   unsure      one camera-like sign, or not enough to tell
//   suspicious  the upload pattern of a live video camera
//
// Why upload patterns: a camera that streams compressed video sends data all
// the time (it never goes quiet for long), and every 1 to 4 seconds it sends
// a much bigger burst, a full picture ("keyframe"), whatever the scene does.
// Phones, laptops and plugs send in bursts with long quiet gaps. The
// strongest sign of all is the flash test (analysis.js): its upload rising
// and falling with the screen flashes.

import { freqToChannel, KIND_DATA, KIND_ETH } from './pcap.js';
import { lookupVendor } from './oui.js';
import { nameReason } from './network.js';
import { median } from './analysis.js';

export const LEVELS = ['safe', 'unsure', 'suspicious'];

/** '2.4 GHz', '5 GHz' or '6 GHz' from a frequency in MHz. */
export function bandOf(freq) {
  if (freq >= 2400 && freq < 2500) return '2.4 GHz';
  if (freq >= 5000 && freq < 5925) return '5 GHz';
  if (freq >= 5925 && freq < 7200) return '6 GHz';
  return 'Unknown band';
}

/** Add 100 ms bins up to 1 s bins (bytes per second). */
export function perSecond(bins, binMs = 100) {
  const k = Math.max(1, Math.round(1000 / binMs));
  const out = [];
  for (let i = 0; i + k <= bins.length; i += k) {
    let s = 0;
    for (let j = i; j < i + k; j++) s += bins[j];
    out.push(s);
  }
  return out;
}

/**
 * Upload pattern from bytes per second.
 *   rate     mean bytes per second
 *   active   share of seconds with any upload (a stream is close to 1)
 *   bursts   big spikes (well above the usual level)
 *   period   median seconds between spikes, and `regular` when they are evenly spaced
 */
export function uploadPattern(sec) {
  const n = sec.length;
  if (!n) return { rate: 0, peak: 0, active: 0, bursts: 0, period: 0, regular: false };
  const rate = sec.reduce((a, b) => a + b, 0) / n;
  const peak = Math.max(...sec);
  const active = sec.filter((v) => v > 0).length / n;
  // A spike: more than twice the usual second, and clearly above zero.
  const med = median(sec);
  const spikes = [];
  sec.forEach((v, i) => { if (v > Math.max(2 * med, 0.2 * peak) && v > 0 && (i === 0 || sec[i - 1] <= v)) spikes.push(i); });
  const gaps = spikes.slice(1).map((s, i) => s - spikes[i]);
  const period = gaps.length ? median(gaps) : 0;
  const spread = gaps.length ? median(gaps.map((g) => Math.abs(g - period))) : Infinity;
  return { rate, peak, active, bursts: spikes.length, period, regular: gaps.length >= 3 && period <= 5 && spread <= 1 };
}

const kb = (b) => (b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB/s` : `${Math.max(0.1, b / 1e3).toFixed(b < 1e4 ? 1 : 0)} KB/s`);

/**
 * Safe, unsure or suspicious, with the reasons in plain words.
 * `src` = { name, mac, freq, rssi, sec (bytes per second, or null when the
 * traffic is not visible), verdict (flash test: 'camera' | 'maybe' | 'no' | undefined) }
 */
export function classify(src) {
  const reasons = [];
  let points = 0;
  const vendor = src.mac ? lookupVendor(src.mac) : { vendor: 'Unknown', camChip: false };
  if (src.verdict === 'camera') { points += 3; reasons.push('Its upload rose and fell with the screen flashes'); }
  if (src.verdict === 'maybe') { points += 1; reasons.push('Its upload partly followed the screen flashes'); }

  let steady = false;
  if (src.sec && src.sec.length) {
    const u = uploadPattern(src.sec);
    steady = u.active >= 0.9 && u.rate >= 20e3;
    if (steady) { points += 1; reasons.push(`Uploads all the time, about ${kb(u.rate)}, like live video`); }
    // Bursts every second are just a busy link; keyframes come every 2 to 5 s.
    if (u.regular && u.period >= 2 && u.rate >= 5e3) { points += 1; reasons.push(`Big bursts every ${u.period} s, like full video pictures`); }
    if (!steady && !u.regular) reasons.push(u.rate < 2e3 ? 'Sends very little' : 'Sends in bursts, then goes quiet, like a phone or laptop');
  } else {
    reasons.push('Its traffic is not visible from here, only its name and signal');
  }

  const name = nameReason(src.name || '');
  if (name) { points += 1; reasons.push(name); }
  // The chip maker alone means little (smart plugs use the same chips), so
  // it only counts on top of a steady upload.
  if (vendor.camChip) { points += steady ? 1 : 0; reasons.push(`Wi-Fi chip by ${vendor.vendor}, common in cheap cameras`); }

  // Suspicious needs the flash test, or a live-video upload plus one more sign.
  const level = src.verdict === 'camera' || points >= 3 ? 'suspicious' : points >= 1 ? 'unsure' : 'safe';
  return { level, reasons, vendor: vendor.vendor };
}

/**
 * Sources from a flash-test analysis (analysis.js result). Devices are kept
 * with their upload per second, so the map can replay it.
 */
export function fromCapture(result) {
  return result.devices.map((d) => {
    const sec = perSecond(d.rawBins, result.binMs);
    return {
      id: d.mac, name: d.vendor && d.vendor !== 'Unknown' ? d.vendor : d.mac, mac: d.mac, freq: d.freq || 0,
      rssi: d.meanRssi, sec, verdict: d.verdict, from: 'capture',
    };
  });
}

/**
 * Sources from a plain listen (no flash test): upload per second for every
 * transmitter that sent at least `minFrames` data frames, with its signal
 * and channel. Same idea as the flash test, minus the code.
 */
export function fromTraffic(cap, { minFrames = 30 } = {}) {
  const n = cap.t.length;
  if (!n) return [];
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < n; i++) { if (cap.t[i] < t0) t0 = cap.t[i]; if (cap.t[i] > t1) t1 = cap.t[i]; }
  const secs = Math.max(1, Math.ceil(t1 - t0));
  const per = new Map();
  for (let i = 0; i < n; i++) {
    const s = cap.src[i];
    if (s < 0) continue;
    let d = per.get(s);
    if (!d) { d = { sec: new Array(secs).fill(0), data: 0, rssi: 0, rn: 0, freq: 0 }; per.set(s, d); }
    if (!Number.isNaN(cap.rssi[i])) { d.rssi += cap.rssi[i]; d.rn++; }
    if (cap.freq[i]) d.freq = cap.freq[i];
    if ((cap.kind[i] === KIND_DATA && cap.payload[i]) || cap.kind[i] === KIND_ETH) {
      d.sec[Math.min(secs - 1, Math.floor(cap.t[i] - t0))] += cap.len[i];
      d.data++;
    }
  }
  return [...per.entries()].filter(([, d]) => d.data >= minFrames).map(([s, d]) => {
    const mac = cap.macs[s], v = lookupVendor(mac);
    return {
      id: mac, mac, name: v.vendor !== 'Unknown' ? v.vendor : mac, freq: d.freq,
      rssi: d.rn ? d.rssi / d.rn : null, sec: d.sec, from: 'capture',
    };
  });
}

/** Sources from the Android nearby scan: name, frequency and signal only. */
export function fromNearby(networks) {
  return networks.map((n) => ({
    id: n.bssid, name: n.ssid || 'Hidden network', mac: n.bssid, bssid: n.bssid,
    freq: n.frequency || 0, rssi: n.level, sec: null, from: 'nearby',
  }));
}

/** Classify every source and add its channel and band. */
export function buildMap(sources) {
  return sources.map((s) => ({ ...s, ...classify(s), channel: freqToChannel(s.freq), band: bandOf(s.freq) }));
}

/** How many sources of each colour. */
export function countLevels(map) {
  const c = { safe: 0, unsure: 0, suspicious: 0 };
  for (const s of map) c[s.level]++;
  return c;
}

/**
 * Position in the 3D space (scene units). The two bands sit side by side
 * with a gap, each stretched to its own width, so channels stay readable.
 * A small sideways nudge from the address keeps sources on one channel apart.
 */
export function placeOf(s) {
  const nudge = s.mac ? ((parseInt(s.mac.replace(/[^0-9a-f]/gi, '').slice(-4), 16) % 100) / 100 - 0.5) * 1.2 : 0;
  let x;
  if (s.freq >= 2400 && s.freq < 2500) x = -7 + ((s.freq - 2412) / 60) * 5;
  else if (s.freq >= 5000 && s.freq < 5925) x = 0 + ((s.freq - 5180) / 645) * 7;
  else if (s.freq >= 5925) x = 8.5 + ((s.freq - 5955) / 1160) * 3;
  else x = -9;
  const rate = s.sec?.length ? s.sec.reduce((a, b) => a + b, 0) / s.sec.length : 0;
  const y = rate > 0 ? Math.max(0.2, Math.min(6, Math.log10(rate) - 1.5)) : 0.15;
  const z = s.rssi == null || Number.isNaN(s.rssi) ? 0 : Math.max(-4, Math.min(4, (s.rssi + 65) / 7));
  return [x + nudge, y, z];
}
