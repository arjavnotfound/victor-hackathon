# Morning test (1 Nov)

## Summary (read this first)

**Finished (checked in desktop Chromium and unit tests only):** home, lens check, IR check, results, PDF report with a printed fingerprint, "If you found something" page, new design with local fonts. 34 unit tests and 9 end-to-end checks pass. The Wi-Fi page and its sample data still work.

**Not checked on a real phone yet. The risky parts:**
- The real torch blinking from the page. The page now reads the torch state back after every switch and says so plainly if it did not change.
- Locking exposure, focus and white balance. It is done before every scan; if the phone refuses, the scan still runs unlocked.
- How many frames per bit the phone really gives (needs at least 4, ideally 8 or more).
- The IR thresholds were tuned on synthetic and simulated pictures only.

**First three things to test on the phone:**
1. Lens check → tap **Phone**: does it say Torch: yes? Then Scan once and watch: does the torch blink?
2. Tap **Details** after a scan: frames per bit (want 4 or more each) and torch misses (want 0).
3. Lens check on the IP Webcam phone in the tissue box at 1 m: does it say "Seen twice, worth a closer look" after two scans?

---

## Checklist

### 1. Start the server and open it on the phone
1. On the Mac, in the repo folder:
   ```bash
   cd ~/Downloads/VICTOR && npm run dev
   ```
2. Find the Mac's IP address:
   ```bash
   ipconfig getifaddr en0
   ```
3. On the Android phone (same Wi-Fi), open Chrome and go to `https://<that IP>:5173`
4. Chrome warns about the certificate. Tap **Advanced → Proceed**. (It is our own local certificate.)
5. Tap **Start the check**, then **Start camera**, and allow camera access.

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

### 5. Save a report
1. Tap **Next: results**. Check the "What was checked" list and the saved spot photos.
2. Tap **Save report (PDF)**. Open the PDF from the download bar.
3. Check: photos are there, the phone model and camera controls are listed, the fingerprint at the end matches the one shown on screen.

### 6. Wi-Fi step (on the Mac)
1. IP Webcam phone streams to a second phone (open its address in the second phone's browser and leave it playing).
2. Find the channel the IP Webcam phone uses (the router page, or the busy channels list from an earlier capture).
3. Mac: ⌘ Space → Wireless Diagnostics → Window → Sniffer → pick that channel, 20 MHz → **Start**.
4. On the Mac, open `https://localhost:5173/challenge.html`, press **Start**, point the screen at the IP Webcam phone's lens for the whole 25 seconds.
5. Sniffer → **Stop**. Drop the new file from `/var/tmp/` (Downloads → Sniffer captures) onto the page.
6. Expected: "Camera found" with the IP Webcam phone's address at the top.

### 7. If the lens check finds too much or too little
Open **Details** on the lens check. Changes are remembered on the phone. **Reset to defaults** undoes them.

| Problem | Change |
|---|---|
| Circles on many shiny things | Match needed up to 0.85-0.9. Smallest blink up to 10-15. Biggest dot down to 20. |
| Lens not found at all | Match needed down to 0.7. Smallest blink down to 3-4. |
| Lens not found up close (0.5 m) | Biggest dot up to 80-120 (the dot looks bigger up close). |
| Frames per bit under 4 | Bit length up to 450-500 ms. |
| Heatmap is grey and noisy, lens not white | Settle time up to 180-220 ms (the torch is slow to switch on this phone). |
| Torch misses above 0 | Note it. If the torch visibly blinks anyway, the read-back is just slow; it is fine. |

IR check **Details**: too many circles → Brightness needed up to 240, Brighter than around it up to 80. Nothing found → Brightness needed down to 200, Brighter than around it down to 40.

### 8. Fallbacks on stage
- Lens check without a real camera: open `https://<IP>:5173/lens.html?demo=1` (a simulated room; Start camera, then Scan twice). The IR check also has `ir.html?demo=1`. The report says DEMO when the simulated camera was used.
- Wi-Fi page: **Try with sample data** gives a simulated capture with one camera and four other devices.
- If the phone cannot reach the Mac, the laptop can run the demo pages too: `npm run dev`, then open `https://localhost:5173/?demo=1`.
