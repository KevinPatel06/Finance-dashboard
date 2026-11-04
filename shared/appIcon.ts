/**
 * The app icon: the Budget screen's left-to-spend gauge on Ivory. ONE source
 * for every copy of it: the welcome screen draws this string inline
 * (src/phone/ui/AppIcon.tsx) and `scripts/render-icons.mjs` rasterises it into
 * the iOS, Android, desktop and branding PNGs. Change it here, then re-run
 * the script.
 *
 * Dependency-free and plain TypeScript, so Node can import it directly.
 */

const IVORY = '#FBF7EF';
const GREEN = '#3F7A55';
const TRACK = '#E2D6C1';
const AMBER = '#C08A1E';

export interface AppIconOptions {
  /** Rounded tile with transparent corners (desktop, logo) vs full-bleed square (iOS/Android, which mask it themselves). */
  rounded?: boolean;
  /** Shrink the mark about the centre. Android's launcher shows only the middle ~2/3 of the layer. */
  markScale?: number;
}

export function appIconSvg({ rounded = false, markScale = 1 }: AppIconOptions = {}): string {
  const n = 13;
  const filled = 8;
  const cx = 512;
  const cy = 548;
  const r1 = 214;
  const r2 = 300;
  let segs = '';
  for (let i = 0; i < n; i++) {
    const a = ((150 + i * (240 / (n - 1))) * Math.PI) / 180;
    const x1 = (cx + r1 * Math.cos(a)).toFixed(1);
    const y1 = (cy + r1 * Math.sin(a)).toFixed(1);
    const x2 = (cx + r2 * Math.cos(a)).toFixed(1);
    const y2 = (cy + r2 * Math.sin(a)).toFixed(1);
    segs += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${i < filled ? GREEN : TRACK}"/>`;
  }
  const t = markScale === 1 ? '' : ` transform="translate(512 512) scale(${markScale}) translate(-512 -512)"`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">` +
    `<rect width="1024" height="1024"${rounded ? ' rx="232"' : ''} fill="${IVORY}"/>` +
    `<g${t}><g stroke-width="62" stroke-linecap="round">${segs}</g>` +
    `<circle cx="512" cy="560" r="44" fill="${AMBER}"/></g>` +
    `</svg>`
  );
}
