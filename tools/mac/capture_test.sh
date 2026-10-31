#!/bin/bash
# Monitor-mode capture test for en0. Run with: sudo bash capture_test.sh
# Max 20 s in monitor mode, then waits for Wi-Fi to reconnect.
IF=en0
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR" || exit 1
OWNER="${SUDO_USER:-$(whoami)}"

if [ "$(id -u)" -ne 0 ]; then echo "Please run with sudo: sudo bash capture_test.sh"; exit 1; fi

wait_for_wifi() {
  for i in $(seq 1 30); do
    ip=$(ipconfig getifaddr $IF)
    if [ -n "$ip" ]; then echo "  Wi-Fi is connected again (IP $ip) after ~${i}s"; return 0; fi
    sleep 1
  done
  echo "  WARNING: Wi-Fi did NOT reconnect within 30 s. Click the Wi-Fi icon and rejoin your network."
  return 1
}

# run_capture <seconds> <outfile> <tcpdump args...>
run_capture() {
  secs=$1; out=$2; shift 2
  rm -f "$out"
  tcpdump "$@" -i $IF -w "$out" 2>"$out.stderr" &
  pid=$!
  sleep "$secs"
  kill -INT $pid 2>/dev/null; wait $pid 2>/dev/null
  sed 's/^/  tcpdump: /' "$out.stderr"; rm -f "$out.stderr"
  chown "$OWNER" "$out" 2>/dev/null
  echo "  packets in file: $(tcpdump -r "$out" 2>/dev/null | wc -l | tr -d ' ')"
}

echo "=== Before ==="
networksetup -getairportpower $IF
echo "  IP: $(ipconfig getifaddr $IF || echo none)"
wdutil info 2>/dev/null | grep -E "^\s*(Channel|RSSI|Noise|PHY Mode|Op Mode)" | sed 's/^ */  /'
echo "  monitor-capable link types:"; tcpdump -I -i $IF -L 2>&1 | sed 's/^/    /'

echo; echo "=== Test A: monitor mode (tcpdump -I), 20 s ==="
run_capture 20 test_tcpdump.pcap -I -y IEEE802_11_RADIO
wait_for_wifi

echo; echo "=== Test B: normal mode, 10 s ==="
run_capture 10 test_normal.pcap
wait_for_wifi

echo; echo "=== After ==="
networksetup -getairportpower $IF
wdutil info 2>/dev/null | grep -E "^\s*(Channel|RSSI)" | sed 's/^ */  /'
ls -l test_tcpdump.pcap test_normal.pcap
echo "Done. Copy everything above and paste it back to Claude."
