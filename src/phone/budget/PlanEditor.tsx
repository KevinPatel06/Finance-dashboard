import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { BudgetMonthView, Debt, ExpenseCategory, Payday, SavingsGoal } from '@shared/types';
import { useToast } from '@/lib/ui';
import { useApi } from '../data';
import { friendlyDate, monthLabel, monthName, todayIso } from '../dates';
import { money } from '../format';
import MoneySheet from '../ui/MoneySheet';
import Sheet from '../ui/Sheet';
import { BigButton, Group, Row, SectionTitle } from '../ui/kit';
import FundEditor from '../funds/FundEditor';
import CategoryEditor from './CategoryEditor';
import PlanForm, { draftFromView, draftToLines, type PlanDraft } from './PlanForm';

/**
 * Edit the month's plan — or, for a draft month, review last month's copy and
 * confirm it ("Looks good"), which is when funds and debt payments apply.
 */
export default function PlanEditor({
  view: initial,
  review,
  onClose,
  onSaved,
}: {
  view: BudgetMonthView;
  review?: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState<PlanDraft>(() => draftFromView(initial));
  const [busy, setBusy] = useState(false);
  const [payday, setPayday] = useState<Payday | null>(null);
  const [adding, setAdding] = useState<null | 'category' | 'fund'>(null);

  const { data: categories, reload: reloadCats } = useApi<ExpenseCategory[]>(() =>
    window.api.expenseCategories.list()
  );
  const { data: funds, reload: reloadFunds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());

  const confirming = view.status !== 'confirmed';
  const refreshView = async () => setView((await window.api.budget.month(view.month)) as BudgetMonthView);

  const save = async () => {
    setBusy(true);
    try {
      await window.api.budget.savePlan(view.month, draftToLines(draft), true);
      toast.success(confirming ? `${monthName(view.month)} budget is set.` : 'Plan saved.');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      full
      autoFocus={false}
      onClose={onClose}
      title={review ? `Start your ${monthName(view.month)} budget` : 'Edit plan'}
      subtitle={monthLabel(view.month)}
      footer={
        <BigButton onClick={save} disabled={busy}>
          {busy ? 'Saving…' : confirming ? `Looks good — start ${monthName(view.month)}` : 'Save plan'}
        </BigButton>
      }
    >
      {review && (
        <p className="text-center text-sm text-content-muted px-4 pt-1">
          This is last month's plan. Change anything that's different this month, then confirm.
        </p>
      )}

      <SectionTitle>Income</SectionTitle>
      <Group>
        {view.paydays.map((p) => (
          <Row
            key={p.date}
            emoji={p.kind === 'bonus' ? '🎉' : '💵'}
            color="#10b981"
            title={`${friendlyDate(p.date)}${p.kind === 'bonus' ? ' · bonus' : ''}`}
            subtitle={p.paycheck ? 'Confirmed' : p.date <= todayIso() ? 'Not confirmed yet' : 'Expected'}
            value={money(p.paycheck ? p.paycheck.amount : p.kind === 'regular' ? p.expected : 0)}
            valueTone={p.paycheck ? 'default' : 'muted'}
            chevron
            onClick={() => setPayday(p)}
          />
        ))}
        {view.paydays.length === 0 && (
          <Row
            emoji="💵"
            color="#10b981"
            title="No pay set up"
            subtitle="Add your pay in Settings"
            chevron
            onClick={() => navigate('/settings')}
          />
        )}
      </Group>

      <SectionTitle right={<span className="text-sm text-content-muted num">{money(view.recurring.total)}</span>}>
        Recurring
      </SectionTitle>
      <Group>
        {view.recurring.items.length === 0 && (
          <Row emoji="🔁" color="#64748b" title="No recurring expenses" chevron onClick={() => navigate('/recurring')} />
        )}
        {view.recurring.items.map((r) => (
          <Row
            key={`${r.recurring_id}-${r.date}`}
            emoji={r.emoji}
            color="#64748b"
            title={r.description}
            subtitle={friendlyDate(r.date)}
            value={money(r.amount)}
            valueTone="muted"
          />
        ))}
      </Group>

      {categories && funds && debts && (
        <PlanForm
          income={view.income}
          fixed={view.recurring.total}
          draft={draft}
          onChange={setDraft}
          categories={categories}
          funds={funds}
          debts={debts}
          onAddCategory={() => setAdding('category')}
          onAddFund={() => setAdding('fund')}
        />
      )}

      {payday && (
        <MoneySheet
          title={`Paycheck · ${friendlyDate(payday.date)}`}
          subtitle={payday.paycheck ? 'Correct the amount you were paid.' : 'How much did you get?'}
          initial={payday.paycheck?.amount ?? payday.expected}
          allowZero
          cta="Confirm"
          onClose={() => setPayday(null)}
          onSave={async (amount) => {
            await window.api.paydays.confirm(payday.date, amount);
            setPayday(null);
            await refreshView();
          }}
        />
      )}
      {adding === 'category' && (
        <CategoryEditor
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null);
            await reloadCats();
          }}
        />
      )}
      {adding === 'fund' && (
        <FundEditor
          onClose={() => setAdding(null)}
          onSaved={async () => {
            setAdding(null);
            await reloadFunds();
          }}
        />
      )}
    </Sheet>
  );
}
