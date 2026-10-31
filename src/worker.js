// Web Worker: parsing and scoring can take a few seconds on a big capture,
// so it runs here and the page stays smooth.

import { parseCapture } from './pcap.js';
import { analyzeCapture } from './analysis.js';
import { makeDemoCapture } from './sim.js';

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    let buffer = msg.buffer;
    if (msg.type === 'demo') {
      self.postMessage({ type: 'progress', text: 'Building a simulated capture…' });
      buffer = makeDemoCapture({ code: msg.opts.code, startMs: msg.opts.startMs, seed: msg.seed }).buffer;
    }
    self.postMessage({ type: 'progress', text: 'Fingerprinting the capture file (SHA-256)…' });
    const hash = await sha256Hex(buffer);
    self.postMessage({ type: 'progress', text: 'Reading packets…' });
    const cap = parseCapture(buffer);
    self.postMessage({ type: 'progress', text: `Scoring ${cap.macs.length} transmitters against the code…` });
    const result = analyzeCapture(cap, msg.opts);
    result.fileHash = hash;
    result.fileBytes = buffer.byteLength;
    result.format = cap.format;
    result.linkTypes = [...cap.linkTypes];
    self.postMessage({ type: 'done', result });
  } catch (err) {
    self.postMessage({ type: 'error', text: err.message || String(err) });
  }
};

export async function sha256Hex(buffer) {
  const d = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
