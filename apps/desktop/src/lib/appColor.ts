/**
 * The colour an application is drawn in.
 *
 * Assigned by hashing the application name, so Chrome is the same colour on
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

/**
 * The colour an application is drawn in everywhere. Keyed by the application's
 * name, not an executable: WhatsApp.exe and WhatsApp.Root.exe are one WhatsApp
 * and must be one colour.
 */
export function appColor(name: string): string {
  // FNV-1a over the name, then a final avalanche step. Without the avalanche,
  // names sharing a suffix (once, every one of these ended in ".exe")
  // land in neighbouring buckets.
  let hash = 0x811c9dc5;

  for (let index = 0; index < name.length; index++) {
    hash ^= name.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;

  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
