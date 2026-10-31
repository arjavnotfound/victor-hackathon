# Progress

## Overnight plan (31 Oct to 1 Nov)
1. App shell: new light design (local fonts), home, shared store, app name in one constant.
2. Camera module: rear camera 1280x720, "What this phone supports" panel, real torch with plain failure messages, exposure/focus/white balance lock, `?demo=1` kept.
3. Lens check page (`lens.html`, built from the old `scan.html`): one Scan button, "Seen twice" vs "Possible reflection", Save this spot, Details panel with all thresholds.
4. IR check page (`ir.html`) with pure maths in `src/ir.js` + tests.
5. Results page, PDF report with a printed content fingerprint, "If you found something" page.
6. Playwright end-to-end run + screenshots of every screen, looked at and fixed.
7. MORNING_TEST.md, docs/how-it-works.md, README, this file.

## Overnight checkpoints

| # | Checkpoint | Status |
|---|---|---|
| 0 | Install, tests, build green before starting | done (14 tests, build ok) |
| 1 | App shell and design (home, local fonts, store, name in `src/config.js`) | done |
| 2 | Real torch and camera setup (support panel, torch read-back, locks, `?demo=1`) | done in code; native Android app skipped (no JDK or Android SDK on this Mac) |
| 3 | Lens check (`lens.html`) | done, tested with the simulated camera |
| 4 | IR check (`ir.html`, `src/ir.js` + 7 tests) | done, tested with synthetic frames and the simulated camera |
| 5 | Results, PDF report with printed fingerprint, help page | done |
| 6 | Testing: 34 unit tests, `npm run e2e` (9 checks), screenshots looked at and fixed | done |
| 7 | MORNING_TEST.md, docs/how-it-works.md, README | done |

## Verified tonight (desktop Chromium / tests)
- `npm test`: 34 tests green (lens maths and matching, IR detection, store, report fingerprint, Wi-Fi analysis).
- `npm run e2e` in headless Chromium at 390x844 with a fake camera, no console errors:
  - home loads, Start the check goes to the lens check, `?demo=1` carries through links;
  - lens check with the simulated camera finds the lens, marks it "Seen twice" after two scans, saves the spot;
  - lens check with Chromium's fake camera (no torch) says plainly that the torch is not available;
  - IR check opens the camera, switching front/back twice does not crash; with the simulated camera it flags the night-vision lights;
  - Results shows the saved spot and the checks; the PDF downloads, starts with `%PDF-`, and contains the fingerprint shown on screen;
  - Results with no spots says "Nothing found in what we checked.";
  - Wi-Fi page loads and its sample data still gives "Camera found".
- `npx vite build` passes.
- Every screen screenshotted at 390x844 and looked at; fixed a too-tall IR bottom panel, overlapping labels, cramped check names, hash lines running together, and a PDF heading split from its fingerprint.

## Not verified (needs the real phone)
- Torch blinking from the page on Android Chrome, and the torch read-back.
- Exposure / focus / white balance locking (`lockForTorch` in `src/camera.js`).
- Frames per bit and the lens thresholds on a real lens at 0.5, 1 and 2 m.
- IR thresholds on real night-vision lights; front vs back camera.
- Phone model in the report (uses Chrome's model hint).
- Fonts and layout on a real phone screen; tap targets by thumb.
- PDF download and opening on Android.

## Decisions made overnight
- **Page names:** `scan.html` became `lens.html`, plus new `ir.html`, `results.html`, `help.html`. The old lens+IR toggle page is gone; the two checks are separate screens. Old links to `scan.html` will 404.
- **Screen name "IR check"** kept as in the plan, with one plain line explaining infrared.
- **Wi-Fi page keeps its own dark style** (`src/style.css`). Only the phone pages use the new design (`src/app.css`), so the Wi-Fi page and its charts are untouched.
- **Fonts:** Source Serif 4 (headings) and Inter (body) from `@fontsource`, Latin subset only, bundled by Vite. No CDN.
- **Exposure lock before every scan**, not once at camera start: the user points at a new area each scan, so the camera re-meters with the torch on, then locks.
- **Torch read-back:** Chrome silently ignores "advanced" constraints it cannot meet, so after each switch the page reads `getSettings().torch`. A scan stops only if more than half the switches failed, so one slow read-back does not end a scan. The count shows as "torch misses" in Details.
- **Fingerprint:** a PDF cannot contain the hash of its own bytes, so the printed fingerprint is a SHA-256 of the report's contents (text and photo data). The file's own SHA-256 is still shown on screen after saving.
- **DEMO label:** the report says DEMO whenever the simulated camera or sample Wi-Fi data was used, even if Results was opened without `?demo=1`.
- **Settings remembered:** Details panel changes are saved on the phone so tuning survives a reload. "Reset to defaults" undoes them.
- **Snapshots:** at most 6, 640 px JPEG. A photo over 400k characters is dropped but the spot is kept.
- **Demo camera drift slowed:** the old simulated hand shake moved the lens ~9 analysis pixels during one 3.5 s scan, which smeared it and the demo found nothing. It now drifts 1-2 pixels per scan.
- **Native Android app skipped:** no JDK and no Android SDK on this Mac, so no Capacitor build. Chrome on Android stays the demo path. (Torch inside an Android WebView is untested and a native torch plugin may clash with the camera the page already holds.)
- **Wi-Fi result shared:** the Wi-Fi page now saves a short result (verdict, address, time) so the phone-side Results and report can mention it when both run in the same browser.

## Earlier progress

| Step | What | Status |
|---|---|---|
| 1 | Scaffold, CLAUDE.md, PROGRESS.md, README, first push | done |
| 2 | `scan.html` lens + IR scanner (torch code, ring test, confirm across scans, IR, snapshots, debug panel; `?demo=1` simulated camera) | done, not yet tried on a real Android phone |
| 3 | `challenge.html` flicker + pcap/pcapng analyzer in a Web Worker + demo replay + 14 vitest tests | done; demo finds the camera (score 0.99) |
| 4 | PDF evidence report with SHA-256 | done; clicked through in Chromium overnight |
| 5 | Polish, teammate docs, Playwright screenshots | done overnight (see checkpoints above) |

## Notes
- Mac capture method that works: Wireless Diagnostics → Window → Sniffer (see `MAC_ENV_REPORT.md`). Files land in `/var/tmp/`.
- `tcpdump -I` monitor mode does not work on this Mac's built-in Wi-Fi.

## Verified
- Parser on the real Mac capture `sniffer_ch6.pcap`: 18,155 frames, 429 transmitters, 1,967 data frames, RSSI -97 to -27 dBm (matches MAC_ENV_REPORT).
- 220 simulated rooms: camera score always at least 0.98; a decoy reached 0.8 in about 1 run out of 300.

## Next
- Try lens.html and ir.html on a real Android phone (see MORNING_TEST.md).
- Real camera test with the Mac Sniffer.

