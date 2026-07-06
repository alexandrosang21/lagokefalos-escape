// Seedable RNG so the daily challenge gives everyone the same spawn sequence.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Same seed for the whole planet on a given UTC day.
export function dailySeedString(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function makeRng(daily: boolean): () => number {
  const seed = daily
    ? hashString("lago:" + dailySeedString())
    : (Math.random() * 0xffffffff) >>> 0;
  return mulberry32(seed);
}
