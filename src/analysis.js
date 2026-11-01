// Wi-Fi challenge analysis (no DOM, works in node and in the Web Worker).
//
// Physics: a streaming camera compresses video. Compression works by sending
// only what changed since the last frame. When the scene is still, there is
// little to send. When the screen in front of it flickers, almost every pixel
// changes in every frame, so the camera has to send much more data. The
// camera cannot avoid this: it is how video compression works.
//
// So if we flicker the screen in a secret pattern (bit 1 = flicker, bit 0 =
// steady), the camera's Wi-Fi traffic goes up and down in that same pattern.
// Other devices do not see the screen, so their traffic does not follow it.
//
// Steps per device:
//   1. bytes sent per 100 ms bin
//   2. clip keyframe spikes (big full pictures sent every few seconds anyway)
//   3. sum the bytes inside each bit (2 s)
//   4. normalised cross-correlation with the code, at many small time offsets
//   5. p-value: how often do 200 random codes score as well?

import { KIND_DATA, KIND_ETH, freqToChannel } from './pcap.js';
import { makeCode, seeded } from './code.js';
import { lookupVendor } from './oui.js';

export const DEFAULTS = {
  bitMs: 2000,
  binMs: 100,
  maxShiftMs: 4000,  // how far we search for clock difference + camera delay
  nRandom: 200,      // random codes for the p-value
  minFrames: 30,     // ignore devices that barely talk
  maxDevices: 40,    // only the busiest devices are scored
};

/** Pearson correlation of two equal-length arrays. Returns 0 if one is flat. */
export function pearson(a, b) {
  const n = a.length;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Median of an array (copy sorted). */
export function median(arr) {
  const s = Float64Array.from(arr).sort();
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Keyframe spike filter. Most cameras send a complete picture (a "keyframe")
 * every 1-4 seconds whatever the scene does. Those are big spikes that have
 * nothing to do with our code. Robust limit: median + k·MAD (median absolute
 * deviation, scaled by 1.4826 so it matches a standard deviation for normal
 * noise). A bin above the limit is replaced by the median of its neighbours
 * (±5 bins = ±0.5 s), so the keyframe disappears and the normal level of that
 * moment stays. Just cutting it to the limit would leave a regular bump that
 * can beat against the 2 s bits and look like a pattern.
 */
export function clipSpikes(bins, k = 3, half = 5) {
  const med = median(bins);
  const mad = 1.4826 * median(Array.from(bins, (v) => Math.abs(v - med)));
  const out = Float64Array.from(bins);
  if (mad === 0) return out;
  const cap = med + k * mad;
  for (let i = 0; i < bins.length; i++) {
    if (bins[i] <= cap) continue;
    const near = [];
    for (let j = Math.max(0, i - half); j <= Math.min(bins.length - 1, i + half); j++) {
      if (bins[j] <= cap) near.push(bins[j]);
    }
    out[i] = near.length ? median(near) : cap;
  }
  return out;
}

/**
 * Best correlation over all time offsets.
 * `prefix` = running sum of bins, so the sum of any bit is 2 lookups.
 * Offsets go from 0 to nOffsets-1 bins.
 */
export function bestOverOffsets(prefix, code, binsPerBit, nOffsets) {
  const n = code.length;
  const sums = new Float64Array(n);
  let best = -2, bestOff = 0;
  for (let k = 0; k < nOffsets; k++) {
    for (let i = 0; i < n; i++) {
      const a = k + i * binsPerBit;
      sums[i] = prefix[a + binsPerBit] - prefix[a];
    }
    const r = pearson(sums, code);
    if (r > best) { best = r; bestOff = k; }
  }
  return { r: best, off: bestOff };
}

function bitSumsAt(prefix, n, binsPerBit, k) {
  return Array.from({ length: n }, (_, i) => prefix[k + (i + 1) * binsPerBit] - prefix[k + i * binsPerBit]);
}

/**
 * Score every busy device in a parsed capture against the code.
 * opts: { code, startMs (epoch ms, or null to search the whole capture), bitMs, ... }
 */
export function analyzeCapture(cap, opts) {
  const o = { ...DEFAULTS, ...opts };
  const code = o.code;
  const n = code.length;
  const binS = o.binMs / 1000;
  const binsPerBit = Math.round(o.bitMs / o.binMs);
  const total = cap.t.length;
  if (!total) throw new Error('The capture has no frames.');

  let tFirst = Infinity, tLast = -Infinity;
  for (let i = 0; i < total; i++) { if (cap.t[i] < tFirst) tFirst = cap.t[i]; if (cap.t[i] > tLast) tLast = cap.t[i]; }

  // Time window: the challenge start ± maxShift. If the start is unknown or
  // outside the capture, slide over the whole capture instead.
  const codeS = (n * o.bitMs) / 1000;
  let winStart, nOffsets, mode;
  const start = o.startMs != null ? o.startMs / 1000 : null;
  if (start != null && start + codeS > tFirst && start < tLast) {
    winStart = start - o.maxShiftMs / 1000;
    nOffsets = Math.round((2 * o.maxShiftMs) / o.binMs) + 1;
    mode = 'start time';
  } else {
    winStart = tFirst;
    nOffsets = Math.max(1, Math.floor((tLast - tFirst - codeS) / binS) + 1);
    mode = 'whole capture';
  }
  const nBins = nOffsets - 1 + n * binsPerBit;

  // 1. Bytes per device per 100 ms bin (data frames that carry data).
  const perDev = new Map();
  const frames = new Map();
  const rssiPts = new Map();
  const chanCount = new Map();
  const devFreq = new Map(); // the channel each device was heard on (for the Wi-Fi map)
  for (let i = 0; i < total; i++) {
    if (cap.freq[i]) {
      const ch = freqToChannel(cap.freq[i]);
      chanCount.set(ch, (chanCount.get(ch) || 0) + 1);
    }
    const s = cap.src[i];
    if (s < 0) continue;
    if (cap.freq[i]) devFreq.set(s, cap.freq[i]);
    const b = Math.floor((cap.t[i] - winStart) / binS);
    if (b < 0 || b >= nBins) continue;
    if (!Number.isNaN(cap.rssi[i])) {
      if (!rssiPts.has(s)) rssiPts.set(s, []);
      rssiPts.get(s).push([cap.t[i] - winStart, cap.rssi[i]]);
    }
    // Count data frames that carry data (and Ethernet frames for normal-mode captures).
    const counts = (cap.kind[i] === KIND_DATA && cap.payload[i]) || cap.kind[i] === KIND_ETH;
    if (!counts) continue;
    let bins = perDev.get(s);
    if (!bins) { bins = new Float64Array(nBins); perDev.set(s, bins); frames.set(s, 0); }
    bins[b] += cap.len[i];
    frames.set(s, frames.get(s) + 1);
  }

  // Only the busiest devices: a camera streaming video is never quiet.
  const candidates = [...perDev.keys()]
    .filter((s) => frames.get(s) >= o.minFrames)
    .sort((a, b) => sum(perDev.get(b)) - sum(perDev.get(a)))
    .slice(0, o.maxDevices);

  // The same 200 random codes are used for every device (fair comparison).
  const rand = seeded(o.seed ?? 12345);
  const randomCodes = Array.from({ length: o.nRandom }, () => makeCode(n, rand));

  const devices = candidates.map((s) => {
    const raw = perDev.get(s);
    // 2. clip keyframe spikes
    const bins = clipSpikes(raw);
    const prefix = new Float64Array(nBins + 1);
    for (let i = 0; i < nBins; i++) prefix[i + 1] = prefix[i] + bins[i];
    // 3 + 4. bit sums + correlation, best over offsets
    const best = bestOverOffsets(prefix, code, binsPerBit, nOffsets);
    // 5. same thing for random codes the camera never saw
    let asGood = 0, nullSum = 0;
    for (const rc of randomCodes) {
      const r = bestOverOffsets(prefix, rc, binsPerBit, nOffsets).r;
      nullSum += r;
      if (r >= best.r) asGood++;
    }
    const p = (asGood + 1) / (o.nRandom + 1);
    // Chance-corrected score: 0 = no better than a random code, 1 = perfect.
    // (Trying many offsets always finds some correlation by luck; this removes it.)
    const nullMean = nullSum / o.nRandom;
    const score = Math.max(0, (best.r - nullMean) / (1 - nullMean));
    const mac = cap.macs[s];
    const info = lookupVendor(mac);
    const pts = rssiPts.get(s) || [];
    return {
      mac, ...info,
      frames: frames.get(s),
      bytes: sum(raw),
      r: best.r,
      score,
      p,
      offsetMs: Math.round(best.off * o.binMs - (mode === 'start time' ? o.maxShiftMs : 0)),
      bitSums: bitSumsAt(prefix, n, binsPerBit, best.off),
      bins: Array.from(bins),
      rawBins: Array.from(raw),
      bestOff: best.off,
      rssi: thin(pts, 400),
      meanRssi: pts.length ? pts.reduce((a, q) => a + q[1], 0) / pts.length : null,
      freq: devFreq.get(s) || 0,
    };
  });

  devices.sort((a, b) => b.score - a.score || a.p - b.p);
  for (const d of devices) d.verdict = verdict(d);

  const channels = [...chanCount.entries()].sort((a, b) => b[1] - a[1]).map(([ch, count]) => ({ ch, count }));
  return {
    mode, winStart, binsPerBit, binMs: o.binMs, bitMs: o.bitMs, code,
    captureStart: tFirst, captureEnd: tLast, totalFrames: total,
    transmitters: cap.macs.length, channels, devices,
  };
}

/**
 * Plain-language verdict thresholds.
 * Tuned on 220 simulated rooms (880 decoy devices): a camera facing the
 * screen scored at least 0.98; a decoy reached 0.8 by luck about 1 time in
 * 300. A second run with a new code makes that about 1 in 100,000, which is
 * why the page asks for a second run before calling it.
 */
export function verdict(d) {
  if (d.score >= 0.8 && d.p <= 0.02) return 'camera';
  if (d.score >= 0.5 && d.p <= 0.05) return 'maybe';
  return 'no';
}

/**
 * Quick overview of a capture, no code needed: who is talking, how much,
 * and how strong their signal is. Shown even when we can't run the test.
 */
export function summarizeCapture(cap) {
  const n = cap.t.length;
  const per = new Map();
  const chans = new Map();
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < n; i++) {
    if (cap.t[i] < t0) t0 = cap.t[i];
    if (cap.t[i] > t1) t1 = cap.t[i];
    if (cap.freq[i]) { const ch = freqToChannel(cap.freq[i]); chans.set(ch, (chans.get(ch) || 0) + 1); }
    const s = cap.src[i];
    if (s < 0) continue;
    let d = per.get(s);
    if (!d) { d = { frames: 0, data: 0, bytes: 0, rssiSum: 0, rssiN: 0 }; per.set(s, d); }
    d.frames++; d.bytes += cap.len[i];
    if ((cap.kind[i] === KIND_DATA && cap.payload[i]) || cap.kind[i] === KIND_ETH) d.data++;
    if (!Number.isNaN(cap.rssi[i])) { d.rssiSum += cap.rssi[i]; d.rssiN++; }
  }
  const top = [...per.entries()]
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 10)
    .map(([s, d]) => ({
      mac: cap.macs[s], ...lookupVendor(cap.macs[s]), frames: d.frames, dataFrames: d.data, bytes: d.bytes,
      meanRssi: d.rssiN ? d.rssiSum / d.rssiN : null,
    }));
  return {
    totalFrames: n, start: t0, end: t1, transmitters: cap.macs.length,
    channels: [...chans.entries()].sort((a, b) => b[1] - a[1]).map(([ch]) => ch),
    streaming: top.filter((d) => d.dataFrames >= DEFAULTS.minFrames).length,
    top,
  };
}

function sum(a) { let s = 0; for (const v of a) s += v; return s; }
function thin(pts, max) {
  if (pts.length <= max) return pts;
  const step = pts.length / max;
  return Array.from({ length: max }, (_, i) => pts[Math.floor(i * step)]);
}
