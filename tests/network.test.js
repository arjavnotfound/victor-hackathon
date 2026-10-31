import { describe, it, expect } from 'vitest';
import { scoreNearby, scoreDevice, summarize } from '../src/network.js';

describe('network check', () => {
  it('flags a nearby network with a camera-style name', () => {
    expect(scoreNearby({ ssid: 'IPC-8F3A21', bssid: '02:00:00:00:00:01' }).flag).toBe('closer');
    expect(scoreNearby({ ssid: 'HDWiFiCam_1234', bssid: '' }).flag).toBe('closer');
  });

  it('flags a camera-chip maker even with an ordinary name', () => {
    const s = scoreNearby({ ssid: 'Room 204', bssid: '24:0A:C4:11:22:33' }); // Espressif
    expect(s.flag).toBe('closer');
    expect(s.reasons[0]).toMatch(/Espressif/);
  });

  it('leaves ordinary home and hostel networks alone', () => {
    for (const ssid of ['Airtel_Hostel_5G', 'JioFiber-abc', 'Campus WiFi', 'Galaxy A51 1234', 'Camilla']) {
      expect(scoreNearby({ ssid, bssid: '00:1D:0F:00:00:01' }).flag).toBe('none');
    }
  });

  it('flags a device that streams video or answers camera discovery', () => {
    expect(scoreDevice({ ip: '192.168.1.40', ports: [554] }).flag).toBe('closer');
    expect(scoreDevice({ ip: '192.168.1.41', ports: [], onvif: true }).reasons).toContain('replied to a camera discovery message');
  });

  it('flags a phone running a webcam app by its web page', () => {
    const s = scoreDevice({ ip: '192.168.1.50', ports: [8080], web: 'IP Webcam' });
    expect(s.flag).toBe('closer');
    expect(s.reasons).toEqual(['has a web page that looks like a camera']);
    expect(scoreDevice({ ip: '192.168.1.1', ports: [80], web: 'Router login' }).flag).toBe('none');
  });

  it('does not flag a router or printer that only has a web page', () => {
    const s = scoreDevice({ ip: '192.168.1.1', ports: [80, 8080] });
    expect(s.flag).toBe('none');
    expect(s.reasons).toContain('has a web page');
  });

  it('summarizes in plain words', () => {
    const sum = summarize({
      nearby: [{ ssid: 'IPC-1', bssid: '' }, { ssid: 'Home', bssid: '' }],
      devices: [{ ip: '10.0.0.5', ports: [554, 80] }, { ip: '10.0.0.1', ports: [80] }],
    });
    expect(sum.nearby).toBe(2);
    expect(sum.devices).toBe(2);
    expect(sum.flagged.map((f) => f.label)).toEqual(['IPC-1', '10.0.0.5']);
    expect(sum.flagged[1].detail).toBe('This device streams live video (RTSP).');
  });
});
