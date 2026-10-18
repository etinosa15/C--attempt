// Seeded, deterministic shuffle. Used to reorder quiz options so the correct
// answer isn't always in the same slot, while rendering identically on the server
// and the client (no hydration mismatch from Math.random).

/** 32-bit FNV-1a hash of a string — a stable seed from e.g. a lesson id. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG: a tiny, well-distributed generator from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates with a seeded PRNG. Returns a new array; the input is untouched. */
export function seededShuffle<T>(items: readonly T[], seed: string | number): T[] {
  const out = items.slice();
  const rand = mulberry32(typeof seed === "number" ? seed : hashSeed(seed));
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
