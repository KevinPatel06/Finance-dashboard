import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import type { AppSettings, BudgetMonthView, RegisteredAccount, SavingsGoal } from '@shared/types';
import SegmentedControl from '@/components/ui/SegmentedControl';
import { fmtDate } from '@/lib/format';
import { useApi, useRefresh } from '../data';
import { money, pct } from '../format';
import { Bar, Chip, EmojiAvatar, Group, PCard } from '../ui/kit';
import FundEditor from '../funds/FundEditor';
import AccountCard from '../contributions/AccountCard';
import AccountEditor from '../contributions/AccountEditor';
import DepositSheet from '../contributions/DepositSheet';
import { KIND_META, KIND_ORDER } from '../contributions/meta';

type Filter = 'active' | 'completed' | 'plan';

function Header({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-1">
      <h2 className="text-[17px] font-display font-semibold">{title}</h2>
      {right}
    </div>
  );
}

function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-11 inline-flex items-center gap-1 text-[15px] font-medium text-brand-ink">
      <Plus size={17} /> {children}
    </button>
  );
}

/**
 * Saving: this month's deposits still to make, then each registered account's
 * tax year (optional — "Not for me" hides them), then funds with their filters
 * and progress cards.
 */
export default function SavingTab({ view }: { view: BudgetMonthView }) {
  const navigate = useNavigate();
  const { bump } = useRefresh();
  const [filter, setFilter] = useState<Filter>('active');
  const [adding, setAdding] = useState(false);
  const [addingAccount, setAddingAccount] = useState(false);
  const [depositFor, setDepositFor] = useState<RegisteredAccount | null>(null);
  const [newYearFor, setNewYearFor] = useState<RegisteredAccount | null>(null);
  const { data: active, reload } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: done } = useApi<SavingsGoal[]>(() => window.api.goals.listArchived());
  const { data: accounts } = useApi<RegisteredAccount[]>(() => window.api.registered.list());
  const { data: settings } = useApi<AppSettings>(() => window.api.settings.get());

  if (!active || !done || !accounts || !settings) return null;
  const inPlan = new Set(view.lines.fund.map((l) => l.goal_id));
  const planned = new Map(view.lines.fund.map((l) => [l.goal_id, l.amount]));
  const shown =
    filter === 'completed' ? done : filter === 'plan' ? active.filter((g) => inPlan.has(g.id)) : active;
  const totalSaved = active.reduce((s, g) => s + g.current_amount, 0);
  const missingKinds = KIND_ORDER.filter((k) => !accounts.some((a) => a.kind === k));
  const hidden = settings.contributions_hidden && accounts.length === 0;

  const setHidden = async (v: boolean) => {
    await window.api.settings.update({ contributions_hidden: v });
    bump();
  };

  // This month's deposits still to make, each with its own Log button.
  const due = view.lines.contribution
    .filter((c) => c.amount > 0 && c.left > 0)
    .map((c) => ({ line: c, account: accounts.find((a) => a.id === c.account_id) }))
    .filter((d): d is { line: (typeof view.lines.contribution)[number]; account: RegisteredAccount } => !!d.account);

  return (
    <div className="space-y-3">
      {!hidden && due.length > 0 && (
        <>
          <Header title="To deposit this month" />
          <Group>
            {due.map(({ line: c, account: a }) => (
              <div key={c.account_id} className="flex items-center gap-3 px-4 py-3">
                <EmojiAvatar emoji={KIND_META[a.kind].emoji} color={KIND_META[a.kind].color} />
                <div className="flex-1 min-w-0">
                  <div className="text-base font-semibold truncate">{c.label}</div>
                  <div className="text-sm text-content-muted num">
                    {c.deposited > 0 ? `${money(c.deposited)} of ${money(c.amount)} deposited` : `${money(c.amount)} due`}
                  </div>
                </div>
                <button
                  onClick={() => setDepositFor(a)}
                  className="press [--dip:0.94] min-h-11 px-4 rounded-full bg-content text-surface text-sm font-semibold"
                  aria-label={`Log a ${c.label} deposit`}
                >
                  Log
                </button>
              </div>
            ))}
          </Group>
          <div className="h-2" />
        </>
      )}
      {!hidden && (
        <>
          <Header
            title={accounts.length > 0 ? 'This tax year' : 'Contributions'}
            right={
              accounts.length > 0 && missingKinds.length > 0 ? (
                <AddButton onClick={() => setAddingAccount(true)}>Add account</AddButton>
              ) : undefined
            }
          />
          {accounts.length === 0 ? (
            <PCard className="p-4">
              <p className="text-[15px]">Have an RRSP, TFSA or FHSA? Add it to plan this year's contributions.</p>
              <div className="flex gap-2 mt-3">
                <Chip active icon={Plus} onClick={() => setAddingAccount(true)}>
                  Add account
                </Chip>
                <Chip onClick={() => void setHidden(true)}>Not for me</Chip>
              </div>
            </PCard>
          ) : (
            accounts.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                onOpen={() => navigate(`/account/${a.id}`)}
                onDeposit={() => setDepositFor(a)}
                onStartYear={() => setNewYearFor(a)}
              />
            ))
          )}
          <div className="h-2" />
        </>
      )}

      <Header title="Funds" right={<AddButton onClick={() => setAdding(true)}>Add fund</AddButton>} />
      <div className="px-1 -mt-1 text-sm text-content-muted">
        Total saved: <span className="text-content font-semibold num">{money(totalSaved)}</span>
      </div>

      <SegmentedControl
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'active', label: 'Active' },
          { value: 'plan', label: 'In this budget' },
          { value: 'completed', label: 'Completed' },
        ]}
      />

      {shown.length === 0 && (
        <PCard className="p-5 text-center text-sm text-content-muted">
          {filter === 'completed'
            ? 'Funds you mark complete land here.'
            : filter === 'plan'
              ? "No funds in this month's plan."
              : 'No funds yet — add one for anything you’re saving toward.'}
        </PCard>
      )}

      {shown.map((g) => (
        <FundCard key={g.id} goal={g} planned={planned.get(g.id)} onClick={() => navigate(`/fund/${g.id}`)} />
      ))}

      {hidden && (
        <button
          onClick={() => setAddingAccount(true)}
          className="block w-full pt-3 text-center text-sm font-medium text-brand"
        >
          Add an RRSP, TFSA or FHSA
        </button>
      )}

      {adding && (
        <FundEditor
          onClose={() => setAdding(false)}
          onSaved={(g) => {
            setAdding(false);
            void reload();
            navigate(`/fund/${g.id}`);
          }}
        />
      )}
      {addingAccount && (
        <AccountEditor
          mode="add"
          kinds={missingKinds}
          onClose={() => setAddingAccount(false)}
          onSaved={(a) => {
            setAddingAccount(false);
            if (settings.contributions_hidden) void setHidden(false);
            navigate(`/account/${a.id}`);
          }}
        />
      )}
      {depositFor && <DepositSheet account={depositFor} onClose={() => setDepositFor(null)} />}
      {newYearFor && (
        <AccountEditor
          mode="newYear"
          account={newYearFor}
          onClose={() => setNewYearFor(null)}
          onSaved={() => setNewYearFor(null)}
        />
      )}
    </div>
  );
}

export function FundCard({
  goal: g,
  planned,
  onClick,
}: {
  goal: SavingsGoal;
  planned?: number;
  onClick: () => void;
}) {
  const p = pct(g.current_amount, g.target_amount);
  const reached = g.current_amount >= g.target_amount;
  return (
    <PCard onClick={onClick} className="px-4 pt-3.5 pb-3">
      <div className="flex items-center gap-3">
        <EmojiAvatar emoji={g.emoji} color={g.color} />
        <div className="flex-1 min-w-0">
          <div className="text-[17px] font-semibold truncate">{g.name}</div>
          {planned != null && planned > 0 && (
            <div className="text-xs text-content-subtle">+{money(planned)} this month</div>
          )}
        </div>
        <ChevronRight size={18} className="text-content-subtle" />
      </div>
      <div className="mt-3">
        <Bar pct={p} color={g.color} label={`${Math.floor(p)}% of the goal`} />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-[15px] num">
          <span className="font-semibold">{money(g.current_amount)}</span>
          <span className="text-content-muted"> of {money(g.target_amount)}</span>
        </span>
        <span className="text-sm text-content-muted text-right">
          {g.archived ? 'Completed' : reached ? 'Goal reached' : g.target_date ? `by ${fmtDate(g.target_date, 'd MMM yyyy')}` : 'no deadline'}
        </span>
      </div>
    </PCard>
  );
}
