/**
 * DaTrack's soft circles and bars: an item's colour washed toward the page.
 * Light mode mixes with white; dark mode mixes with the dark card surface so
 * the pastel doesn't glow. Returns an opaque colour so text on top stays crisp.
 */

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [100, 116, 139];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

export function pastel(hex: string, theme: 'light' | 'dark'): string {
  const [r, g, b] = parseHex(hex);
  if (theme === 'dark') {
    // Toward #1a1f2c (≈ surface-2/3 in dark), keeping ~38% of the colour.
    return `rgb(${mix(26, r, 0.38)} ${mix(31, g, 0.38)} ${mix(44, b, 0.38)})`;
  }
  return `rgb(${mix(255, r, 0.24)} ${mix(255, g, 0.24)} ${mix(255, b, 0.24)})`;
}

/** A stronger tint for progress fills (bars), still soft. */
export function fillTint(hex: string, theme: 'light' | 'dark'): string {
  const [r, g, b] = parseHex(hex);
  if (theme === 'dark') return `rgb(${mix(26, r, 0.62)} ${mix(31, g, 0.62)} ${mix(44, b, 0.62)})`;
  return `rgb(${mix(255, r, 0.42)} ${mix(255, g, 0.42)} ${mix(255, b, 0.42)})`;
}
