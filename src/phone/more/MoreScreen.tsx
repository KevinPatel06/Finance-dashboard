import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { Group, LargeHeader, PCard, Row, SectionTitle } from '../ui/kit';

const LINKS: Array<{ to: string; emoji: string; color: string; title: string; subtitle: string }> = [
  { to: '/recurring', emoji: '🔁', color: '#64748b', title: 'Recurring expenses', subtitle: 'Rent, subscriptions, insurance' },
  { to: '/payoff', emoji: '💳', color: '#ef4444', title: 'Payoff', subtitle: 'Debts, interest and payoff dates' },
  { to: '/registered', emoji: '🏦', color: '#3b82f6', title: 'Registered accounts', subtitle: 'RRSP, TFSA and FHSA room' },
  { to: '/reports', emoji: '📊', color: '#8b5cf6', title: 'Reports', subtitle: 'Charts across months' },
  { to: '/expenses/week', emoji: '🗞️', color: '#f59e0b', title: 'Weekly report', subtitle: 'Last week at a glance' },
  { to: '/pay-history', emoji: '💵', color: '#10b981', title: 'Pay history', subtitle: 'Every paycheck you’ve confirmed' },
];

/** Everything that isn't Budget or Expenses. */
export default function MoreScreen() {
  const navigate = useNavigate();
  const { userName } = useTheme();
  const initial = userName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="space-y-4">
      <LargeHeader title="More" />

      <PCard onClick={() => navigate('/settings')} className="px-4 py-3.5 flex items-center gap-3">
        <span className="w-12 h-12 rounded-full bg-gradient-to-br from-brand to-brand-hover grid place-items-center text-white dark:text-slate-950 text-lg font-semibold">
          {initial}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold truncate">{userName.trim() || 'You'}</div>
          <div className="text-sm text-content-subtle">Settings, pay, reminders, appearance</div>
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </PCard>

      <Group>
        {LINKS.map((l) => (
          <Row key={l.to} emoji={l.emoji} color={l.color} title={l.title} subtitle={l.subtitle} chevron onClick={() => navigate(l.to)} />
        ))}
      </Group>

      <SectionTitle>Plan</SectionTitle>
      <Group>
        <Row
          emoji="✨"
          color="#ec4899"
          title="Get advice from your AI"
          subtitle="Export your numbers for ChatGPT, Claude or Gemini"
          chevron
          onClick={() => navigate('/export')}
        />
        <Row
          emoji="🧭"
          color="#06b6d4"
          title="Set up budget again"
          subtitle="Walk through pay, recurring, debts and funds"
          chevron
          onClick={() => navigate('/setup')}
        />
      </Group>
    </div>
  );
}
