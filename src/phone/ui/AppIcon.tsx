import { appIconSvg } from '@shared/appIcon';

// Built once: the same SVG scripts/render-icons.mjs turns into the app's PNGs.
const SVG = appIconSvg({ rounded: true });

/** The app icon (the gauge), inline, so the welcome screen needs no asset import. */
export default function AppIcon({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <span
      className={className}
      style={{ display: 'block', width: size, height: size }}
      aria-hidden
      // A constant string from shared/appIcon.ts, never user input.
      dangerouslySetInnerHTML={{ __html: SVG.replace('width="1024" height="1024"', 'width="100%" height="100%"') }}
    />
  );
}
