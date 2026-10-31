package app.teamvictor.check;

import android.Manifest;
import android.content.Context;
import android.location.LocationManager;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.wifi.ScanResult;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Collects raw facts for the network check. The web code (src/network.js)
 * decides what is worth a closer look; this class only looks.
 *
 * nearby(): Wi-Fi networks around the phone (name, address, signal).
 *   Android only shares these with apps that have location permission.
 * lan({ ports }): devices on the Wi-Fi the phone has joined. For each address
 *   in the local /24 range we try the given TCP ports, send the standard
 *   camera discovery message (ONVIF WS-Discovery), and read the title of any
 *   small web page a device serves.
 */
@CapacitorPlugin(
    name = "NetworkCheck",
    permissions = { @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION }) }
)
public class NetworkCheckPlugin extends Plugin {

    private static final int CONNECT_TIMEOUT_MS = 400;
    private static final int[] WEB_PORTS = { 80, 81, 8080 };

    // ---------- nearby Wi-Fi networks ----------

    @PluginMethod
    public void nearby(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "nearbyAfterPermission");
            return;
        }
        readNearby(call);
    }

    @PermissionCallback
    private void nearbyAfterPermission(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) readNearby(call);
        else call.reject("Location permission is needed to list nearby Wi-Fi networks.", "NO_PERMISSION");
    }

    private void readNearby(PluginCall call) {
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        try {
            wm.startScan(); // Android limits how often this runs; cached results still come back
        } catch (Exception ignored) {
        }
        // A fresh scan takes a few seconds to arrive.
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            JSArray list = new JSArray();
            try {
                for (ScanResult r : wm.getScanResults()) {
                    JSObject o = new JSObject();
                    o.put("ssid", r.SSID == null ? "" : r.SSID.replace("\"", ""));
                    o.put("bssid", r.BSSID);
                    o.put("level", r.level);
                    o.put("frequency", r.frequency);
                    list.put(o);
                }
            } catch (SecurityException e) {
                call.reject("Android did not allow reading nearby Wi-Fi networks.", "NO_PERMISSION");
                return;
            }
            JSObject ret = new JSObject();
            ret.put("networks", list);
            ret.put("locationOn", locationOn());
            call.resolve(ret);
        }, 4000);
    }

    private boolean locationOn() {
        LocationManager lm = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (lm == null) return false;
        if (Build.VERSION.SDK_INT >= 28) return lm.isLocationEnabled();
        return lm.isProviderEnabled(LocationManager.GPS_PROVIDER) || lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    // ---------- devices on this Wi-Fi ----------

    @PluginMethod
    public void lan(PluginCall call) {
        List<Integer> ports = new ArrayList<>();
        try {
            for (Object p : call.getArray("ports").toList()) ports.add(((Number) p).intValue());
        } catch (Exception e) {
            call.reject("No ports given.");
            return;
        }
        new Thread(() -> scanLan(call, ports)).start();
    }

    private void scanLan(PluginCall call, List<Integer> ports) {
        Inet4Address self = null;
        int prefix = 24;
        ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        Network net = cm.getActiveNetwork();
        LinkProperties lp = net == null ? null : cm.getLinkProperties(net);
        if (lp != null) {
            for (LinkAddress la : lp.getLinkAddresses()) {
                if (la.getAddress() instanceof Inet4Address && !la.getAddress().isLoopbackAddress()) {
                    self = (Inet4Address) la.getAddress();
                    prefix = la.getPrefixLength();
                }
            }
        }
        if (self == null) {
            call.reject("This phone is not connected to a Wi-Fi network.", "NO_WIFI");
            return;
        }

        // Only the 254 addresses next to ours. A big campus network can have
        // thousands; scanning them all would take minutes.
        byte[] b = self.getAddress();
        String base = (b[0] & 255) + "." + (b[1] & 255) + "." + (b[2] & 255) + ".";
        String selfIp = self.getHostAddress();

        Map<String, Set<Integer>> open = new ConcurrentHashMap<>();
        ExecutorService pool = Executors.newFixedThreadPool(64);
        List<Future<?>> jobs = new ArrayList<>();
        for (int h = 1; h < 255; h++) {
            String ip = base + h;
            if (ip.equals(selfIp)) continue;
            for (int port : ports) {
                jobs.add(pool.submit(() -> {
                    if (portOpen(ip, port)) open.computeIfAbsent(ip, k -> ConcurrentHashMap.newKeySet()).add(port);
                }));
            }
        }
        Set<String> onvif = onvifProbe();
        for (Future<?> j : jobs) {
            try { j.get(); } catch (Exception ignored) { }
        }

        // Read the title of small web pages (a phone webcam app shows "IP Webcam").
        Map<String, String> web = new ConcurrentHashMap<>();
        List<Future<?>> webJobs = new ArrayList<>();
        for (Map.Entry<String, Set<Integer>> e : open.entrySet()) {
            for (int port : WEB_PORTS) {
                if (!e.getValue().contains(port)) continue;
                webJobs.add(pool.submit(() -> {
                    String t = pageTitle(e.getKey(), port);
                    if (t != null && !t.isEmpty()) web.merge(e.getKey(), t, (a, c) -> a + " " + c);
                }));
                break;
            }
        }
        for (Future<?> j : webJobs) {
            try { j.get(); } catch (Exception ignored) { }
        }
        pool.shutdown();

        Map<String, JSObject> devices = new TreeMap<>();
        for (Map.Entry<String, Set<Integer>> e : open.entrySet()) devices.put(e.getKey(), device(e.getKey()));
        for (String ip : onvif) if (ip.startsWith(base)) devices.computeIfAbsent(ip, this::device);
        JSArray list = new JSArray();
        for (Map.Entry<String, JSObject> e : devices.entrySet()) {
            String ip = e.getKey();
            JSObject d = e.getValue();
            JSArray p = new JSArray();
            if (open.containsKey(ip)) for (int port : open.get(ip)) p.put(port);
            d.put("ports", p);
            d.put("onvif", onvif.contains(ip));
            d.put("web", web.getOrDefault(ip, ""));
            list.put(d);
        }
        JSObject ret = new JSObject();
        ret.put("devices", list);
        ret.put("self", selfIp);
        ret.put("range", base + "1-254");
        ret.put("prefix", prefix);
        call.resolve(ret);
    }

    private JSObject device(String ip) {
        JSObject d = new JSObject();
        d.put("ip", ip);
        return d;
    }

    private boolean portOpen(String ip, int port) {
        try (Socket s = new Socket()) {
            s.connect(new InetSocketAddress(ip, port), CONNECT_TIMEOUT_MS);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static final Pattern TITLE = Pattern.compile("<title[^>]*>([^<]{0,120})</title>", Pattern.CASE_INSENSITIVE);

    /** "<page title> <server name>", or null. Reads at most 8 KB. */
    private String pageTitle(String ip, int port) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL("http://" + ip + ":" + port + "/").openConnection();
            c.setConnectTimeout(800);
            c.setReadTimeout(800);
            c.setInstanceFollowRedirects(true);
            String server = c.getHeaderField("Server");
            String realm = c.getHeaderField("WWW-Authenticate"); // many cameras ask for a login right away
            InputStream in = c.getResponseCode() < 400 ? c.getInputStream() : c.getErrorStream();
            StringBuilder sb = new StringBuilder();
            if (in != null) {
                byte[] buf = new byte[8192];
                int n = in.read(buf);
                if (n > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
                in.close();
            }
            Matcher m = TITLE.matcher(sb);
            String title = m.find() ? m.group(1).trim() : "";
            return (title + " " + (server == null ? "" : server) + " " + (realm == null ? "" : realm)).trim();
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /**
     * Send the standard "any video cameras here?" message (ONVIF WS-Discovery)
     * to the local network and collect who answers within 3 seconds.
     */
    private Set<String> onvifProbe() {
        Set<String> found = ConcurrentHashMap.newKeySet();
        WifiManager wm = (WifiManager) getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        WifiManager.MulticastLock lock = wm.createMulticastLock("victor-onvif");
        String probe = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
            + "<e:Envelope xmlns:e=\"http://www.w3.org/2003/05/soap-envelope\""
            + " xmlns:w=\"http://schemas.xmlsoap.org/ws/2004/08/addressing\""
            + " xmlns:d=\"http://schemas.xmlsoap.org/ws/2005/04/discovery\""
            + " xmlns:dn=\"http://www.onvif.org/ver10/network/wsdl\">"
            + "<e:Header><w:MessageID>uuid:" + UUID.randomUUID() + "</w:MessageID>"
            + "<w:To e:mustUnderstand=\"true\">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>"
            + "<w:Action e:mustUnderstand=\"true\">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>"
            + "</e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>";
        try (DatagramSocket sock = new DatagramSocket()) {
            lock.acquire();
            byte[] data = probe.getBytes(StandardCharsets.UTF_8);
            InetAddress group = InetAddress.getByName("239.255.255.250");
            for (int i = 0; i < 2; i++) sock.send(new DatagramPacket(data, data.length, group, 3702));
            sock.setSoTimeout(500);
            long end = System.currentTimeMillis() + 3000;
            byte[] buf = new byte[8192];
            while (System.currentTimeMillis() < end) {
                DatagramPacket p = new DatagramPacket(buf, buf.length);
                try {
                    sock.receive(p);
                    found.add(p.getAddress().getHostAddress());
                } catch (SocketTimeoutException ignored) {
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (lock.isHeld()) lock.release();
        }
        return found;
    }
}
