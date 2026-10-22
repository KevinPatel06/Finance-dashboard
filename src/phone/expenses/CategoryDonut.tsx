import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';
import { useTheme } from '@/lib/theme';
import { fillTint } from '../ui/pastel';
import { money } from '../format';

export interface DonutSlice {
  key: string;
  emoji: string | null;
  color: string;
  total: number;
}

const RAD = Math.PI / 180;

/** Spending by category as a rounded donut with each slice's emoji on it. */
export default function CategoryDonut({ slices, total }: { slices: DonutSlice[]; total: number }) {
  const { theme } = useTheme();
  const data = slices.filter((s) => s.total > 0);

  return (
    <div className="relative h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data.length ? data : [{ key: 'none', emoji: null, color: '#94a3b8', total: 1 }]}
            dataKey="total"
            nameKey="key"
            innerRadius={86}
            outerRadius={118}
            paddingAngle={data.length > 1 ? 3 : 0}
            cornerRadius={14}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
            labelLine={false}
            label={(p: { cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number; percent: number; index: number }) => {
              const s = data[p.index];
              if (!s || p.percent < 0.045) return null;
              const r = (p.innerRadius + p.outerRadius) / 2;
              return (
                <text
                  x={p.cx + r * Math.cos(-p.midAngle * RAD)}
                  y={p.cy + r * Math.sin(-p.midAngle * RAD)}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={17}
                >
                  {s.emoji ?? '❔'}
                </text>
              );
            }}
          >
            {(data.length ? data : [{ key: 'none', color: '#94a3b8' }]).map((s) => (
              <Cell key={s.key} fill={data.length ? fillTint(s.color, theme) : 'rgb(var(--surface-3))'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <div className="text-center">
          <div className="text-sm text-content-muted">Total spent</div>
          <div className="text-[28px] font-display font-bold num-display">{money(total)}</div>
        </div>
      </div>
    </div>
  );
}
