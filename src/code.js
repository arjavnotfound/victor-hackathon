// Secret random codes.
//
// The whole idea of VIGIL is that we send a pattern nobody can predict and
// check who answers in the same pattern. So the code must come from a real
// random source (crypto), and be fresh for every test.

/**
 * Make a random code of `n` bits (array of 0/1).
 * We keep the number of 1s near half, so correlation is well defined and the
 * code has both "on" and "off" periods to compare. All-0 or all-1 codes would
 * tell us nothing.
 */
export function makeCode(n, rand = cryptoRandom) {
  const minOnes = Math.floor(n * 0.4);
  const maxOnes = Math.ceil(n * 0.6);
  for (;;) {
    const bits = Array.from({ length: n }, () => (rand() < 0.5 ? 1 : 0));
    const ones = bits.reduce((a, b) => a + b, 0);
    // Also require at least 3 changes so the code is not just "000111".
    let changes = 0;
    for (let i = 1; i < n; i++) if (bits[i] !== bits[i - 1]) changes++;
    if (ones >= minOnes && ones <= maxOnes && changes >= 3) return bits;
  }
}

export function cryptoRandom() {
  const a = new Uint32Array(1);
  globalThis.crypto.getRandomValues(a);
  return a[0] / 2 ** 32;
}

/** Small seeded random generator (for repeatable tests and the demo). */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  };
}

export const codeToString = (bits) => bits.join('');
