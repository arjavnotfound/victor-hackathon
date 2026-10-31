// Camera, torch and "what this phone supports". Shared by the lens and light checks.
//
// The main path is Chrome on Android, served over https. `?demo=1` swaps in a
// simulated camera (scan-demo.js) so the flow can be tried on a laptop.

import { createDemoCamera } from './scan-demo.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let demoCam = null;

/** Open the camera. Returns { stream, track, caps, demo }. Throws if the user blocks it. */
export async function openCamera({ facing = 'environment', demo = false } = {}) {
  if (demo) {
    demoCam = demoCam || createDemoCamera();
    const track = demoCam.stream.getVideoTracks()[0];
    return { stream: demoCam.stream, track, caps: { torch: true }, demo: demoCam, facing };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This browser cannot open the camera here. Open the page in Chrome over https.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  const track = stream.getVideoTracks()[0];
  return { stream, track, caps: track.getCapabilities?.() || {}, demo: null, facing };
}

export function closeCamera(cam) {
  if (cam && !cam.demo) cam.stream.getTracks().forEach((t) => t.stop());
}

/**
 * Switch the torch and check it really changed. Chrome quietly ignores
 * "advanced" constraints it cannot meet, so a missing error does not mean
 * success. We read the setting back. Returns true only if it worked.
 */
export async function setTorch(cam, on) {
  if (cam.demo) { cam.demo.torch = !!on; return true; }
  if (!cam.caps.torch) return false;
  try {
    await cam.track.applyConstraints({ advanced: [{ torch: !!on }] });
  } catch {
    return false;
  }
  const s = cam.track.getSettings?.() || {};
  return !('torch' in s) || s.torch === !!on;
}

/**
 * Lock exposure, focus and white balance just before the flash code.
 * Why: auto exposure sees the torch come on, darkens the picture to make up
 * for it, and partly cancels the very blink we want to measure. Auto focus
 * and white balance also hunt when the light flickers. So we let the camera
 * meter once with the torch on (so the lit scene is not blown out to white),
 * then freeze those settings for the whole code.
 * Returns the list of things that were locked, for the support panel.
 */
export async function lockForTorch(cam) {
  if (cam.demo) return ['simulated'];
  const caps = cam.caps, locked = [];
  try {
    // Back to automatic first so it can re-meter the new spot the user is pointing at.
    const auto = {};
    if (caps.exposureMode?.includes('continuous')) auto.exposureMode = 'continuous';
    if (caps.focusMode?.includes('continuous')) auto.focusMode = 'continuous';
    if (caps.whiteBalanceMode?.includes('continuous')) auto.whiteBalanceMode = 'continuous';
    if (Object.keys(auto).length) await cam.track.applyConstraints({ advanced: [auto] });
    if (!(await setTorch(cam, true))) return locked;
    await sleep(700); // auto exposure needs a moment to settle under the torch
    const st = cam.track.getSettings();
    const adv = {};
    // Only lock when we can keep the current value. Chrome on Android puts a
    // "manual" exposure with no time at the middle of the range, which can
    // turn the picture black or white.
    if (caps.exposureMode?.includes('manual') && st.exposureTime) {
      Object.assign(adv, { exposureMode: 'manual', exposureTime: st.exposureTime }); locked.push('exposure');
    }
    if (caps.focusMode?.includes('manual') && st.focusDistance) {
      Object.assign(adv, { focusMode: 'manual', focusDistance: st.focusDistance }); locked.push('focus');
    }
    if (caps.whiteBalanceMode?.includes('manual') && st.colorTemperature) {
      Object.assign(adv, { whiteBalanceMode: 'manual', colorTemperature: st.colorTemperature }); locked.push('white balance');
    }
    if (locked.length) await cam.track.applyConstraints({ advanced: [adv] });
  } catch (e) {
    console.warn('Could not lock camera settings', e);
  } finally {
    await setTorch(cam, false);
  }
  return locked;
}

/** Rows for the "What this phone supports" panel: [name, plain answer]. */
export function describeSupport(caps = {}, settings = {}) {
  const modes = (m) => (m?.length ? (m.includes('manual') ? 'can lock' : 'automatic only') : 'not reported');
  const fr = caps.frameRate;
  return [
    ['Torch', caps.torch ? 'yes' : 'no'],
    ['Exposure', modes(caps.exposureMode)],
    ['Focus', modes(caps.focusMode)],
    ['White balance', modes(caps.whiteBalanceMode)],
    ['Frame rate', settings.frameRate ? `${Math.round(settings.frameRate)} fps` + (fr?.max ? ` (up to ${Math.round(fr.max)})` : '') : 'not reported'],
    ['Picture size', settings.width ? `${settings.width} x ${settings.height}` : 'not reported'],
  ];
}

/** Phone and browser details for the report. Uses Chrome's model hint when available. */
export async function phoneInfo(cam) {
  const info = { browser: navigator.userAgent, screen: `${screen.width} x ${screen.height}` };
  try {
    const hi = await navigator.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (hi?.model) info.model = hi.model;
    if (hi?.platform) info.platform = `${hi.platform} ${hi.platformVersion || ''}`.trim();
  } catch { /* not available */ }
  if (cam) {
    info.camera = cam.demo ? 'simulated demo camera' : cam.track.label || 'camera';
    info.support = describeSupport(cam.caps, cam.track.getSettings?.() || {});
  }
  return info;
}
