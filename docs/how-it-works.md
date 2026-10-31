# How VICTOR works

A short guide for the team. No maths needed.

## The big idea

We never just "look" for a camera. We send a secret pattern (on, off, on, on, off...) and check whether anything in the room answers in the same pattern. A lamp, a mirror or a phone on the table cannot copy a pattern it has never seen. A camera answers without meaning to.

## Lens check: why a lens sends the flash back

A camera lens focuses light onto a tiny flat sensor. Light that goes into the lens hits the sensor and bounces back out the same way it came in, straight back toward the light. This is the same thing that makes a cat's eyes glow in car headlights.

The phone's torch sits right next to the phone's camera. So when the torch shines on a hidden lens, the phone sees a tiny bright dot, exactly where the lens is.

## Why the pattern is random

Lots of things in a room are shiny: screws, glossy stickers, glasses, the edge of a frame. They also light up when the torch is on. So we do not just switch the torch on once. We blink it in a new random pattern every scan, about 10 flashes over 3.5 seconds, and look for dots that follow that exact pattern. Something blinking on its own timer (like a standby light on a TV) does not follow our pattern, so it is ignored.

We also only keep small dots. A lens dot is tiny. A big shiny area is a mirror, a window or a glossy surface.

## Why we check twice after moving

A shiny screw reflects the torch only at one exact angle. Move the phone a little to the side and the reflection usually disappears. A lens keeps reflecting from many angles.

So a dot found in one scan is shown as **Possible reflection**. If it is found again in the same place after you move a little and scan again, it is shown as **Seen twice, worth a closer look**.

## What the IR check sees

Many cameras have small night-vision lights so they can see in the dark. These lights use infrared, which our eyes cannot see. Most phone cameras can see a little of it, and show it as a small white or purple dot.

In the IR check the torch is off and the room should be dark. The app looks for small, very bright dots. It ignores big bright areas (a lamp, a window) and flashes that last one moment. A dot that stays bright for about a second, or keeps blinking steadily, gets a circle: **Bright point, worth a closer look**.

The front camera of many phones blocks less infrared than the back camera, so it is worth trying both.

## The Wi-Fi check (laptop step)

A camera that streams video over Wi-Fi has to send more data when its picture changes a lot, and less when the picture is still.

The laptop screen flickers in a random pattern of "busy" and "still" in front of the object, for about 25 seconds. At the same time, the Mac records the Wi-Fi traffic in the air around it (only the size and time of each packet; the content is encrypted and we do not read it). Then we drop that recording into the page. If one device's traffic rises and falls with our pattern, it is very likely watching the screen.

## How the app adjusts to your phone

Every phone's torch takes a different time to switch on and off, and the camera takes a moment to notice. Before the first scan the app blinks the torch 6 times and times how long the picture takes to change. It then makes each flash of the pattern long enough for this phone. The number shows in Details as "torch timing".

Between scans, the app compares each new picture with the last one to see how far your hand moved, and moves the circles with it, so they stay on the spot.

## The network check (Android app)

A web page is not allowed to look at Wi-Fi networks or other devices, so this check is only in the Android app. It does two things:

- **Nearby Wi-Fi names.** Many cheap cameras make their own Wi-Fi network with a name like "IPC-1234" or "CAM_xxxx", or are made by companies that mostly make camera chips. Those names get listed.
- **Devices on your Wi-Fi.** The app knocks on every address on the Wi-Fi you joined and checks which ones answer on the doors cameras usually use (for example port 554 for video streams), answer a "are you a camera?" message that many cameras reply to, or show a camera login page.

It cannot see a camera on another Wi-Fi, on mobile data, or one that only records to a memory card. Some hostel and college Wi-Fi networks also hide devices from each other.

## What the app cannot do

- It cannot promise a room is safe. It only covers what it checked.
- A lens hidden behind a dark cover, or seen from a very sharp angle, may not reflect enough.
- Cameras without night-vision lights do not show up in the IR check.
- Cameras that only record to a memory card, or use mobile data, do not show up in the Wi-Fi or network checks.
- The torch only works from a web page in Chrome on Android. iPhones do not allow it.
- A spot "worth a closer look" is not proof. It is a reason to look closely and, if needed, tell someone who can act.

## The report and its fingerprint

The PDF report lists what was checked, the saved spots with photos, and the phone used. At the end is a fingerprint: a long code worked out from everything in the report. If anyone changes a word or a photo, the code will no longer match.
