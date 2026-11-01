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

## Round and small: the shape test

A lens is a small circle, so its reflection is a small round dot. Shine off a spoon, a tap or a picture frame edge is usually a long streak or a big patch. Each dot is measured: how much of its box it fills (a circle fills most of it, a slanted streak very little) and how close to square its box is. Dots that fail are ignored. In Details, "Show ignored reflections" draws them with a grey circle and the reason: "Wrong shape", or "Doesn't follow the flash" for a dot that is bright but does not blink with the torch.

## Which way you pointed: the coverage ring

While a scan runs, the phone's compass tells which way it is pointing. The circle around you is split into 12 slices. A slice fills in once you scanned in that direction. Results say "You checked 9 of 12 directions". This shows where you pointed the phone. It does not prove a direction is clear. Phones without a compass hide the ring.

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

- **Nearby Wi-Fi names.** Many cheap cameras make their own Wi-Fi network with a default name: a short camera word plus the device's serial number, like "IPC-8F3A21". Our rules are strict and only match whole words, so names like "Airtel_Home" or "JioFiber-5G" are left alone. Networks whose Wi-Fi chip maker mostly makes chips for small cameras are listed too.
- **Devices on your Wi-Fi.** The app knocks on every address on the Wi-Fi you joined and checks which ones answer on the doors cameras usually use (for example port 554 for video streams), answer a "are you a camera?" message that many cameras reply to, or show a camera login page.
- **Does it stream video?** For a device with a video port open, the app sends the first question a video player sends. If the reply starts like a video stream's reply, that device "answers as a video stream", which is a strong sign.
- **Announcements.** Devices often announce what they are on the local Wi-Fi so other devices can find them. The app listens for a short time. A device that announces itself as a camera is listed; TVs and media players are not.

Every listed item comes with its reasons in plain words. There is no score. Both parts run at the same time and finish in about 15 seconds.

## Find it

A camera that runs its own hotspot sends out its network name all the time, and its signal gets stronger as you walk towards it. "Find it" reads that signal about once a second, averages the last few readings (the signal jumps around by a few units from reflections and your own body), and says "Warmer" or "Colder" only when the change is bigger than that jumping. The ring fills with signal strength, and the phone pulses faster as it gets stronger.

Android limits how often an app may look at Wi-Fi networks. If readings come in slowly, the screen says so and explains how to turn off "Wi-Fi scan throttling" in Developer options.

It cannot find a camera that has joined someone else's Wi-Fi, because then the camera does not send its own network name.

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
