// Minimal pcap / pcapng reader for Wi-Fi captures (no DOM, works in node).
//
// We only need the outside of each packet: when it was sent, how big it was,
// who sent it and how strong the signal was. We never look at the content
// (on a protected network it is encrypted anyway).
//
// Supported link types:
//   127 = radiotap + 802.11 (Mac Wireless Diagnostics Sniffer, monitor mode)
//   105 = raw 802.11
//     1 = Ethernet (normal-mode capture: only your own network, no signal strength)

export const LINK_ETHERNET = 1, LINK_80211 = 105, LINK_RADIOTAP = 127;

// Frame kinds
export const KIND_DATA = 1, KIND_MGMT = 2, KIND_CTRL = 3, KIND_ETH = 4;

/**
 * Parse a capture file. Returns column arrays (fast and small for 100k+ frames):
 *   t[i]    time in seconds (Unix epoch, float)
 *   len[i]  frame size in bytes as sent on air (original length)
 *   src[i]  index into `macs` (transmitter address), or -1
 *   kind[i] KIND_*
 *   rssi[i] signal strength in dBm, or NaN
 *   freq[i] channel frequency in MHz, or 0
 *   payload[i] 1 if it is a data frame that carries data (not a "null" keep-alive)
 */
export function parseCapture(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  const out = { t: [], len: [], src: [], kind: [], rssi: [], freq: [], payload: [], macs: [], format: '', linkTypes: new Set() };
  const macIndex = new Map();
  const add = (time, origLen, linkType, off, capLen) => {
    out.linkTypes.add(linkType);
    decodeFrame(dv, off, capLen, origLen, linkType, time, out, macIndex);
  };
  if (dv.byteLength < 24) throw new Error('File is too small to be a capture.');
  const m = dv.getUint32(0, false);
  if (m === 0x0a0d0d0a) readPcapng(dv, add, out);
  else readPcap(dv, add, out);
  return out;
}

function readPcap(dv, add, out) {
  // Magic tells us byte order and whether timestamps are micro- or nanoseconds.
  const mBE = dv.getUint32(0, false);
  let le, nano;
  if (mBE === 0xa1b2c3d4) { le = false; nano = false; }
  else if (mBE === 0xd4c3b2a1) { le = true; nano = false; }
  else if (mBE === 0xa1b23c4d) { le = false; nano = true; }
  else if (mBE === 0x4d3cb2a1) { le = true; nano = true; }
  else throw new Error('Not a pcap or pcapng file.');
  out.format = 'pcap';
  const linkType = dv.getUint32(20, le) & 0x0fffffff;
  let off = 24;
  while (off + 16 <= dv.byteLength) {
    const sec = dv.getUint32(off, le), frac = dv.getUint32(off + 4, le);
    const capLen = dv.getUint32(off + 8, le), origLen = dv.getUint32(off + 12, le);
    off += 16;
    if (off + capLen > dv.byteLength) break; // last frame cut short when capture stopped
    add(sec + frac / (nano ? 1e9 : 1e6), origLen, linkType, off, capLen);
    off += capLen;
  }
}

function readPcapng(dv, add, out) {
  out.format = 'pcapng';
  let le = true;
  let ifaces = [];
  let off = 0;
  while (off + 12 <= dv.byteLength) {
    const typeBE = dv.getUint32(off, false);
    if (typeBE === 0x0a0d0d0a) {
      // Section header: byte-order magic decides endianness for this section.
      le = dv.getUint32(off + 8, true) === 0x1a2b3c4d;
      ifaces = [];
    }
    const type = dv.getUint32(off, le);
    const blockLen = dv.getUint32(off + 4, le);
    if (blockLen < 12 || off + blockLen > dv.byteLength) break;
    const body = off + 8;
    if (type === 1) {
      // Interface description: link type + timestamp resolution option.
      const linkType = dv.getUint16(body, le);
      let res = 1e-6;
      let o = body + 8;
      while (o + 4 <= off + blockLen - 4) {
        const code = dv.getUint16(o, le), len = dv.getUint16(o + 2, le);
        if (code === 0) break;
        if (code === 9 && len >= 1) {
          const v = dv.getUint8(o + 4);
          res = v & 0x80 ? 2 ** -(v & 0x7f) : 10 ** -v;
        }
        o += 4 + Math.ceil(len / 4) * 4;
      }
      ifaces.push({ linkType, res });
    } else if (type === 6 || type === 2) {
      // Enhanced packet block (6) or old packet block (2).
      const id = type === 6 ? dv.getUint32(body, le) : dv.getUint16(body, le);
      const hi = dv.getUint32(body + 4, le), lo = dv.getUint32(body + 8, le);
      const capLen = dv.getUint32(body + 12, le), origLen = dv.getUint32(body + 16, le);
      const iface = ifaces[id] || { linkType: LINK_RADIOTAP, res: 1e-6 };
      if (body + 20 + capLen <= dv.byteLength) {
        add((hi * 4294967296 + lo) * iface.res, origLen, iface.linkType, body + 20, capLen);
      }
    }
    off += blockLen;
  }
}

function macAt(dv, o) {
  let s = '';
  for (let i = 0; i < 6; i++) s += (i ? ':' : '') + dv.getUint8(o + i).toString(16).padStart(2, '0');
  return s;
}

function decodeFrame(dv, off, capLen, origLen, linkType, time, out, macIndex) {
  let rssi = NaN, freq = 0, wifiOff = off, wifiLen = origLen;
  if (linkType === LINK_ETHERNET) {
    if (capLen < 14) return;
    push(out, macIndex, time, origLen, macAt(dv, off + 6), KIND_ETH, NaN, 0, 1);
    return;
  }
  if (linkType === LINK_RADIOTAP) {
    if (capLen < 8) return;
    const rt = readRadiotap(dv, off);
    rssi = rt.rssi; freq = rt.freq;
    wifiOff = off + rt.len;
    wifiLen = origLen - rt.len;
  } else if (linkType !== LINK_80211) {
    return; // unsupported link type
  }
  if (wifiOff + 2 > off + capLen) return;
  const fc = dv.getUint8(wifiOff);
  const type = (fc >> 2) & 3, subtype = fc >> 4;
  const kind = type === 0 ? KIND_MGMT : type === 1 ? KIND_CTRL : type === 2 ? KIND_DATA : 0;
  if (!kind) return;
  // Address 2 (transmitter) sits at byte 10. Short control frames (ACK, CTS) have none.
  let src = null;
  if (wifiOff + 16 <= off + capLen && !(kind === KIND_CTRL && (subtype === 12 || subtype === 13))) {
    src = macAt(dv, wifiOff + 10);
  }
  // Data subtypes with bit 2 set are "null" frames: keep-alives with no data.
  const payload = kind === KIND_DATA && (subtype & 0x4) === 0 ? 1 : 0;
  push(out, macIndex, time, wifiLen, src, kind, rssi, freq, payload);
}

function push(out, macIndex, time, len, mac, kind, rssi, freq, payload) {
  let idx = -1;
  if (mac) {
    idx = macIndex.get(mac);
    if (idx === undefined) { idx = out.macs.length; out.macs.push(mac); macIndex.set(mac, idx); }
  }
  out.t.push(time); out.len.push(len); out.src.push(idx); out.kind.push(kind);
  out.rssi.push(rssi); out.freq.push(freq); out.payload.push(payload);
}

/**
 * Radiotap header (always little-endian). A bitmask says which fields follow;
 * each field is aligned to its own size from the start of the header.
 * We read: Channel (bit 3) and antenna signal in dBm (bit 5).
 */
export function readRadiotap(dv, off) {
  const len = dv.getUint16(off + 2, true);
  const present = dv.getUint32(off + 4, true);
  let p = off + 8;
  let word = present;
  while (word & 0x80000000) { word = dv.getUint32(p, true); p += 4; } // extra bitmask words
  // [bit, size, alignment] for the standard fields up to bit 5
  const fields = [[0, 8, 8], [1, 1, 1], [2, 1, 1], [3, 4, 2], [4, 2, 1], [5, 1, 1]];
  let rssi = NaN, freq = 0;
  for (const [bit, size, align] of fields) {
    if (!(present & (1 << bit))) continue;
    const rel = p - off;
    p = off + Math.ceil(rel / align) * align;
    if (p + size > off + len) break;
    if (bit === 3) freq = dv.getUint16(p, true);
    if (bit === 5) rssi = dv.getInt8(p);
    p += size;
  }
  return { len, rssi, freq };
}

/** Channel number from frequency in MHz. */
export function freqToChannel(f) {
  if (f === 2484) return 14;
  if (f >= 2412 && f <= 2472) return (f - 2407) / 5;
  if (f >= 5000 && f <= 5900) return (f - 5000) / 5;
  if (f >= 5955 && f <= 7115) return (f - 5950) / 5;
  return 0;
}
