import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  CreditCard,
  Home,
  Car,
  Landmark,
  HandCoins,
  TrendingDown,
  AlertTriangle,
  Users,
  ChevronDown,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  estimatePayoff,
  payoffSeries,
  interestPerMonth,
  fmtMonths,
  nextInterestHit,
  ordinal,
  FREQ_LABEL,
} from '@/lib/debtMath';
import type { Debt, DebtCompounding, DebtFrequency, DebtInput, DebtType } from '@shared/types';

const TYPE_META: Record<
  DebtType,
  { label: string; icon: any; color: string }
> = {
  credit_card: { label: 'Credit card', icon: CreditCard, color: '#ef4444' },
  mortgage: { label: 'Mortgage', icon: Home, color: '#3b82f6' },
  car_loan: { label: 'Car', icon: Car, color: '#f59e0b' },
  line_of_credit: { label: 'Line of credit', icon: Landmark, color: '#8b5cf6' },
  loan: { label: 'Loan', icon: HandCoins, color: '#10b981' },
};

export default function Payoff() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Debt | null>(null);

  const load = async () => {
    setDebts((await window.api.debts.list()) as Debt[]);
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    const balance = debts.reduce((a, d) => a + d.current_balance, 0);
    const monthlyInterest = debts.reduce((a, d) => a + interestPerMonth(d), 0);
    const yourMonthly = debts.reduce((a, d) => {
      const perYear =
        (d.payment_amount / Math.max(1, d.split_count)) *
        { weekly: 52, biweekly: 26, semi_monthly: 24, monthly: 12 }[d.payment_frequency];
      return a + perYear / 12;
    }, 0);
    return { balance, monthlyInterest, yourMonthly };
  }, [debts]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await window.api.debts.remove(pendingDelete.id);
    setPendingDelete(null);
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-content-muted">
          Track what you owe and watch it shrink. Payoff is separate from your bills and
          paychecks — it's a planning view.
        </p>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus size={16} /> Add debt
        </button>
      </div>

      {debts.length === 0 ? (
        <EmptyState
          icon={<TrendingDown size={26} />}
          title="Nothing to pay off"
          description="Add a credit card, mortgage, car loan, line of credit, or any loan to see payoff timelines and how extra payments speed things up."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Add your first
            </button>
          }
        />
      ) : (
        <>
          {/* Totals strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TotalCard label="Total owed" value={fmtMoney(totals.balance)} />
            <TotalCard
              label="Interest cost / month"
              value={fmtMoney(totals.monthlyInterest)}
              sub="what carrying this debt charges you"
            />
            <TotalCard
              label="Your payments / month"
              value={fmtMoney(totals.yourMonthly)}
              sub="your share, averaged monthly"
            />
          </div>

          <div className="space-y-4">
            {debts.map((d) => (
              <DebtCard
                key={d.id}
                debt={d}
                onEdit={() => setEditing(d)}
                onDelete={() => setPendingDelete(d)}
              />
            ))}
          </div>
        </>
      )}

      <DebtEditor
        open={showNew || !!editing}
        debt={editing}
        onClose={() => {
          setEditing(null);
          setShowNew(false);
        }}
        onSaved={() => {
          setEditing(null);
          setShowNew(false);
          load();
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this debt?"
        description={
          pendingDelete ? (
            <>
              <span className="text-content font-medium">{pendingDelete.name}</span> will be
              permanently removed from your payoff tracker.{' '}
              <span className="text-content">This cannot be undone.</span>
            </>
          ) : undefined
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

function TotalCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-5">
      <div className="text-xs text-content-muted uppercase tracking-wide font-medium">{label}</div>
      <div className="text-2xl font-display font-semibold num-display mt-1">{value}</div>
      {sub && <div className="text-xs text-content-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function DebtCard({
  debt,
  onEdit,
  onDelete,
}: {
  debt: Debt;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = TYPE_META[debt.type];
  const Icon = meta.icon;
  const revolving = debt.type === 'credit_card' || debt.type === 'line_of_credit';
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [extraStr, setExtraStr] = useState('');
  const extra = Number(extraStr) || 0;

  const est = estimatePayoff(
    debt.current_balance,
    debt.interest_rate,
    debt.payment_amount,
    debt.payment_frequency,
    debt.compounding
  );
  const estExtra =
    extra > 0
      ? estimatePayoff(
          debt.current_balance,
          debt.interest_rate,
          debt.payment_amount + extra,
          debt.payment_frequency,
          debt.compounding
        )
      : null;

  const yourShare = debt.payment_amount / Math.max(1, debt.split_count);
  const progress =
    debt.original_amount > debt.current_balance && debt.original_amount > 0
      ? ((debt.original_amount - debt.current_balance) / debt.original_amount) * 100
      : null;

  const series = useMemo(
    () =>
      showWhatIf
        ? payoffSeries(
            debt.current_balance,
            debt.interest_rate,
            debt.payment_amount,
            extra,
            debt.payment_frequency,
            debt.compounding
          )
        : [],
    [showWhatIf, debt, extra]
  );

  const monthsSaved =
    est && estExtra && !est.neverPaysOff && !estExtra.neverPaysOff
      ? est.months - estExtra.months
      : 0;
  const interestSaved =
    est && estExtra && Number.isFinite(est.totalInterest) && Number.isFinite(estExtra.totalInterest)
      ? est.totalInterest - estExtra.totalInterest
      : 0;

  return (
    <div className="card p-5 relative group">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-11 h-11 rounded-xl grid place-items-center text-white shrink-0"
            style={{ backgroundColor: meta.color }}
          >
            <Icon size={20} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-lg leading-tight truncate flex items-center gap-2">
              {debt.name}
              {debt.split_count > 1 && (
                <span className="pill bg-info/10 text-info shrink-0">
                  <Users size={10} /> Split ×{debt.split_count}
                </span>
              )}
            </div>
            <div className="text-xs text-content-muted">
              {meta.label} · {debt.interest_rate}% APR
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={onEdit} className="btn-ghost p-1.5" title="Edit">
            <Pencil size={15} />
          </button>
          <button onClick={onDelete} className="btn-ghost p-1.5 hover:text-danger" title="Delete">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Progress bar (when original amount known) */}
      {progress !== null && (
        <div className="mt-4">
          <div className="flex justify-between text-xs text-content-muted mb-1.5">
            <span>
              Paid off {fmtMoney(debt.original_amount - debt.current_balance)} of{' '}
              {fmtMoney(debt.original_amount)}
            </span>
            <span className="num">{progress.toFixed(1)}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: meta.color }}
            />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Stat label="Balance" value={fmtMoney(debt.current_balance)} />
        {revolving ? (
          <Stat
            label="How to pay"
            value="Via paychecks"
            sub="set an amount when logging one"
          />
        ) : (
          <Stat
            label={`${FREQ_LABEL[debt.payment_frequency]} payment`}
            value={fmtMoney(debt.payment_amount)}
            sub={debt.split_count > 1 ? `you pay ${fmtMoney(yourShare)}` : undefined}
          />
        )}
        <Stat
          label="Interest / month"
          value={fmtMoney(interestPerMonth(debt))}
          sub={
            revolving && debt.interest_day != null
              ? `hits the ${ordinal(debt.interest_day)} · next ${format(
                  nextInterestHit(debt.interest_day),
                  'MMM d'
                )}`
              : debt.type === 'credit_card'
                ? 'set an interest day to auto-charge'
                : undefined
          }
        />
        {est ? (
          est.neverPaysOff ? (
            <div className="rounded-lg p-3 bg-danger/10 text-danger">
              <div className="text-xs uppercase tracking-wide flex items-center gap-1">
                <AlertTriangle size={11} /> Warning
              </div>
              <div className="font-semibold text-xs mt-1 leading-snug">
                Payment doesn't cover interest — balance will grow
              </div>
            </div>
          ) : (
            <Stat
              label="Paid off"
              value={format(est.payoffDate, 'MMM yyyy')}
              sub={`${fmtMonths(est.months)} · ${fmtMoney(est.totalInterest)} interest`}
            />
          )
        ) : revolving ? (
          <Stat
            label="Paid off"
            value={debt.current_balance === 0 ? 'Done 🎉' : '—'}
            sub={debt.current_balance === 0 ? undefined : 'depends on what you pay'}
          />
        ) : (
          <Stat label="Paid off" value="—" sub="add a payment amount" />
        )}
      </div>

      {/* What-if toggle */}
      {est && !est.neverPaysOff && (
        <div className="mt-4">
          <button
            onClick={() => setShowWhatIf((v) => !v)}
            className="btn-ghost text-xs text-brand"
          >
            <TrendingDown size={13} />
            What if I paid more?
            <ChevronDown
              size={13}
              className={cn('transition-transform', showWhatIf && 'rotate-180')}
            />
          </button>

          {showWhatIf && (
            <div className="mt-3 rounded-xl border border-border p-4 space-y-4 animate-fade-in">
              <div className="flex items-end gap-3 flex-wrap">
                <div>
                  <label className="label">Extra per payment</label>
                  <input
                    className="input w-36 num"
                    type="number"
                    step="10"
                    min="0"
                    placeholder="0.00"
                    value={extraStr}
                    onChange={(e) => setExtraStr(e.target.value)}
                  />
                </div>
                {estExtra && !estExtra.neverPaysOff && extra > 0 && (
                  <div className="flex gap-2 flex-wrap pb-1">
                    <span className="pill bg-success/15 text-success">
                      Paid off {fmtMonths(monthsSaved)} sooner
                    </span>
                    <span className="pill bg-success/15 text-success">
                      Saves {fmtMoney(interestSaved)} in interest
                    </span>
                    <span className="pill bg-surface-3 text-content-muted">
                      New payoff: {format(estExtra.payoffDate, 'MMM yyyy')}
                    </span>
                  </div>
                )}
              </div>

              <div className="h-56">
                <ResponsiveContainer>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--border))" />
                    <XAxis
                      dataKey="month"
                      stroke="rgb(var(--content-muted))"
                      fontSize={11}
                      tickFormatter={(m: number) =>
                        m >= 12 ? `${Math.round(m / 12)}y` : `${m}m`
                      }
                    />
                    <YAxis
                      stroke="rgb(var(--content-muted))"
                      fontSize={11}
                      tickFormatter={(v: number) =>
                        v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgb(var(--surface-2))',
                        border: '1px solid rgb(var(--border))',
                        borderRadius: 8,
                      }}
                      labelFormatter={(m: any) => `${fmtMonths(Number(m))} from now`}
                      formatter={(v: any) => fmtMoney(Number(v))}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="base"
                      name="Current payment"
                      stroke="rgb(var(--content-subtle))"
                      strokeWidth={2}
                      dot={false}
                    />
                    {extra > 0 && (
                      <Line
                        type="monotone"
                        dataKey="extra"
                        name={`+${fmtMoney(extra)} extra`}
                        stroke="rgb(var(--brand))"
                        strokeWidth={2}
                        dot={false}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {debt.notes && <div className="mt-3 text-xs text-content-subtle">{debt.notes}</div>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg p-3 bg-surface-3">
      <div className="text-xs text-content-muted uppercase tracking-wide">{label}</div>
      <div className="font-semibold num mt-0.5">{value}</div>
      {sub && <div className="text-xs text-content-subtle mt-0.5">{sub}</div>}
    </div>
  );
}

function DebtEditor({
  open,
  debt,
  onClose,
  onSaved,
}: {
  open: boolean;
  debt: Debt | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<DebtType>('credit_card');
  const [original, setOriginal] = useState('');
  const [balance, setBalance] = useState('');
  const [rate, setRate] = useState('');
  const [payment, setPayment] = useState('');
  const [frequency, setFrequency] = useState<DebtFrequency>('monthly');
  const [split, setSplit] = useState('1');
  const [interestDay, setInterestDay] = useState<string>('');
  const [compounding, setCompounding] = useState<DebtCompounding>('monthly');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (debt) {
      setName(debt.name);
      setType(debt.type);
      setOriginal(debt.original_amount ? String(debt.original_amount) : '');
      setBalance(String(debt.current_balance));
      setRate(String(debt.interest_rate));
      setPayment(debt.payment_amount ? String(debt.payment_amount) : '');
      setFrequency(debt.payment_frequency);
      setSplit(String(debt.split_count));
      setInterestDay(debt.interest_day != null ? String(debt.interest_day) : '');
      setCompounding(debt.compounding ?? (debt.type === 'mortgage' ? 'semi_annual' : 'monthly'));
      setNotes(debt.notes ?? '');
    } else {
      setName('');
      setType('credit_card');
      setOriginal('');
      setBalance('');
      setRate('');
      setPayment('');
      setFrequency('monthly');
      setSplit('1');
      setInterestDay('');
      setCompounding('semi_annual'); // default type is credit_card → overridden on type pick
      setNotes('');
    }
  }, [debt, open]);

  // Picking a type sets the conventional compounding for it (user can override).
  const pickType = (t: DebtType) => {
    setType(t);
    setCompounding(t === 'mortgage' ? 'semi_annual' : 'monthly');
  };

  // Mortgages and car loans usually have a known original amount; credit
  // cards / lines of credit revolve, so the field is less relevant there.
  // Revolving debts (CC + LOC) have no fixed payment — they're paid down
  // through the paycheck wizard instead.
  const revolving = type === 'credit_card' || type === 'line_of_credit';
  const showOriginal = type === 'mortgage' || type === 'car_loan' || type === 'loan';
  const showSplit = type === 'mortgage' || type === 'loan';

  const canSave = name.trim().length > 0 && balance !== '' && Number(balance) >= 0;

  const save = async () => {
    if (!canSave) return;
    const payload: DebtInput = {
      name: name.trim(),
      type,
      original_amount: showOriginal ? Number(original) || 0 : 0,
      current_balance: Number(balance),
      interest_rate: Number(rate) || 0,
      payment_amount: revolving ? 0 : Number(payment) || 0,
      payment_frequency: frequency,
      split_count: showSplit ? Math.max(1, Number(split) || 1) : 1,
      interest_day: revolving && interestDay !== '' ? Number(interestDay) : null,
      compounding: revolving ? 'monthly' : compounding,
      notes: notes.trim() || null,
    };
    if (debt) await window.api.debts.update(debt.id, payload);
    else await window.api.debts.create(payload);
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={debt ? 'Edit debt' : 'Add a debt'}
      description="Enter what you owe and how you pay it — payoff projections update automatically."
      size="lg"
    >
      <div className="px-6 py-5 space-y-4">
        {/* Type picker */}
        <div>
          <label className="label">Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {(Object.keys(TYPE_META) as DebtType[]).map((t) => {
              const m = TYPE_META[t];
              const TIcon = m.icon;
              const active = type === t;
              return (
                <button
                  key={t}
                  onClick={() => pickType(t)}
                  className={cn(
                    'rounded-lg border p-2.5 flex flex-col items-center gap-1.5 text-xs font-medium transition',
                    active
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-border text-content-muted hover:bg-surface-3'
                  )}
                >
                  <TIcon size={17} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Visa, House, Honda Civic…"
            />
          </div>
          {showOriginal && (
            <div>
              <label className="label">
                {type === 'mortgage' ? 'Original mortgage' : 'Amount financed'}
              </label>
              <input
                className="input num"
                type="number"
                step="0.01"
                min="0"
                value={original}
                onChange={(e) => setOriginal(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}
          <div>
            <label className="label">Current balance</label>
            <input
              className="input num"
              type="number"
              step="0.01"
              min="0"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label">Interest rate (% / yr)</label>
            <input
              className="input num"
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="19.99"
            />
          </div>
          {revolving ? (
            <>
              <div>
                <label className="label">Interest hits on day</label>
                <select
                  className="input"
                  value={interestDay}
                  onChange={(e) => setInterestDay(e.target.value)}
                >
                  <option value="">— Not set —</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {ordinal(d)} of the month
                    </option>
                  ))}
                </select>
                <p className="text-xs text-content-subtle mt-1.5">
                  On this day, the monthly interest charge is added to the balance automatically.
                </p>
              </div>
              <div className="col-span-2 rounded-lg bg-info/10 text-info p-3 text-sm">
                You pay this down through the{' '}
                <span className="font-semibold">paycheck wizard</span> — when you log a paycheck,
                you'll choose how much goes toward it. Purchases added on the Expenses page can
                also be charged to a credit card.
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Payment per cycle</label>
                <input
                  className="input num"
                  type="number"
                  step="0.01"
                  min="0"
                  value={payment}
                  onChange={(e) => setPayment(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="label">Payment frequency</label>
                <select
                  className="input"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as DebtFrequency)}
                >
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="semi_monthly">Semi-monthly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Interest compounding</label>
                <select
                  className="input"
                  value={compounding}
                  onChange={(e) => setCompounding(e.target.value as DebtCompounding)}
                >
                  <option value="semi_annual">
                    Semi-annual — Canadian fixed mortgages
                  </option>
                  <option value="monthly">Monthly — US mortgages, most other loans</option>
                </select>
                <p className="text-xs text-content-subtle mt-1.5">
                  Canadian banks compound fixed mortgages twice a year, which makes the true
                  interest slightly lower than monthly compounding at the same rate.
                </p>
              </div>
            </>
          )}
          {showSplit && (
            <div>
              <label className="label">People splitting payment</label>
              <input
                className="input num"
                type="number"
                step="1"
                min="1"
                value={split}
                onChange={(e) => setSplit(e.target.value)}
              />
              <p className="text-xs text-content-subtle mt-1.5">
                Set 2+ to see your share of each payment.
              </p>
            </div>
          )}
          <div className={showSplit ? '' : 'col-span-2'}>
            <label className="label">Notes (optional)</label>
            <input
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={!canSave}>
          {debt ? 'Save changes' : 'Add debt'}
        </button>
      </div>
    </Modal>
  );
}
