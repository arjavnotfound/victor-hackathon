// Simulated camera for laptops, tests and screenshots (scan.html?demo=1).
// Draws a dim room with a phone charger. Inside the charger is a hidden lens
// that lights up when the "torch" is on. There is also a glossy picture frame
// (big reflection, should be ignored) and a standby LED blinking on its own
// timer (does not follow the code, should be ignored).

export function createDemoCamera() {
  const c = document.createElement('canvas');
  c.width = 960; c.height = 540;
  const ctx = c.getContext('2d');
  const cam = { torch: false, ir: false, stream: null };
  let lit = 0; // torch brightness with a small lag, like a real LED + sensor

  function frame(t) {
    lit += ((cam.torch ? 1 : 0) - lit) * 0.6;
    // Slow hand shake so repeated scans see the lens at slightly different places.
    const dx = Math.sin(t / 1900) * 14, dy = Math.cos(t / 2300) * 9;
    const base = cam.ir ? 12 : 40 + lit * 30;

    ctx.fillStyle = `rgb(${base},${base + 2},${base + 6})`;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.save();
    ctx.translate(dx, dy);
    // wall socket + charger
    ctx.fillStyle = `rgb(${base + 40},${base + 40},${base + 42})`;
    ctx.fillRect(400, 250, 160, 110);
    ctx.fillStyle = `rgb(${base + 70},${base + 70},${base + 72})`;
    ctx.fillRect(440, 270, 80, 70);
    // glossy picture frame: big reflection that follows the torch
    ctx.fillStyle = `rgb(${base + 20 + lit * 120},${base + 20 + lit * 120},${base + 25 + lit * 120})`;
    ctx.fillRect(110, 90, 190, 120);
    // the hidden lens: tiny, and very bright only under the torch (retro-reflection)
    if (!cam.ir) {
      ctx.fillStyle = `rgb(${90 + lit * 165},${80 + lit * 160},${90 + lit * 165})`;
      ctx.beginPath(); ctx.arc(480, 300, 3.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // IR LEDs next to the lens glow purple-white to the phone camera
      for (const [x, y] of [[470, 292], [490, 292]]) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9);
        g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#d9a6ff'); g.addColorStop(1, 'rgba(160,80,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
    // standby LED on its own 0.7 s timer
    if (Math.floor(t / 700) % 2) {
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath(); ctx.arc(760, 400, 4, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // sensor noise
    const img = ctx.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < img.data.length; i += 16) {
      const n = (Math.random() - 0.5) * 18;
      img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  }

  setInterval(() => frame(performance.now()), 33);
  frame(0);
  cam.stream = c.captureStream(30);
  return cam;
}
