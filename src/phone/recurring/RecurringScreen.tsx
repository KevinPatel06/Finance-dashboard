import { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Bill, ExpenseCategory, RecurringExpense } from '@shared/types';
import { monthlyEquivalent } from '@shared/budgetExport';
import { useToast } from '@/lib/ui';
import { useApi, useRefresh } from '../data';
import { money } from '../format';
import { Banner, Chip, CircleButton, Group, NavHeader, PCard, Row, SectionTitle } from '../ui/kit';
import RecurringEditor from './RecurringEditor';
import { scheduleLabel } from './schedule';

/** Everything that repeats — logged automatically and taken off the top of the budget. */
export default function RecurringScreen() {
  const toast = useToast();
  const { bump } = useRefresh();
  const { data: items } = useApi<RecurringExpense[]>(() => window.api.recurringExpenses.list(true));
  const { data: cats } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: bills } = useApi<Bill[]>(() => window.api.bills.list());
  const [editing, setEditing] = useState<RecurringExpense | 'new' | null>(null);

  if (!items) return null;
  const active = items.filter((r) => r.archived === 0);
  const paused = items.filter((r) => r.archived === 1);
  const monthly = active.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const catById = new Map((cats ?? []).map((c) => [c.id, c]));
  const importable = (bills ?? []).filter(
    (b) => !items.some((r) => r.description.toLowerCase() === b.name.toLowerCase() && r.amount === b.amount)
  );

  const row = (r: RecurringExpense) => (
    <Row
      key={r.id}
      emoji={r.emoji}
      color={r.category_id != null ? catById.get(r.category_id)?.color ?? '#64748b' : '#64748b'}
      title={r.description}
      subtitle={r.archived ? 'Paused' : scheduleLabel(r)}
      value={money(r.amount)}
      valueTone={r.archived ? 'muted' : 'default'}
      onClick={() => setEditing(r)}
    />
  );

  return (
    <div className="space-y-4">
      <NavHeader
        title="Recurring Expenses"
        subtitle={`${active.length} expense${active.length === 1 ? '' : 's'}`}
        right={<CircleButton icon={Plus} label="Add recurring expense" tone="brand" onClick={() => setEditing('new')} />}
      />

      <PCard className="px-5 py-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-content-subtle">About</div>
          <div className="text-[22px] font-display font-bold num">{money(monthly)}</div>
        </div>
        <div className="text-sm text-content-muted text-right">
          a month, taken off
          <br />
          the top of your budget
        </div>
      </PCard>

      {importable.length > 0 && (
        <Banner
          tone="brand"
          icon="📥"
          title={`Bring in your ${importable.length} bill${importable.length === 1 ? '' : 's'}`}
          action={
            <Chip
              active
              onClick={async () => {
                const { imported } = (await window.api.recurringExpenses.importBills()) as { imported: number };
                toast.success(`Added ${imported} recurring expense${imported === 1 ? '' : 's'}.`);
                bump();
              }}
            >
              Import from Bills
            </Chip>
          }
        >
          Each one starts at its next due date, so nothing from the past is logged.
        </Banner>
      )}

      <SectionTitle>Active</SectionTitle>
      {active.length === 0 ? (
        <p className="text-sm text-content-subtle px-1">Nothing yet — add rent, subscriptions, insurance…</p>
      ) : (
        <Group>{active.map(row)}</Group>
      )}

      {paused.length > 0 && (
        <>
          <SectionTitle>Paused</SectionTitle>
          <Group>{paused.map(row)}</Group>
        </>
      )}

      {editing && (
        <RecurringEditor item={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
