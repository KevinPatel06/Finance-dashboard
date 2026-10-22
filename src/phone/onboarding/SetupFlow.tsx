import { useEffect, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import type {
  AppSettings,
  Bill,
  BudgetMonthView,
  BudgetStatus,
  Debt,
  ExpenseCategory,
  PayFrequency,
  RecurringExpense,
  SavingsGoal,
} from '@shared/types';
import { guaranteedPerMonth } from '@shared/paydays';
import { monthlyEquivalent } from '@shared/budgetExport';
import { interestPerMonth } from '@/lib/debtMath';
import { fmtDate } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi } from '../data';
import { currentMonth, monthLabel, nextBudgetLabel } from '../dates';
import { money } from '../format';
import { Banner, BigButton, Chip, Group, MoneyInput, PCard, parseMoney, Row } from '../ui/kit';
import CategoryEditor from '../budget/CategoryEditor';
import PlanForm, { draftToLines, draftSum, emptyDraft, draftFromView, type PlanDraft } from '../budget/PlanForm';
import FundEditor from '../funds/FundEditor';
import RecurringEditor from '../recurring/RecurringEditor';
import { scheduleLabel } from '../recurring/schedule';
import { PAY_FREQUENCY_LABEL } from '../settings/PhoneSettingsExtras';
import DebtSheet from './DebtSheet';
import DoneRing from './DoneRing';
import ExportPanel from './ExportPanel';
import FlowShell from './FlowShell';

const STEPS = ['period', 'pay', 'recurring', 'debts', 'funds', 'export', 'plan', 'done'] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  period: 'Budget period',
  pay: 'Your pay',
  recurring: 'Recurring',
  debts: 'Debts',
  funds: 'Savings',
  export: 'Get advice',
  plan: 'Your plan',
  done: '',
};

const RECURRING_IDEAS = ['Rent', 'Phone', 'Internet', 'Hydro', 'Insurance', 'Netflix', 'Spotify', 'Gym'];
const FUND_IDEAS = ['Emergency fund', 'Vacation', 'New car', 'Gifts'];

/**
 * Builds (or rebuilds) the monthly budget: period → pay → recurring → debts →
 * funds → export for an AI → plan → done. Recurring, debts and funds save as
 * they're added; the plan is written and confirmed at the end.
 */
export default function SetupFlow({
  onDone,
  onExit,
  fresh,
}: {
  onDone: () => void;
  /** Back out of the first step (existing users only). */
  onExit?: () => void;
  /** First run — completes onboarding at the end. */
  fresh?: boolean;
}) {
  const toast = useToast();
  const { completeOnboarding } = useTheme();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const month = currentMonth();

  // ---- pay
  const { data: settings } = useApi<AppSettings>(() => window.api.settings.get());
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<PayFrequency>('biweekly');
  const [next, setNext] = useState('');
  useEffect(() => {
    if (!settings) return;
    setAmount(settings.pay_amount != null ? String(settings.pay_amount) : '');
    setFreq(settings.pay_frequency);
    setNext(settings.next_paycheck_date ?? '');
  }, [settings]);

  // ---- lists
  const { data: recurring, reload: reloadRec } = useApi<RecurringExpense[]>(() => window.api.recurringExpenses.list());
  const { data: bills } = useApi<Bill[]>(() => window.api.bills.list());
  const { data: debts, reload: reloadDebts } = useApi<Debt[]>(() => window.api.debts.list());
  const { data: funds, reload: reloadFunds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: categories, reload: reloadCats } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const [sheet, setSheet] = useState<null | { kind: 'recurring'; name?: string } | { kind: 'debt' } | { kind: 'fund'; name?: string } | { kind: 'category' }>(null);

  // ---- plan
  const [view, setView] = useState<BudgetMonthView | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const go = async (to: number) => {
    if (STEPS[i] === 'pay' && to > i) {
      await window.api.settings.update({ pay_amount: parseMoney(amount) || null, pay_frequency: freq, next_paycheck_date: next || null });
    }
    if (STEPS[to] === 'plan') {
      const v = (await window.api.budget.month(month)) as BudgetMonthView;
      setView(v);
      if (v.status !== 'none') {
        setDraft(draftFromView(v));
      } else {
        // An existing user's old per-category caps make a sensible start.
        const caps = (await window.api.budgets.list()) as BudgetStatus[];
        setDraft({ ...emptyDraft(), spend: Object.fromEntries(caps.map((c) => [c.category_id, String(c.monthly_limit)])) });
      }
    }
    setI(to);
  };

  const finish = async () => {
    setBusy(true);
    try {
      await window.api.budget.savePlan(month, draftToLines(draft), true);
      if (fresh) completeOnboarding();
      toast.success('Your budget is set. 🎉');
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const monthly = parseMoney(amount) * guaranteedPerMonth(freq);
  const back = i > 0 ? () => setI(i - 1) : onExit;

  const continueBtn = (label = 'Continue', disabled = false) => (
    <BigButton icon={ArrowRight} disabled={disabled} onClick={() => void go(i + 1)}>
      {label}
    </BigButton>
  );

  // ------------------------------------------------------------------ steps

  if (step === 'done' && view) {
    const fixed = view.recurring.total;
    const debt = draftSum(draft.debt);
    const savings = draftSum(draft.fund);
    const spendNeeds = (categories ?? []).filter((c) => c.kind === 'need').reduce((s, c) => s + parseMoney(draft.spend[c.id] ?? ''), 0);
    const spendWants = draftSum(draft.spend) - spendNeeds;
    const remaining = view.income - fixed - debt - savings - spendNeeds - spendWants;
    return (
      <FlowShell
        footer={
          <BigButton icon={ArrowRight} onClick={finish} disabled={busy}>
            {busy ? 'Setting up…' : 'Go to my budget'}
          </BigButton>
        }
      >
        <div className="text-center pt-6">
          <div className="text-6xl">👏</div>
          <h1 className="text-[28px] font-display font-bold mt-4">You're all set up!</h1>
          <p className="text-content-muted mt-2">You can change any of this later.</p>
        </div>
        <DoneRing
          total={view.income}
          caption={`budget starts ${monthLabel(month)}`}
          parts={[
            { label: 'Recurring', value: fixed, color: '#94a3b8' },
            { label: 'Debt', value: debt, color: '#f87171' },
            { label: 'Savings', value: savings, color: '#34d399' },
            { label: 'Needs', value: spendNeeds, color: '#60a5fa' },
            { label: 'Wants', value: spendWants, color: '#f472b6' },
            { label: 'Remaining', value: Math.max(0, remaining), color: 'rgb(var(--surface-3))' },
          ]}
        />
      </FlowShell>
    );
  }

  return (
    <FlowShell step={i + 1} total={STEPS.length - 1} title={TITLES[step]} onBack={back} footer={footerFor()}>
      {step === 'period' && (
        <div className="text-center">
          <div className="text-7xl pt-4">🗓️</div>
          <h1 className="text-[28px] font-display font-bold mt-5">Your budget runs monthly</h1>
          <p className="text-content-muted mt-3 leading-relaxed">
            From the 1st to the last day of the month — the same way rent and most bills work. We plan with the
            paychecks every month is guaranteed to get. If a month brings an extra one, it's a bonus you decide what
            to do with.
          </p>
          <PCard className="mt-8 p-5">
            <div className="text-sm text-content-muted">Your first budget</div>
            <div className="text-[30px] font-display font-bold mt-1">{monthLabel(month)}</div>
            <div className="text-sm text-content-subtle mt-1">The next one starts {nextBudgetLabel(month)}</div>
          </PCard>
        </div>
      )}

      {step === 'pay' && (
        <div>
          <h1 className="text-[26px] font-display font-bold">How much do you take home?</h1>
          <p className="text-content-muted mt-2">Your average paycheck after tax. An estimate is fine.</p>
          <PCard className="mt-6 p-5">
            <MoneyInput big value={amount} onChange={setAmount} autoFocus ariaLabel="Take-home per paycheck" />
            <div className="text-center text-sm text-content-subtle mt-1">per paycheck</div>
            <div className="grid grid-cols-2 gap-2 mt-6">
              {(Object.keys(PAY_FREQUENCY_LABEL) as PayFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={cn(
                    'rounded-2xl border px-3 py-3 text-[15px] font-medium transition',
                    freq === f ? 'border-brand bg-brand-soft text-brand' : 'border-border bg-surface-3/60'
                  )}
                >
                  {PAY_FREQUENCY_LABEL[f]}
                </button>
              ))}
            </div>
            <label className="label mt-5">Next payday</label>
            <input type="date" className="input text-base" value={next} onChange={(e) => setNext(e.target.value)} />
            {!next && <p className="text-xs text-content-subtle mt-1.5">Pick your next payday to continue.</p>}
          </PCard>
          {monthly > 0 && (
            <p className="text-center mt-5 text-[15px]">
              That's <span className="font-bold num">{money(monthly)}</span> a month to plan with
              <span className="text-content-muted"> ({guaranteedPerMonth(freq)} paycheck{guaranteedPerMonth(freq) > 1 ? 's' : ''})</span>.
            </p>
          )}
        </div>
      )}

      {step === 'recurring' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-[26px] font-display font-bold">What comes out every month?</h1>
            <p className="text-content-muted mt-2">
              Rent, phone, subscriptions, insurance — anything on a schedule. These come off the top before you budget
              the rest, and log themselves on their dates.
            </p>
          </div>
          {bills && bills.length > 0 && (recurring ?? []).length === 0 && (
            <Banner
              tone="brand"
              icon="📥"
              title={`Use your ${bills.length} bill${bills.length === 1 ? '' : 's'}?`}
              action={
                <Chip
                  active
                  onClick={async () => {
                    await window.api.recurringExpenses.importBills();
                    await reloadRec();
                  }}
                >
                  Import from Bills
                </Chip>
              }
            >
              Each starts at its next due date.
            </Banner>
          )}
          <div className="flex flex-wrap gap-2">
            {RECURRING_IDEAS.filter((n) => !(recurring ?? []).some((r) => r.description.toLowerCase() === n.toLowerCase())).map((n) => (
              <Chip key={n} icon={Plus} onClick={() => setSheet({ kind: 'recurring', name: n })}>
                {n}
              </Chip>
            ))}
          </div>
          {(recurring ?? []).length > 0 && (
            <Group>
              {(recurring ?? []).map((r) => (
                <Row key={r.id} emoji={r.emoji} color="#64748b" title={r.description} subtitle={scheduleLabel(r)} value={money(r.amount)} />
              ))}
            </Group>
          )}
          <button
            onClick={() => setSheet({ kind: 'recurring' })}
            className="w-full py-3.5 rounded-[20px] border-2 border-dashed border-border text-[15px] font-semibold text-content-muted"
          >
            + Add recurring expense
          </button>
          {(recurring ?? []).length > 0 && (
            <p className="text-center text-sm text-content-muted">
              About <span className="font-semibold text-content num">{money((recurring ?? []).reduce((s, r) => s + monthlyEquivalent(r), 0))}</span> a month
            </p>
          )}
        </div>
      )}

      {step === 'debts' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-[26px] font-display font-bold">Any debts or credit cards?</h1>
            <p className="text-content-muted mt-2">We'll work out how much interest each one costs you a month.</p>
          </div>
          {(debts ?? []).length > 0 && (
            <Group>
              {(debts ?? []).map((d) => (
                <Row
                  key={d.id}
                  emoji="💳"
                  color="#ef4444"
                  title={d.name}
                  subtitle={`${money(d.current_balance)} at ${d.interest_rate}%`}
                  value={`≈ ${money(interestPerMonth(d))}`}
                  valueSub="interest / mo"
                />
              ))}
            </Group>
          )}
          <button
            onClick={() => setSheet({ kind: 'debt' })}
            className="w-full py-3.5 rounded-[20px] border-2 border-dashed border-border text-[15px] font-semibold text-content-muted"
          >
            + Add a debt
          </button>
        </div>
      )}

      {step === 'funds' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-[26px] font-display font-bold">What are you saving for?</h1>
            <p className="text-content-muted mt-2">
              Funds hold money for a goal. You'll decide how much goes into each one every month.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FUND_IDEAS.filter((n) => !(funds ?? []).some((f) => f.name.toLowerCase() === n.toLowerCase())).map((n) => (
              <Chip key={n} icon={Plus} onClick={() => setSheet({ kind: 'fund', name: n })}>
                {n}
              </Chip>
            ))}
          </div>
          {(funds ?? []).length > 0 && (
            <Group>
              {(funds ?? []).map((f) => (
                <Row
                  key={f.id}
                  emoji={f.emoji}
                  color={f.color}
                  title={f.name}
                  subtitle={f.target_date ? `by ${fmtDate(f.target_date)}` : 'No deadline'}
                  value={money(f.target_amount)}
                />
              ))}
            </Group>
          )}
          <button
            onClick={() => setSheet({ kind: 'fund' })}
            className="w-full py-3.5 rounded-[20px] border-2 border-dashed border-border text-[15px] font-semibold text-content-muted"
          >
            + Add a fund
          </button>
        </div>
      )}

      {step === 'export' && (
        <div className="space-y-4">
          <div>
            <h1 className="text-[26px] font-display font-bold">Want a second opinion?</h1>
            <p className="text-content-muted mt-2">
              Share your numbers with an AI and ask how to split your money. Optional — you can do it later from More.
            </p>
          </div>
          <ExportPanel />
        </div>
      )}

      {step === 'plan' && view && categories && funds && debts && (
        <div>
          <h1 className="text-[26px] font-display font-bold text-center">Give every dollar a job</h1>
          <PlanForm
            income={view.income}
            fixed={view.recurring.total}
            draft={draft}
            onChange={setDraft}
            categories={categories}
            funds={funds}
            debts={debts}
            onAddCategory={() => setSheet({ kind: 'category' })}
            onAddFund={() => setSheet({ kind: 'fund' })}
          />
          <p className="text-center text-sm text-content-subtle mt-4">If you want to set this later, just tap Continue.</p>
        </div>
      )}

      {sheet?.kind === 'recurring' && (
        <RecurringEditor
          initial={{ description: sheet.name }}
          onClose={() => setSheet(null)}
          onSaved={() => void reloadRec()}
        />
      )}
      {sheet?.kind === 'debt' && (
        <DebtSheet
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void reloadDebts();
          }}
        />
      )}
      {sheet?.kind === 'fund' && (
        <FundEditor
          initialName={sheet.name}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void reloadFunds();
          }}
        />
      )}
      {sheet?.kind === 'category' && (
        <CategoryEditor
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void reloadCats();
          }}
        />
      )}
    </FlowShell>
  );

  function footerFor() {
    switch (step) {
      case 'pay':
        return continueBtn('Continue', !(parseMoney(amount) > 0) || !next);
      case 'recurring':
        return continueBtn((recurring ?? []).length ? 'Continue' : 'Skip for now');
      case 'debts':
        return continueBtn((debts ?? []).length ? 'Continue' : 'No debts');
      case 'funds':
        return continueBtn((funds ?? []).length ? 'Continue' : 'Skip for now');
      case 'export':
        return continueBtn('Continue');
      default:
        return continueBtn();
    }
  }
}

