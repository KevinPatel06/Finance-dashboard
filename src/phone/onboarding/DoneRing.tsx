import { money } from '../format';

/** The "You're all set up" ring: how the month's income is split, with a legend. */
export default function DoneRing({
  total,
  caption,
  parts,
}: {
  total: number;
  caption: string;
  parts: Array<{ label: string; value: number; color: string }>;
}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const sum = parts.reduce((s, p) => s + Math.max(0, p.value), 0) || 1;
  let offset = 0;

  return (
    <div className="mt-8">
      <div className="flex items-center gap-5 justify-center">
        <svg viewBox="0 0 128 128" className="w-32 h-32 -rotate-90 shrink-0" aria-hidden>
          <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(var(--surface-3))" strokeWidth="14" />
          {parts.map((p) => {
            const len = (Math.max(0, p.value) / sum) * c;
            const el = (
              <circle
                key={p.label}
                cx="64"
                cy="64"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="14"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div>
          <div className="text-sm text-content-muted">Monthly income</div>
          <div className="text-[30px] font-display font-bold num leading-tight">{money(total)}</div>
          <div className="text-sm text-content-subtle">{caption}</div>
        </div>
      </div>
      <div className="mt-8 space-y-3 px-2">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-md shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-[17px] font-medium">{p.label}</span>
            <span className="flex-1 border-b-2 border-dotted border-border mx-1 translate-y-1" />
            <span className="text-[17px] font-semibold num">{money(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
