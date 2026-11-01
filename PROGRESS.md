# Progress

## 1 Nov (afternoon): Glint
- **Name:** the app is now **Glint** (one constant in `src/config.js`; also the manifest, Android app name and icon). Team name stays VICTOR.
- **Design:** dark monochrome everywhere. Black page, grey tiles, white type, one white round button for the main action; colour only for results (green, amber, red). Home is a tile grid with a hero "Scan this room" button, a ring for checks done, a short splash where the mark draws itself.
- **Lens check fixes** (`src/lens.js`): every frame is lined up with the first before it is added in (`alignShift`, `addShifted`), so a 1-3 px lens dot survives hand shake during the 3.5 s code. Analysis is 480 px wide (was 320). The lone-dot ring test now sits just outside the spot (`ringRadii`), so a lens held close is no longer dropped. Max dot size 90 px. Tuned settings moved to a new key so old phones get the new defaults.
- **Lens sweep:** one tap starts back-to-back scans until tapped again; the round shutter's ring fills with the flash code; a spot seen in two scans in a row is confirmed on its own.
- **3D Wi-Fi map** (`map.html`, `src/map-page.js`, maths in `src/airmap.js`, three.js): each source plotted by frequency (across), upload (up, log scale) and signal (depth). Green / amber / red from the upload pattern: steady upload like live video, regular keyframe bursts every 2-5 s, the flash test result, camera-like name, camera Wi-Fi chip (chip only counts on top of a steady upload). Drag, pinch, pan; tap a dot or a colour chip for channel, band, signal, upload now (replay), upload over time and the reasons. Red dots pulse and carry labels. In the Android app the map scans nearby Wi-Fi on opening. `map.html?demo=1` runs the real analysis on the simulated room.
- **Limit (honest):** a phone cannot see other devices' upload. Upload colours need the laptop traffic test; nearby networks from the phone are coloured by name, chip and signal only, and say so.
- Tests: 72 unit, 13 e2e, all green.
- Next: try the lens sweep on a real phone against a real phone camera at 30 cm and 1-2 m; decide on a one-command live feed from the Mac so the traffic test needs no manual capture and upload.

## Decisions (1 Nov polish)
- **Branch:** all of this is on the local branch `demo-polish`.
- **Design:** one stylesheet (`src/app.css`) for every screen. Inset grouped lists, large titles that collapse into the nav bar, one filled button per screen in a bar at the bottom, everything else as plain text buttons. Light and dark follow the phone; camera screens are always dark.
- **Icons:** one hand-drawn set in `src/icons.js` (24 px grid, 1.8 stroke). Pages ask for them with `data-icon`.
- **Screen names:** "IR check" is now "Night-vision lights" everywhere a user sees it. The laptop step is "Wi-Fi traffic".
- **New page `how.html`** (How it works), linked from Home.
- **Screen transitions** use the browser's own page-to-page transition (Chrome). Browsers without it simply switch pages.
- **Sheets** (phone support, details, settings, confirm clear) slide up over a dimmed backdrop and close by swipe down, tapping outside, Done or Escape.
- **Screenshots** moved out of the e2e run into `npm run shots` (every screen and sheet, light and dark, 390 and 360 wide). `npm run e2e` only checks behaviour now.
- **Shape test (lens):** a spot must be round and solid to count. "Fill" is measured against the round outline that fits the spot's box (a round dot only covers 79% of its square box, and a small pixelated one less), threshold 0.7; width to height at least 0.6. Spots under 6 pixels are too small to have a shape and always pass. Grouping is now 8-connected, so a slanted streak stays one piece.
- **Show ignored reflections** (Details, off by default): grey circles labelled "Wrong shape" or "Doesn't follow the flash". Pieces of one streak are merged into one circle; at most 6 shown.
- **Demo room** now has a spoon edge that the lens check ignores, so the toggle can be shown on a laptop.
- **Isolation test** now samples two rings (4 and 6 px) of 24 points instead of one ring of 12, so short pieces of a thin streak are no longer kept as dots.
- **Coverage ring** (`src/coverage.js`): 12 slices of 30 degrees, filled while a lens or night-vision scan runs. Uses the absolute orientation event on Android (compass), else plain deviceorientation (how far the phone turned since the page opened, which is all the ring needs). Hidden until the phone gives a reading, so laptops and phones without the sensor never show it. Lens and night-vision share one ring. In demo mode the heading turns slowly so the ring can be shown on a laptop.
- **Dates** show as "today, 8:49 AM" instead of the full date.
- Network: devices with port 554/8554 open get a short RTSP OPTIONS request; a reply starting "RTSP/1.0" means "Answers as a video stream". The app also listens for local announcements (mDNS camera service types, one SSDP search) and reads their server/type lines; media servers and TVs are not flagged.
- Network names: our own strict rules (camera word as a whole word, or a camera prefix plus a hex serial, or a short model code plus a hex serial). Brand-name lists were removed. Ordinary names like "Airtel_Home", "JioFiber-5G" and "Campus WiFi" are tested to stay unflagged.
- Network reasons are plain sentences, no scores. Nearby and device scans run at the same time with progress lines from the Android side, aimed at under 15 s. `network.html?demo=1` uses made-up data so the screen can be shown on a laptop.
- Find it: a "Find it" button on each flagged nearby network opens find.html. The Android plugin's new `signal({ bssid })` asks for a scan and returns the newest reading with its age. The page averages the last 4 readings, says "Warmer"/"Colder" only past a 3 dB change, "Very close" above -42 dBm, and pulses faster when stronger (haptics in the app, navigator.vibrate on the web). If readings stay older than 8 s three times in a row it shows the scan-throttling tip. `find.html?demo=1` fakes a rising signal.
- Report: "Save report (PDF)" first opens a sheet with optional place/room, name and notes (remembered on the phone). They are part of the fingerprinted content. The PDF is A4 with a teal header (title, date, place, name), one summary line, a "Checks done" table with coloured dots, saved spots two per row with captions, network findings with their reasons, a limits box, the Wi-Fi traffic details when present, the phone used, how the checks work, and the fingerprint. Checked by rendering the e2e PDF to images.
- Hindi: Settings on Home has an English / हिन्दी switch, saved on the phone. `src/strings.js` maps each English line to Hindi (plus a few patterns for lines with numbers); the page swaps text as it appears, so status lines and lists change too. Noto Sans Devanagari is bundled locally. Debug text, camera support values and some status lines stay English. The PDF stays in English: the PDF library's built-in fonts cannot draw Devanagari, and embedding a font would add about 200 KB to every report. Screenshots: docs/screenshots/hi-*.
- Next: run MORNING_TEST.md section 4c on a real Android phone (torch, compass, real Wi-Fi, Find it, Hindi font). Nothing in 4c has been verified on a phone yet.

## 1 Nov: real app, real address

| Step | What | Status |
|---|---|---|
| 1 | GitHub Pages at https://arjavnotfound.github.io/victor-hackathon/, relative links, installable offline app | done, live, checked in Chromium |
| 2 | Lens check: torch timing measured per phone, safer exposure lock, circles follow the hand | done, checked with the simulated camera only |
| 3 | Android app (Capacitor) with a Network check plugin in Java; `npm run android:setup`, `npm run apk` | done: `npm run apk` builds a 4.7 MB debug APK on this Mac (Java and SDK in ~/Android); published as release v1.0.0. Not yet installed on a phone or emulator |
| 4 | Quieter design: system fonts, grouped lists, bottom sheets, light and dark mode, new icon | done |
| 5 | README with demo GIF and QR code, LICENSE, repo homepage and topics | done |
| 6 | MORNING_TEST.md, how-it-works.md updated | done |

Tests: 45 unit tests, 12 end-to-end checks (built site under `/victor-hackathon/`, light and dark, laptop QR), all green.

### Decisions
- **Hosting:** GitHub Pages from the `gh-pages` branch, published with `npm run deploy`. A GitHub Actions workflow would be nicer, but this GitHub login cannot push workflow files. To switch later: `gh auth refresh -h github.com -s workflow`, then move `tools/ci/pages.yml` and `tools/ci/android.yml` into `.github/workflows/`.
- **Android app** loads the same web code. The torch and camera still go through the page (`getUserMedia`), so the lens check behaves the same as in Chrome. Only the Network check is native.
- **Network check scoring** (`src/network.js`): camera-style names count only as whole words (so "Campus WiFi" is not flagged); video ports 554/8554/34567/8899 count strongly, web ports 80/8080/81 only weakly; a web page that looks like a camera login counts.
- **Exposure lock:** only locks exposure, focus or white balance when the phone reports the current value. Locking without it can jump to the middle of the range and black out the picture.
- **Torch timing:** measured once per phone and saved; "Measure torch timing again" in Details redoes it.
- **Design:** system fonts (Inter bundled as fallback), one teal accent, camera screens always dark. The serif font is gone. The Wi-Fi page now uses the same look.
- **iPhone:** skipped. A web page on iPhone cannot control the torch, and there is no Xcode here.
- **Outside code** comes in only as npm or Gradle packages, which keep their own licenses.

### Not verified (needs a real phone)
- Everything with a real torch: blinking, torch timing, exposure lock, frames per bit, thresholds.
- Torch inside the Android app's WebView.
- The Network check on real Wi-Fi with a real camera.
- Offline install from the home screen on Android.

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
- **(Replaced on 1 Nov)** **Wi-Fi page keeps its own dark style** (`src/style.css`). Only the phone pages use the new design (`src/app.css`), so the Wi-Fi page and its charts are untouched.
- **(Replaced on 1 Nov)** **Fonts:** Source Serif 4 (headings) and Inter (body) from `@fontsource`, Latin subset only, bundled by Vite. No CDN.
- **Exposure lock before every scan**, not once at camera start: the user points at a new area each scan, so the camera re-meters with the torch on, then locks.
- **Torch read-back:** Chrome silently ignores "advanced" constraints it cannot meet, so after each switch the page reads `getSettings().torch`. A scan stops only if more than half the switches failed, so one slow read-back does not end a scan. The count shows as "torch misses" in Details.
- **Fingerprint:** a PDF cannot contain the hash of its own bytes, so the printed fingerprint is a SHA-256 of the report's contents (text and photo data). The file's own SHA-256 is still shown on screen after saving.
- **DEMO label:** the report says DEMO whenever the simulated camera or sample Wi-Fi data was used, even if Results was opened without `?demo=1`.
- **Settings remembered:** Details panel changes are saved on the phone so tuning survives a reload. "Reset to defaults" undoes them.
- **Snapshots:** at most 6, 640 px JPEG. A photo over 400k characters is dropped but the spot is kept.
- **Demo camera drift slowed:** the old simulated hand shake moved the lens ~9 analysis pixels during one 3.5 s scan, which smeared it and the demo found nothing. It now drifts 1-2 pixels per scan.
- **(Replaced on 1 Nov)** **Native Android app skipped:** no JDK and no Android SDK on this Mac, so no Capacitor build. Chrome on Android stays the demo path. (Torch inside an Android WebView is untested and a native torch plugin may clash with the camera the page already holds.)
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

