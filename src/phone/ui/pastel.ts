/**
 * DaTrack's soft circles and bars: an item's colour washed toward the card it
 * sits on. Cards are Ivory in light mode and Sage in dark mode (index.css,
 * html.phone), and both are light, so both mix toward a light base. Returns an
 * opaque colour so text on top stays crisp.
 */

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return [100, 116, 139];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

const CARD = {
  light: [251, 247, 239], // Ivory
  dark: [220, 230, 213], // Sage
} as const;

function wash(hex: string, theme: 'light' | 'dark', amount: number): string {
  const [r, g, b] = parseHex(hex);
  const [br, bg, bb] = CARD[theme];
  return `rgb(${mix(br, r, amount)} ${mix(bg, g, amount)} ${mix(bb, b, amount)})`;
}

export function pastel(hex: string, theme: 'light' | 'dark'): string {
  return wash(hex, theme, theme === 'dark' ? 0.28 : 0.24);
}

/** A stronger tint for progress fills (bars), still soft. */
export function fillTint(hex: string, theme: 'light' | 'dark'): string {
  return wash(hex, theme, theme === 'dark' ? 0.5 : 0.44);
}
