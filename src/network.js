// Network check scoring (no DOM, testable in node). The Android app collects
// the raw facts (see NetworkCheckPlugin.java); this file decides what is
// worth a closer look and says why in plain words.
//
// Two sources:
// 1. Nearby Wi-Fi networks. Many cheap cameras make their own little Wi-Fi
//    network, often with a default name, and their Wi-Fi chip maker can be
//    read from the network's address. Names can be changed, so this is only
//    ever a hint.
// 2. Devices on the Wi-Fi you joined. Cameras answer as a video stream,
//    reply to the standard "are there any cameras here?" discovery message,
//    or announce themselves as cameras. Those are much stronger signs.

import { lookupVendor } from './oui.js';

// Network names. Our own rules, kept strict so ordinary home, hostel and
// phone hotspot names ("Airtel_Home", "JioFiber-5G", "Campus WiFi") are not
// flagged. Names can be changed by the owner, so a name is only ever a hint.
//
// 1. A camera word as a whole word: "cam", "ipcam", "cctv", "webcam" ...
const CAMERA_WORD = /(^|[^a-z])(cam|ipcam|ip-cam|ipc|webcam|wificam|wifi-cam|hdcam|minicam|spycam|smartcam|cloudcam|cctv|dvr|nvr|camera)(?![a-z])/i;
// 2. Default hotspot names of cheap mini cameras. They are made from a short
//    prefix plus the device's own serial or address in hex, for example
//    "IPC-8F3A21" or "P2P_00C0FFEE". The prefix must be one that means camera.
const HOTSPOT_PREFIX = /^(ipc|ipcam|cam|wificam|hdcam|minicam|spycam|smartcam|cloudcam|p2p|dv|hd)[-_ ]?[0-9a-f]{4,12}$/i;
// 3. A short model code (one or two letters and up to three digits) then a
//    serial of six or more hex digits: "A9_7C2E91D4", "MV12-3A4B5C".
const HOTSPOT_MODEL = /^[a-z]{1,2}\d{1,3}[-_][0-9a-f]{6,12}$/i;
// 4. A name that starts with camera words glued together: "HDWiFiCam_1234".
const CAMERA_COMPOUND = /^(hd|ip|wifi|mini|smart|cloud|spy|p2p)+[-_ ]?cam(era)?([-_ \d]|$)/i;
const hasDigit = (t) => /\d/.test(t);

/** Why a network name looks like a camera's, or null. */
export function nameReason(name = '') {
  const n = name.trim();
  if (!n) return null;
  if ((HOTSPOT_PREFIX.test(n) || HOTSPOT_MODEL.test(n)) && hasDigit(n)) return "Name looks like a camera's default hotspot";
  if (CAMERA_WORD.test(n) || CAMERA_COMPOUND.test(n)) return 'Name has a camera word in it';
  return null;
}

/**
 * Ports and what they mean. RTSP is how cameras stream live video; ONVIF is
 * the standard way security cameras are controlled; 34567 is used by many
 * cheap camera/recorder boards; 8899 is a common ONVIF port on small cameras.
 */
export const CAMERA_PORTS = {
  554: 'Uses the port cameras use for live video',
  8554: 'Uses the port cameras use for live video',
  34567: 'Uses a port common on cheap camera boards',
  8899: 'Uses a security camera control port',
};
// Ports that alone mean little (any router or printer has a web page).
export const WEAK_PORTS = { 80: 'Has a web page', 8080: 'Has a web page', 81: 'Has a web page' };
export const ALL_PORTS = [...Object.keys(CAMERA_PORTS), ...Object.keys(WEAK_PORTS)].map(Number);

// Words in a device's own web page title, server name or announcement that say "camera".
const CAMERA_WEB = /(ip ?webcam|webcam|camera|ipcam|ip-cam|netcam|dvr|nvr|onvif|mjpe?g|video stream|live view|live video|networkvideo)/i;
// Service types that only video devices announce.
const CAMERA_SERVICE = /(_rtsp\._tcp|_onvif\._tcp|_camera\._tcp)/i;

/**
 * One nearby Wi-Fi network: { ssid, bssid, level }.
 * Returns { flag: 'closer' | 'none', reasons: [...] }.
 */
export function scoreNearby(net) {
  const reasons = [];
  const why = nameReason(net.ssid);
  if (why) reasons.push(why);
  const { vendor, camChip } = lookupVendor(net.bssid || '');
  if (camChip) reasons.push(`Wi-Fi chip made by ${vendor}, common in small cameras`);
  return { flag: reasons.length ? 'closer' : 'none', reasons, vendor };
}

/**
 * One device on the joined Wi-Fi: { ip, ports: [open ports], onvif, rtsp,
 * mdns: "service types", ssdp: "server / type", name, web: "<title> <server>" }.
 * A video stream answer, a camera discovery reply, a camera announcement or a
 * video port = worth a closer look. A web page alone is not enough.
 */
export function scoreDevice(dev) {
  const reasons = [];
  if (dev.rtsp) reasons.push('Answers as a video stream');
  if (dev.onvif) reasons.push('Answers the standard camera discovery message');
  if ((dev.mdns && CAMERA_SERVICE.test(dev.mdns)) || (dev.ssdp && CAMERA_WEB.test(dev.ssdp))) {
    reasons.push('Announces itself as a camera on this Wi-Fi');
  }
  for (const p of dev.ports || []) if (CAMERA_PORTS[p] && !(dev.rtsp && (p === 554 || p === 8554))) reasons.push(CAMERA_PORTS[p]);
  if (dev.name && nameReason(dev.name)) reasons.push(nameReason(dev.name));
  if (dev.web && CAMERA_WEB.test(dev.web)) reasons.push('Has a web page that looks like a camera');
  const strong = reasons.length > 0;
  if (!strong) for (const p of dev.ports || []) if (WEAK_PORTS[p]) reasons.push(WEAK_PORTS[p]);
  return { flag: strong ? 'closer' : 'none', reasons: [...new Set(reasons)] };
}

/** Plain sentence for a flagged item (used in the report). */
export const describe = (reasons) => reasons.join('. ') + '.';

/** Summary of a whole scan, ready for the store and the report. */
export function summarize({ nearby = [], devices = [] }) {
  const flagged = [];
  for (const n of nearby) {
    const s = scoreNearby(n);
    if (s.flag === 'closer') flagged.push({ kind: 'nearby', label: n.ssid || '(hidden name)', bssid: n.bssid, level: n.level, reasons: s.reasons, detail: describe(s.reasons) });
  }
  for (const d of devices) {
    const s = scoreDevice(d);
    if (s.flag === 'closer') flagged.push({ kind: 'device', label: d.name || d.ip, reasons: s.reasons, detail: describe(s.reasons) });
  }
  return { nearby: nearby.length, devices: devices.length, flagged };
}
