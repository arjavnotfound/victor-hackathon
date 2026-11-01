// Pretend network plugin for laptop demos and screenshots (network.html?demo=1).
// Same calls and shapes as the Android plugin, with made-up but typical data.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = {};
const emit = (name, data) => (listeners[name] || []).forEach((f) => f(data));

export const demoPlugin = {
  addListener(name, f) { (listeners[name] ||= []).push(f); return { remove() {} }; },
  async nearby() {
    await wait(1500);
    return {
      locationOn: true,
      networks: [
        { ssid: 'Airtel_Hostel_5G', bssid: 'A0:AB:1B:10:20:30', level: -52, frequency: 5745 },
        { ssid: 'Airtel_Hostel', bssid: 'A0:AB:1B:10:20:31', level: -49, frequency: 2412 },
        { ssid: 'JioFiber-5G', bssid: 'C8:3A:35:44:55:66', level: -67, frequency: 5220 },
        { ssid: 'IPC-8F3A21', bssid: '24:0A:C4:8F:3A:21', level: -58, frequency: 2462 },
        { ssid: 'Galaxy A51 1234', bssid: '02:1A:11:22:33:44', level: -74, frequency: 2437 },
        { ssid: 'Campus WiFi', bssid: '70:4F:57:12:34:56', level: -81, frequency: 5500 },
      ],
    };
  },
  async lan() {
    emit('progress', { text: 'Knocking on every address on this Wi-Fi…' });
    await wait(2500);
    emit('progress', { text: 'Asking video ports whether they stream…' });
    await wait(1500);
    emit('progress', { text: 'Reading device names…' });
    await wait(1000);
    return {
      devices: [
        { ip: '192.168.1.1', ports: [80], name: 'router' },
        { ip: '192.168.1.23', ports: [554, 80], rtsp: true, mdns: '_rtsp._tcp', name: '' },
        { ip: '192.168.1.31', ports: [8009], mdns: '_googlecast._tcp', ssdp: 'Linux UPnP/1.0 / urn:schemas-upnp-org:device:MediaRenderer:1', name: 'Living room TV' },
        { ip: '192.168.1.40', ports: [], name: 'phone' },
      ],
    };
  },
};
