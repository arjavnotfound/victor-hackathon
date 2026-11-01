import { describe, it, expect } from 'vitest';
import { scoreNearby, scoreDevice, summarize, nameReason } from '../src/network.js';

describe('network check', () => {
  it('flags default mini-camera hotspot names', () => {
    for (const ssid of ['IPC-8F3A21', 'IPCAM-1A2B3C', 'A9_00C0FFEE12', 'MV12-3A4B5C', 'P2P-7F3E2A', 'CAM_1234']) {
      expect(nameReason(ssid), ssid).toBe("Name looks like a camera's default hotspot");
    }
  });

  it('flags names with a camera word', () => {
    for (const ssid of ['HDWiFiCam_1234', 'Hall CCTV', 'my-webcam', 'Camera 2']) {
      expect(nameReason(ssid), ssid).toBe('Name has a camera word in it');
    }
  });

  it('leaves ordinary home, hostel and phone networks alone', () => {
    for (const ssid of ['Campus WiFi', 'Airtel_Home', 'JioFiber-5G', 'Airtel_Hostel_5G', 'Galaxy A51 1234',
      'Camilla', 'Tenda_12AB34', 'TP-Link_3A5F', 'Room 204', 'Cambridge House', 'DIRECT-ab-HP Printer', '']) {
      expect(scoreNearby({ ssid, bssid: '00:1D:0F:00:00:01' }).flag, ssid).toBe('none');
    }
  });

  it('flags a camera-chip maker even with an ordinary name', () => {
    const s = scoreNearby({ ssid: 'Room 204', bssid: '24:0A:C4:11:22:33' }); // Espressif
    expect(s.flag).toBe('closer');
    expect(s.reasons[0]).toMatch(/Espressif/);
  });

  it('a device that answers as a video stream gets that reason, not the port one too', () => {
    const s = scoreDevice({ ip: '192.168.1.40', ports: [554], rtsp: true });
    expect(s.flag).toBe('closer');
    expect(s.reasons).toEqual(['Answers as a video stream']);
    expect(scoreDevice({ ip: '192.168.1.40', ports: [554] }).reasons).toEqual(['Uses the port cameras use for live video']);
  });

  it('flags camera discovery replies and camera announcements', () => {
    expect(scoreDevice({ ip: '1', ports: [], onvif: true }).reasons).toEqual(['Answers the standard camera discovery message']);
    expect(scoreDevice({ ip: '2', ports: [], mdns: '_rtsp._tcp' }).reasons).toEqual(['Announces itself as a camera on this Wi-Fi']);
    expect(scoreDevice({ ip: '3', ports: [], ssdp: 'Linux UPnP/1.0 / urn:schemas-upnp-org:device:NetworkVideoTransmitter:1' }).flag).toBe('closer');
  });

  it('does not flag a TV or media server announcement', () => {
    const s = scoreDevice({ ip: '4', ports: [80], ssdp: 'Linux UPnP/1.0 / urn:schemas-upnp-org:device:MediaServer:1', mdns: '_googlecast._tcp' });
    expect(s.flag).toBe('none');
  });

  it('flags a phone running a webcam app by its web page', () => {
    const s = scoreDevice({ ip: '192.168.1.50', ports: [8080], web: 'IP Webcam' });
    expect(s.flag).toBe('closer');
    expect(s.reasons).toEqual(['Has a web page that looks like a camera']);
    expect(scoreDevice({ ip: '192.168.1.1', ports: [80], web: 'Router login' }).flag).toBe('none');
  });

  it('does not flag a router or printer that only has a web page', () => {
    const s = scoreDevice({ ip: '192.168.1.1', ports: [80, 8080] });
    expect(s.flag).toBe('none');
    expect(s.reasons).toEqual(['Has a web page']);
  });

  it('summarizes in plain words', () => {
    const sum = summarize({
      nearby: [{ ssid: 'IPC-1A2B', bssid: '' }, { ssid: 'Home', bssid: '' }],
      devices: [{ ip: '10.0.0.5', ports: [554, 80], rtsp: true }, { ip: '10.0.0.1', ports: [80] }],
    });
    expect(sum.nearby).toBe(2);
    expect(sum.devices).toBe(2);
    expect(sum.flagged.map((f) => f.label)).toEqual(['IPC-1A2B', '10.0.0.5']);
    expect(sum.flagged[1].detail).toBe('Answers as a video stream.');
  });
});
