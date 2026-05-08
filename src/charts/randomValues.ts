// Tiny seedable PRNG + helpers for the chart demo-mode data generator.
// Real metric data flows through Firestore; this file only powers the
// `?demo` URL fallback so chart visuals can be assessed without logged
// data. Replaced by DGT-30's richer demo system in a follow-up.

// mulberry32 — small, good-enough seeded PRNG. Returns a 0..1 float.
export function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Inclusive integer in [min, max].
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Float in [min, max), rounded to `decimals` places.
export function randomFloat(
  rng: () => number,
  min: number,
  max: number,
  decimals = 1,
): number {
  const factor = 10 ** decimals;
  return Math.round((rng() * (max - min) + min) * factor) / factor;
}

// Stable integer hash so a (metricId, dayOffset) pair always seeds the
// same PRNG within a session. cyrb53 — small string→32-bit hash.
export function hashSeed(s: string): number {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h2 = Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}
