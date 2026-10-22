import type { ReactNode } from 'react';

const SEGMENTS = 21;
const SWEEP = 200; // degrees, centred on straight up
const TONE = {
  success: 'rgb(var(--success))',
  warning: 'rgb(var(--warning))',
  danger: 'rgb(var(--danger))',
} as const;

/**
 * DaTrack's segmented "left to spend" arc. `fraction` (0–1) of the segments
 * are lit from the left; the rest sit in the track colour.
 */
export default function Gauge({
  fraction,
  tone,
  label,
  value,
}: {
  fraction: number;
  tone: keyof typeof TONE;
  label: ReactNode;
  value: ReactNode;
}) {
  const lit = Math.round(Math.max(0, Math.min(1, fraction)) * SEGMENTS);
  const cx = 150;
  const cy = 150;
  const r = 118;
  return (
    <div className="relative mx-auto w-full max-w-[320px]">
      <svg viewBox="0 0 300 186" className="w-full" aria-hidden>
        {Array.from({ length: SEGMENTS }, (_, i) => {
          const angle = -SWEEP / 2 + (i * SWEEP) / (SEGMENTS - 1);
          return (
            <rect
              key={i}
              x={cx - 7.5}
              y={cy - r - 19}
              width={15}
              height={38}
              rx={7.5}
              transform={`rotate(${angle} ${cx} ${cy})`}
              fill={i < lit ? TONE[tone] : 'rgb(var(--surface-3))'}
              stroke={i < lit ? 'none' : 'rgb(var(--border))'}
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="absolute inset-x-0 top-[47%] text-center">
        <div className="text-sm text-content-muted">{label}</div>
        <div className="mt-0.5 text-[42px] leading-none font-display font-bold num-display">{value}</div>
      </div>
    </div>
  );
}
