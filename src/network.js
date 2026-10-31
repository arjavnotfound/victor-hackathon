// Network check scoring (no DOM, testable in node). The Android app collects
// the raw facts (see NetworkCheckPlugin.java); this file decides what is
// worth a closer look and says why in plain words.
//
// Two sources:
// 1. Nearby Wi-Fi networks. Many cheap cameras make their own little Wi-Fi
//    network, often with a camera-style name, and their Wi-Fi chip maker can
//    be read from the network's address. Names can be changed, so this is
//    only ever a hint.
// 2. Devices on the Wi-Fi you joined. Security cameras answer on video
//    streaming ports, or reply to the standard "are there any cameras here?"
//    discovery message. That is a much stronger sign.

import { lookupVendor } from './oui.js';

// Network names that cheap camera models use out of the box.
// Whole words only, so "Campus WiFi" is not a camera.
const CAMERA_NAME = /(^|[^a-z])(ip-?cam|ipc|cam|hdwificam|wifi-?cam|v380|yoosee|lookcam|mv\d+|hd-?cam|spy-?cam|spy|cctv|dvr|nvr|ezviz|imou|a9|cloudcam|smartcam|yi-?home|xmeye|icsee)(?![a-z])/i;

/**
 * Ports and what they mean. RTSP is how cameras stream live video; ONVIF is
 * the standard way security cameras are controlled; 34567 is used by many
 * cheap camera/DVR boards; 8899 is a common ONVIF port on small cameras.
 */
export const CAMERA_PORTS = {
  554: 'streams live video (RTSP)',
  8554: 'streams live video (RTSP)',
  34567: 'uses a port common on cheap camera boards',
  8899: 'uses a security camera control port',
};
// Ports that alone mean little (any router or printer has a web page).
export const WEAK_PORTS = { 80: 'has a web page', 8080: 'has a web page', 81: 'has a web page' };
export const ALL_PORTS = [...Object.keys(CAMERA_PORTS), ...Object.keys(WEAK_PORTS)].map(Number);

// Words in a device's own web page title or server name that say "camera".
const CAMERA_WEB = /(ip ?webcam|webcam|camera|ipcam|ip-cam|netcam|dvr|nvr|onvif|hikvision|dahua|xmeye|mjpe?g|video stream|live view)/i;

/**
 * One nearby Wi-Fi network: { ssid, bssid, level }.
 * Returns { flag: 'closer' | 'none', reasons: [...] }.
 */
export function scoreNearby(net) {
  const reasons = [];
  if (net.ssid && CAMERA_NAME.test(net.ssid)) reasons.push('has a camera-style name');
  const { vendor, camChip } = lookupVendor(net.bssid || '');
  if (camChip) reasons.push(`uses a ${vendor} chip, common in small cameras`);
  return { flag: reasons.length ? 'closer' : 'none', reasons, vendor };
}

/**
 * One device on the joined Wi-Fi: { ip, ports: [open ports], onvif: bool,
 * name, web: "<page title> <server name>" }.
 * Camera discovery reply or a video port = worth a closer look. A web page
 * alone is not enough.
 */
export function scoreDevice(dev) {
  const reasons = [];
  if (dev.onvif) reasons.push('replied to a camera discovery message');
  for (const p of dev.ports || []) if (CAMERA_PORTS[p]) reasons.push(CAMERA_PORTS[p]);
  if (dev.name && CAMERA_NAME.test(dev.name)) reasons.push('has a camera-style name');
  if (dev.web && CAMERA_WEB.test(dev.web)) reasons.push('has a web page that looks like a camera');
  const strong = reasons.length > 0;
  if (!strong) for (const p of dev.ports || []) if (WEAK_PORTS[p] && !reasons.includes(WEAK_PORTS[p])) reasons.push(WEAK_PORTS[p]);
  return { flag: strong ? 'closer' : 'none', reasons: [...new Set(reasons)] };
}

/** Plain sentence for a flagged item. */
export const describe = (what, reasons) => `${what} ${reasons.join(', ')}.`;

/** Summary of a whole scan, ready for the store and the report. */
export function summarize({ nearby = [], devices = [] }) {
  const flagged = [];
  for (const n of nearby) {
    const s = scoreNearby(n);
    if (s.flag === 'closer') flagged.push({ kind: 'nearby', label: n.ssid || '(hidden name)', detail: describe('This Wi-Fi network', s.reasons) });
  }
  for (const d of devices) {
    const s = scoreDevice(d);
    if (s.flag === 'closer') flagged.push({ kind: 'device', label: d.name || d.ip, detail: describe('This device', s.reasons) });
  }
  return { nearby: nearby.length, devices: devices.length, flagged };
}
