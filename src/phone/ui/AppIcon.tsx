import { useId } from 'react';

/**
 * The app icon (build/icon.svg) inline, so the welcome screen needs no asset
 * import. Gradient ids are scoped with useId in case it renders twice.
 */
export default function AppIcon({ size = 96, className }: { size?: number; className?: string }) {
  const id = useId().replace(/:/g, '');
  const tile = `${id}-tile`;
  const glow = `${id}-glow`;
  const bill = `${id}-bill`;
  const ds = `${id}-ds`;
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#34D399" />
          <stop offset="0.55" stopColor="#10B981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <radialGradient id={glow} cx="0.3" cy="0.24" r="0.9">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" />
          <stop offset="0.5" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={bill} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#EAFBF3" />
        </linearGradient>
        <filter id={ds} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="18" stdDeviation="26" floodColor="#003B2B" floodOpacity="0.30" />
        </filter>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${tile})`} />
      <rect width="1024" height="1024" rx="232" fill={`url(#${glow})`} />
      <g filter={`url(#${ds})`}>
        <rect x="246" y="378" width="532" height="196" rx="40" fill="#FFFFFF" opacity="0.42" transform="rotate(-9 512 476)" />
        <rect x="252" y="430" width="520" height="200" rx="42" fill="#FFFFFF" opacity="0.72" transform="rotate(-3.5 512 530)" />
        <rect x="258" y="496" width="508" height="206" rx="44" fill={`url(#${bill})`} />
        <rect x="288" y="526" width="448" height="146" rx="26" fill="none" stroke="#10B981" strokeOpacity="0.22" strokeWidth="6" />
      </g>
      <g filter={`url(#${ds})`}>
        <circle cx="512" cy="599" r="96" fill="#10B981" />
        <circle cx="512" cy="599" r="96" fill={`url(#${glow})`} />
        <circle cx="512" cy="599" r="78" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="6" />
        <text
          x="512"
          y="600"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          fontSize="118"
          fill="#FFFFFF"
        >
          $
        </text>
      </g>
    </svg>
  );
}
