// Demo capture simulator (works in node and in the browser).
//
// Makes a realistic radiotap pcap, like the Mac Sniffer writes, with:
//   - one hidden camera that faces the flickering screen. Its video traffic
//     goes up during "1" bits (after a short encoder + network delay), and it
//     sends a big keyframe every ~2.5 s whatever happens.
//   - decoys that do NOT see the screen: a second camera pointed elsewhere,
//     a phone on a video call, a laptop doing backups, a smart plug, and the
//     access point's beacons.
// Frames are stored without their encrypted body (only headers), with the
// real on-air size in the "original length" field. The analyzer only uses
// sizes and times, so the result is the same and the file stays small.

import { seeded } from './code.js';

export const DEMO_DEVICES = {
  camera: '08:3a:8d:4c:21:7e',  // Espressif prefix: common Wi-Fi chip in cheap cameras
  camera2: '10:5a:17:9b:02:c4', // a second camera, not facing the screen
  phone: '2a:41:9c:e3:57:10',   // random (privacy) address, video call
  laptop: '00:e0:4c:68:11:aa',  // backups in bursts
  plug: '18:69:d8:35:70:0f',    // smart plug heartbeats
  ap: 'b8:27:eb:00:00:01',      // access point
};

/**
 * @param {object} o { code, startMs, bitMs=2000, seed=1, leadS=6, tailS=6, lagMs=600 }
 * @returns {Uint8Array} pcap file bytes
 */
export function makeDemoCapture(o) {
  const { code, startMs, bitMs = 2000, seed = 1, leadS = 6, tailS = 6, lagMs = 600 } = o;
  const rand = seeded(seed);
  const gauss = () => { // Box-Muller: normal noise for signal strength
    const u = Math.max(1e-9, rand()), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const start = startMs / 1000;
  const t0 = start - leadS;
  const t1 = start + (code.length * bitMs) / 1000 + tailS;
  const frames = []; // [time, mac, origLen, rssi, isData]

  // Is the screen flickering at time t, as seen by the camera (with delay)?
  const flickerAt = (t) => {
    const i = Math.floor(((t - lagMs / 1000) - start) / (bitMs / 1000));
    return i >= 0 && i < code.length && code[i] === 1;
  };

  // Streaming cameras: frames per 100 ms depends on how much the scene changes.
  const camera = (mac, sees, rssi, phase) => {
    for (let t = t0; t < t1; t += 0.1) {
      const busy = sees && flickerAt(t);
      const n = Math.max(1, Math.round((busy ? 15 : 5) + gauss() * 2));
      for (let k = 0; k < n; k++) frames.push([t + rand() * 0.1, mac, 600 + Math.floor(rand() * 900), rssi + gauss() * 2.5, 1]);
      // Keyframe: a full picture every 2.5 s, a big burst of full-size frames.
      if (((t - t0 + phase) % 2.5) < 0.1) {
        for (let k = 0; k < 45; k++) frames.push([t + rand() * 0.1, mac, 1500, rssi + gauss() * 2.5, 1]);
      }
    }
  };
  camera(DEMO_DEVICES.camera, true, -46, 0.3);
  camera(DEMO_DEVICES.camera2, false, -63, 1.1);

  // Phone on a video call: rate wanders up and down on its own.
  let rate = 8;
  for (let t = t0; t < t1; t += 0.1) {
    rate = Math.min(20, Math.max(2, rate + gauss() * 1.5));
    const n = Math.round(rate);
    for (let k = 0; k < n; k++) frames.push([t + rand() * 0.1, DEMO_DEVICES.phone, 300 + Math.floor(rand() * 1100), -55 + gauss() * 4, 1]);
  }
  // Laptop: a 3 s burst of uploads every 9 s.
  for (let t = t0; t < t1; t += 0.1) {
    const n = ((t - t0) % 9) < 3 ? 18 : 1;
    for (let k = 0; k < n; k++) frames.push([t + rand() * 0.1, DEMO_DEVICES.laptop, 1400, -60 + gauss() * 3, 1]);
  }
  // Smart plug: a small heartbeat every second.
  for (let t = t0; t < t1; t += 1) for (let k = 0; k < 4; k++) frames.push([t + rand() * 0.05, DEMO_DEVICES.plug, 120, -70 + gauss() * 3, 1]);
  // Access point beacons every 102.4 ms (management frames, not data).
  for (let t = t0; t < t1; t += 0.1024) frames.push([t, DEMO_DEVICES.ap, 280, -40 + gauss(), 0]);

  frames.sort((a, b) => a[0] - b[0]);
  return writePcap(frames);
}

// pcap with radiotap: header present bits = Flags(1), Channel(3), dBm signal(5)
const RT_LEN = 16;
const WIFI_HDR = 26; // 24-byte 802.11 header + 2-byte QoS control

function writePcap(frames) {
  const recLen = 16 + RT_LEN + WIFI_HDR;
  const buf = new ArrayBuffer(24 + frames.length * recLen);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint32(0, 0xa1b2c3d4, true); // little-endian, microseconds
  dv.setUint16(4, 2, true); dv.setUint16(6, 4, true);
  dv.setUint32(16, 65535, true);
  dv.setUint32(20, 127, true); // LINKTYPE_IEEE802_11_RADIOTAP
  let o = 24;
  const ap = macBytes(DEMO_DEVICES.ap);
  for (const [t, mac, len, rssi, isData] of frames) {
    const sec = Math.floor(t), usec = Math.round((t - sec) * 1e6);
    dv.setUint32(o, sec + (usec >= 1e6 ? 1 : 0), true);
    dv.setUint32(o + 4, usec % 1e6, true);
    dv.setUint32(o + 8, RT_LEN + WIFI_HDR, true);       // bytes stored
    dv.setUint32(o + 12, RT_LEN + Math.max(len, WIFI_HDR), true); // real size on air
    o += 16;
    // radiotap
    u8[o] = 0; u8[o + 1] = 0;
    dv.setUint16(o + 2, RT_LEN, true);
    dv.setUint32(o + 4, (1 << 1) | (1 << 3) | (1 << 5), true);
    u8[o + 8] = 0;                     // flags
    dv.setUint16(o + 10, 2437, true);  // channel 6
    dv.setUint16(o + 12, 0x00a0, true);
    dv.setInt8(o + 14, Math.round(Math.max(-95, Math.min(-20, rssi))));
    o += RT_LEN;
    // 802.11 header
    u8[o] = isData ? 0x88 : 0x80;       // QoS data / beacon
    u8[o + 1] = isData ? 0x41 : 0x00;   // to-AP + protected
    const src = macBytes(mac);
    u8.set(isData ? ap : [255, 255, 255, 255, 255, 255], o + 4); // addr1
    u8.set(src, o + 10);                                          // addr2 (transmitter)
    u8.set(ap, o + 16);                                           // addr3
    o += WIFI_HDR;
  }
  return u8;
}

function macBytes(mac) { return mac.split(':').map((h) => parseInt(h, 16)); }
