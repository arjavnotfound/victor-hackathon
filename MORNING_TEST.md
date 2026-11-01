# Phone test checklist

## Summary (read this first)

**Finished (checked in desktop Chromium and unit tests only):** home, lens check, IR check, results, PDF report, help page, network check screen, light and dark mode, offline install. 45 unit tests and 12 end-to-end checks pass. The app is live at https://arjavnotfound.github.io/victor-hackathon/ (no Mac, no certificate warning).

**New since the overnight build:**
- Before the first scan the lens check blinks the torch 6 times to measure how slow this phone's torch is, and sets the bit length from that. Shown in Details as "torch timing".
- Circles follow small hand movement between scans.
- Exposure is only locked when the phone reports its current exposure time, so the picture should not go black.
- Android app (`VICTOR.apk`) with a **Network check**: nearby Wi-Fi names and devices on your Wi-Fi that look like cameras.

**Not checked on a real phone yet. The risky parts:**
- The real torch blinking, in Chrome and inside the Android app.
- The torch timing measurement and the exposure lock.
- How many frames per bit the phone gives (want 4 or more).
- IR thresholds (tuned on simulated pictures only).
- The whole Network check (needs the APK on a phone and real Wi-Fi).

**First four things to test on the phone:**
1. Open the link above in Chrome. Lens check → **Phone**: does it say Torch: yes? Start camera: does the torch blink 6 times, then Details shows a torch timing?
2. Scan once. Details: frames per bit (4 or more) and torch misses (0).
3. Lens check on the IP Webcam phone in the tissue box at 1 m: "Seen twice, worth a closer look" after two scans?
4. Install the APK, run Network check on the same Wi-Fi as the IP Webcam phone: is it listed?

---

## Checklist

### 1. Open the app on the phone
**Easiest:** open https://arjavnotfound.github.io/victor-hackathon/ in Chrome on the Android phone (or scan the QR code on the laptop home page). Chrome's menu → **Add to Home screen** makes it work offline at the venue.

**Android app (for the Network check):** download `VICTOR.apk` from https://github.com/arjavnotfound/victor-hackathon/releases/latest on the phone, open it, allow "install unknown apps" for Chrome when asked.

**Local server (only if the internet is down):**
```bash
cd ~/Downloads/VICTOR && npm run dev
```
Then on the phone open `https://<Mac IP>:5173` (IP from `ipconfig getifaddr en0`) and tap **Advanced → Proceed** on the certificate warning.

Tap **Start the check**, then **Start camera**, and allow camera access.

### 2. What this phone supports
On the lens check, tap **Phone**. Write down:

| Item | What it shows |
|---|---|
| Torch | |
| Exposure | |
| Focus | |
| White balance | |
| Frame rate | |
| Picture size | |
| Locked for the scan (after one Scan) | |

### 3. Lens check on the hidden phone
Set up: old phone running IP Webcam inside the tissue box, lens behind the small hole. Room lights normal or a little dim.

For each distance: point at the box, tap **Scan**, move a little to the side, tap **Scan** again. Then open **Details** and note the numbers.

| Target | Distance | 1st scan says | 2nd scan says | Frames per bit | Torch misses | Best match |
|---|---|---|---|---|---|---|
| Tissue box (lens) | 0.5 m | | | | | |
| Tissue box (lens) | 1 m | | | | | |
| Tissue box (lens) | 2 m | | | | | |
| Shiny spoon (control) | 1 m | | | | | |
| Glasses (control) | 1 m | | | | | |

What we hope to see: the lens gives "Seen twice", the spoon and glasses give nothing or "Possible reflection" that goes away after moving.

Tap **Save this spot** on one good result so the report has a photo.

### 4. IR check (dark room)
Only useful if one of the cameras has night-vision lights (IP Webcam on a phone does not; a cheap Wi-Fi camera usually does).
1. Tap **Next: IR check**, turn the room lights off, tap **Start camera**.
2. Point slowly around. A night-vision light should get a purple circle: "Bright point, worth a closer look".
3. Tap **Use front camera** and try again. Note which camera sees it better.
4. Also note: does a phone screen, a lamp or a street light through a window get a circle? (It should not.)

### 4b. Network check (Android app only)
1. Phone on the same Wi-Fi as the IP Webcam phone. Location turned on (Android hides Wi-Fi names without it).
2. Home → **Network check** → **Check the network**. Allow location when asked. Takes about 15 seconds.
3. Note: is the IP Webcam phone listed? What does it say about it? Is anything else listed that is not a camera?
4. Try on the college or hostel Wi-Fi too: many of those hide devices from each other, so expect fewer devices.

### 4c. Not verified on a phone yet (added 1 Nov)

None of these could be tested on the laptop. Try each once.

- **Spoon test (lens shape filter).** Put a metal spoon and the hidden phone side by side, about arm's length away. Scan. The lens should be circled. In Details, turn on "Show ignored reflections": the spoon's shine should get a grey circle with "Wrong shape" or "Doesn't follow the flash".
- **Coverage ring.** During a lens scan, turn slowly on the spot. The ring at the bottom right should fill slice by slice. Results should say "You checked N of 12 directions". If the phone has no compass the ring stays hidden.
- **Network: video stream test.** On a Wi-Fi with a real camera (or a phone running a webcam app on port 554/8554), run the network check. The camera should show "Answers as a video stream". A TV or Chromecast on the same Wi-Fi should not be flagged.
- **Network time.** The whole check should finish in about 15 seconds, with the progress line changing ("Knocking on every address…", "Asking video ports…", "Reading device names…").
- **Find it.** Turn on a mini camera's hotspot (or a phone hotspot named like `IPC-1A2B3C`). Run the network check, tap "Find it" on it, and walk towards it. The ring should fill and say "Warmer"; next to it "Very close". The phone should pulse faster as you get closer.
- **Find it is slow?** Android limits Wi-Fi scans to about 4 every 2 minutes. If the screen shows "Updates are slow on this phone", turn throttling off:
  1. Settings > About phone > tap "Build number" 7 times (Developer options turn on).
  2. Settings > System > Developer options.
  3. Find "Wi-Fi scan throttling" and turn it off.
  4. Go back to Find it. Readings should now update every second or two.

### 5. Save a report
1. Tap **Next: results**. Check the "What was checked" list and the saved spot photos.
2. Tap **Save report (PDF)**. Open the PDF from the download bar.
3. Check: photos are there, the phone model and camera controls are listed, the fingerprint at the end matches the one shown on screen.

### 6. Wi-Fi step (on the Mac)
1. IP Webcam phone streams to a second phone (open its address in the second phone's browser and leave it playing).
2. Find the channel the IP Webcam phone uses (the router page, or the busy channels list from an earlier capture).
3. Mac: ⌘ Space → Wireless Diagnostics → Window → Sniffer → pick that channel, 20 MHz → **Start**.
4. On the Mac, open https://arjavnotfound.github.io/victor-hackathon/challenge.html (or `https://localhost:5173/challenge.html` with `npm run dev`), press **Start**, point the screen at the IP Webcam phone's lens for the whole 25 seconds.
5. Sniffer → **Stop**. Drop the new file from `/var/tmp/` (Downloads → Sniffer captures) onto the page.
6. Expected: "A device followed the flashes" with the IP Webcam phone's address at the top.

### 7. If the lens check finds too much or too little
Open **Details** on the lens check. Changes are remembered on the phone. **Reset to defaults** undoes them.

| Problem | Change |
|---|---|
| Circles on many shiny things | Match needed up to 0.85-0.9. Smallest blink up to 10-15. Biggest dot down to 20. |
| Lens not found at all | Match needed down to 0.7. Smallest blink down to 3-4. |
| Lens not found up close (0.5 m) | Biggest dot up to 80-120 (the dot looks bigger up close). |
| Frames per bit under 4 | Bit length up to 450-500 ms. |
| Heatmap is grey and noisy, lens not white | Settle time up to 180-220 ms (the torch is slow to switch on this phone). |
| Torch timing above 250 ms | Fine; the app already slowed the pattern down. Tap **Measure torch timing again** if you changed phones. |
| Torch misses above 0 | Note it. If the torch visibly blinks anyway, the read-back is just slow; it is fine. |

IR check **Details**: too many circles → Brightness needed up to 240, Brighter than around it up to 80. Nothing found → Brightness needed down to 200, Brighter than around it down to 40.

### 8. Fallbacks on stage
- Lens check without a real camera: open https://arjavnotfound.github.io/victor-hackathon/lens.html?demo=1 (a simulated room; Start camera, then Scan twice). The IR check also has `ir.html?demo=1`. The report says DEMO when the simulated camera was used.
- Wi-Fi page: **Try with sample data** gives a simulated capture with one camera and four other devices.
- If the phone has no camera access, the laptop can run the demo pages too: open the same link with `?demo=1` on the end.
