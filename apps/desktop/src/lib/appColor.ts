/**
 * The colour an application is drawn in.
 *
 * Assigned by hashing the executable name, so Chrome is the same colour on
 * every screen and in every session without anything being stored. A colour
 * that moved between runs would be worse than none, because the user would
 * learn it and then be misled by it.
 *
 * The hues are spaced around the wheel rather than listed by taste: an earlier
 * palette put orchid, coral and pink next to each other, and half the list came
 * out looking like the same pink. Six is the working limit — beyond that they
 * stop being tellable apart at the size of a 6-pixel dot.
 */
const PALETTE = [
  '#6e9bff', // blue
  '#e0a458', // amber
  '#5fb3a1', // teal
  '#c77dbb', // orchid
  '#e0736b', // coral
  '#7fb069', // moss
] as const;

export function appColor(executable: string): string {
  // FNV-1a over the name, then a final avalanche step. Without the avalanche,
  // names sharing a suffix — and almost every one of these ends in ".exe" —
  // land in neighbouring buckets.
  let hash = 0x811c9dc5;

  for (let index = 0; index < executable.length; index++) {
    hash ^= executable.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;

  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
