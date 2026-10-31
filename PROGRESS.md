# Progress

## Overnight plan (31 Oct to 1 Nov)
1. App shell: new light design (local fonts), home, shared store, app name in one constant.
2. Camera module: rear camera 1280x720, "What this phone supports" panel, real torch with plain failure messages, exposure/focus/white balance lock, `?demo=1` kept.
3. Lens check page (`lens.html`, built from the old `scan.html`): one Scan button, "Seen twice" vs "Possible reflection", Save this spot, Details panel with all thresholds.
4. IR check page (`ir.html`) with pure maths in `src/ir.js` + tests.
5. Results page, PDF report with a printed content fingerprint, "If you found something" page.
6. Playwright end-to-end run + screenshots of every screen, looked at and fixed.
7. MORNING_TEST.md, docs/how-it-works.md, README, this file.

## Decisions made overnight
- (filled in as I go)


Hackathon demo: MU20 Opportunity Summit 2026.

| Step | What | Status |
|---|---|---|
| 1 | Scaffold, CLAUDE.md, PROGRESS.md, README, first push | done |
| 2 | `scan.html` lens + IR scanner (torch code, ring test, confirm across scans, IR, snapshots, debug panel; `?demo=1` simulated camera) | done, not yet tried on a real Android phone |
| 3 | `challenge.html` flicker + pcap/pcapng analyzer in a Web Worker + demo replay + 14 vitest tests | done; demo finds the camera (score 0.99) |
| 4 | PDF evidence report with SHA-256 | built, needs a click-through check |
| 5 | Polish, teammate docs (how-it-works, demo checklist), Playwright screenshots | todo |

## Notes
- Mac capture method that works: Wireless Diagnostics → Window → Sniffer (see `MAC_ENV_REPORT.md`). Files land in `/var/tmp/`.
- `tcpdump -I` monitor mode does not work on this Mac's built-in Wi-Fi.

## Verified
- Parser on the real Mac capture `sniffer_ch6.pcap`: 18,155 frames, 429 transmitters, 1,967 data frames, RSSI -97 to -27 dBm (matches MAC_ENV_REPORT).
- 220 simulated rooms: camera score always at least 0.98; a decoy reached 0.8 in about 1 run out of 300.

## Next
- Try scan.html on a real Android phone (torch + exposure lock).
- Real camera test with the Mac Sniffer.
- docs/how-it-works.md, docs/demo-checklist.md, screenshots in README.
