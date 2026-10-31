# Mac Wi-Fi Capture Report (2026-10-31)

## Machine
- MacBook Air M2 (Mac14,2), 8 GB, macOS 26.4 (25E246)
- Wi-Fi: `en0`, Broadcom 0x4387, 802.11 a/b/g/n/ac/ax, Apple DriverKit Wi-Fi driver
- 2.4 GHz channels 1–13, 5 GHz 36–165
- python3 3.9.6, git 2.50.1; venv at `.venv` with scapy 2.8.0 and numpy 2.0.2
- `/dev/bpf*` is root-only, so every capture needs sudo (Wireshark/ChmodBPF not installed)

## Results
| Method | Result |
|---|---|
| `sudo tcpdump -I -i en0` (monitor mode) | **Fails.** 0 frames in 20 s, even on the joined channel 36. Wi-Fi never dropped, so monitor mode never really turned on. |
| `sudo tcpdump -i en0` (normal mode) | Works (8,144 packets in 9 s), but only your own network, as Ethernet frames with no RSSI or channel. Not useful for the detector. |
| **Wireless Diagnostics → Window → Sniffer**, ch 6, 20 MHz | **Works.** 18,156 frames in 281 s, 429 distinct transmitters, 1,967 data frames. Radiotap on 100% of frames with RSSI (-97 to -27 dBm), channel, TSFT timestamp and noise. |

## Best method for this Mac
Use the Wireless Diagnostics Sniffer. It's GUI only, and there is no `airport` command to change channels.
1. ⌘ Space → `Wireless Diagnostics` → Return (ignore the assistant window)
2. Menu bar → Window → Sniffer → pick channel + width → Start … Stop
3. The file is saved in `/var/tmp/` as `<Mac name>_ch<N>_<date>.pcap` (not on the Desktop)
4. Analyze it:
```bash
cp /var/tmp/*_ch6_*.pcap ~/Downloads/VICTOR/sniffer_ch6.pcap
cd ~/Downloads/VICTOR && .venv/bin/python tools/mac/analyze_pcap.py sniffer_ch6.pcap
```

Per-frame fields available for the detector: `Dot11.addr2` (transmitter), `len(pkt)`, `pkt.time` / `RadioTap.mac_timestamp`, `RadioTap.dBm_AntSignal`, `RadioTap.ChannelFrequency`.

## Notes
- Choose the channel the suspected camera uses. Nearby networks seen: 2.4 GHz ch 1, 7, 11 and 5 GHz ch 36. The Sniffer listens to one channel at a time.
- Captures are offline (you get a file after you click Stop), not live. For live streaming you would need a USB Wi-Fi adapter that supports monitor mode, used via a Linux VM or a Raspberry Pi.
- scapy may print "packet has been truncated" for the last frame when the capture is stopped. This is harmless.
