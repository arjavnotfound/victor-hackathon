#!/usr/bin/env python3
"""Summarize a pcap: frame types, transmitters, radiotap RSSI/channel, duration.

Usage: .venv/bin/python analyze_pcap.py file1.pcap [file2.pcap ...]
"""
import sys
from collections import Counter

from scapy.all import PcapReader, RadioTap, Dot11, Ether

MGMT_NAMES = {0: "assoc req", 1: "assoc resp", 4: "probe req", 5: "probe resp",
              8: "beacon", 10: "disassoc", 11: "auth", 12: "deauth", 13: "action"}
DATA_NAMES = {0: "data", 4: "null", 8: "QoS data", 12: "QoS null"}


def freq_to_channel(f):
    if f == 2484:
        return 14
    if 2412 <= f <= 2472:
        return (f - 2407) // 5
    if 5000 <= f <= 5900:
        return (f - 5000) // 5
    if 5955 <= f <= 7115:
        return (f - 5950) // 5
    return None


def frame_kind(d):
    if d.type == 0:
        return "mgmt/" + MGMT_NAMES.get(d.subtype, f"sub{d.subtype}")
    if d.type == 1:
        return "control"
    if d.type == 2:
        return "data/" + DATA_NAMES.get(d.subtype, f"sub{d.subtype}")
    return "other"


def analyze(path):
    print(f"\n===== {path} =====")
    total = 0
    kinds = Counter()
    tx_bytes = Counter()
    tx_frames = Counter()
    rssi_n = chan_n = radiotap_n = 0
    channels = Counter()
    rssis = []
    t0 = t1 = None
    try:
        reader = PcapReader(path)
    except Exception as e:
        print(f"  cannot open: {e}")
        return
    with reader:
        for p in reader:
            total += 1
            t = float(p.time)
            t0 = t if t0 is None else min(t0, t)
            t1 = t if t1 is None else max(t1, t)
            if p.haslayer(RadioTap):
                radiotap_n += 1
                rt = p[RadioTap]
                sig = getattr(rt, "dBm_AntSignal", None)
                if sig is not None:
                    rssi_n += 1
                    rssis.append(sig)
                freq = getattr(rt, "ChannelFrequency", None)
                if freq:
                    chan_n += 1
                    channels[freq_to_channel(freq)] += 1
            if p.haslayer(Dot11):
                d = p[Dot11]
                kinds[frame_kind(d)] += 1
                if d.addr2:
                    tx_bytes[d.addr2] += len(p)
                    tx_frames[d.addr2] += 1
            elif p.haslayer(Ether):
                kinds["ethernet (normal mode)"] += 1
                tx_bytes[p[Ether].src] += len(p)
                tx_frames[p[Ether].src] += 1
            else:
                kinds["unknown"] += 1

    print(f"  total frames      : {total}")
    if total == 0:
        print("  (empty capture)")
        return
    dur = t1 - t0
    print(f"  duration          : {dur:.2f} s  ({total / dur:.1f} frames/s)" if dur > 0
          else "  duration          : 0 s")
    print("  frame types:")
    for k, n in kinds.most_common():
        print(f"    {k:<24} {n}")
    data_total = sum(n for k, n in kinds.items() if k.startswith("data/"))
    print(f"  ALL 802.11 data frames: {data_total}")
    print(f"  distinct transmitters (addr2/src): {len(tx_bytes)}")
    print("  top 10 transmitters by bytes:")
    for mac, b in tx_bytes.most_common(10):
        print(f"    {mac}  {b:>9} bytes  {tx_frames[mac]:>6} frames")
    print(f"  radiotap header   : {radiotap_n}/{total} frames")
    print(f"  RSSI present      : {rssi_n}/{total} frames"
          + (f"  (min {min(rssis)} / max {max(rssis)} dBm)" if rssis else ""))
    print(f"  channel present   : {chan_n}/{total} frames  {dict(channels)}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    for f in sys.argv[1:]:
        analyze(f)
