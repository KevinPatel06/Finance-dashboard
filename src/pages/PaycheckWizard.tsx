import { useEffect, useMemo, useState } from 'react';
import { format, parseISO, addDays } from 'date-fns';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Receipt,
  PiggyBank,
  Sparkles,
  FilePlus2,
  AlertTriangle,
  CreditCard,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { fmtMoney, fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCelebration } from '@/lib/celebration';
import type {
  Bill,
  Category,
  Debt,
  PaycheckAllocationInput,
  PaycheckWithAllocations,
  SavingsGoal,
} from '@shared/types';

type UpcomingBill = {
  bill: Bill;
  dueDate: string;
  category: Category | null;
  overdue?: boolean;
};

type Step = 'amount' | 'bills' | 'debt' | 'savings' | 'fun' | 'review';

const ALL_STEPS: { id: Step; label: string; icon: any }[] = [
  { id: 'amount', label: 'Paycheck', icon: FilePlus2 },
  { id: 'bills', label: 'Bills', icon: Receipt },
  { id: 'debt', label: 'Debt', icon: CreditCard },
  { id: 'savings', label: 'Savings', icon: PiggyBank },
  { id: 'fun', label: 'Fun money', icon: Sparkles },
  { id: 'review', label: 'Review', icon: Check },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** When set, the wizard pre-fills from this paycheck and saves via update(). */
  editing?: PaycheckWithAllocations | null;
}

export default function PaycheckWizard({ open, onClose, onSaved, editing }: Props) {
  const isEditing = !!editing;
  const [step, setStep] = useState<Step>('amount');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  const [upcoming, setUpcoming] = useState<UpcomingBill[]>([]);
  const [billChecked, setBillChecked] = useState<Record<string, boolean>>({});
  const [billAmounts, setBillAmounts] = useState<Record<string, string>>({});

  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [goalAmounts, setGoalAmounts] = useState<Record<number, string>>({});

  // Revolving debts (credit cards + lines of credit) payable from a paycheck.
  const [revolvingDebts, setRevolvingDebts] = useState<Debt[]>([]);
  const [debtAmounts, setDebtAmounts] = useState<Record<number, string>>({});

  const [funAmount, setFunAmount] = useState('');
  const [otherAmount, setOtherAmount] = useState('');

  const { checkForCompletions } = useCelebration();

  // Seed values from `editing` whenever the wizard opens with one.
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setAmount(String(editing.amount));
      setNotes(editing.notes ?? '');
      // Pre-fill goal + debt amounts
      const ga: Record<number, string> = {};
      const da: Record<number, string> = {};
      let fun = 0;
      let other = 0;
      for (const a of editing.allocations) {
        if (a.kind === 'goal' && a.ref_id != null) ga[a.ref_id] = String(a.amount);
        else if (a.kind === 'debt' && a.ref_id != null) da[a.ref_id] = String(a.amount);
        else if (a.kind === 'fun') fun += a.amount;
        else if (a.kind === 'other') other += a.amount;
      }
      setGoalAmounts(ga);
      setDebtAmounts(da);
      setFunAmount(fun > 0 ? String(fun) : '');
      setOtherAmount(other > 0 ? String(other) : '');
    } else {
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setAmount('');
      setNotes('');
      setGoalAmounts({});
      setDebtAmounts({});
      setFunAmount('');
      setOtherAmount('');
    }
    setStep('amount');
  }, [open, editing]);

  // Load bills-to-pay + goals when the wizard opens or the date changes.
  // bills.toPay returns unpaid occurrences (overdue + due within 14 days after
  // the paycheck), already-paid ones excluded. In edit mode, merge in any bills
  // already on this paycheck that aren't in that list.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const to = format(addDays(parseISO(date), 14), 'yyyy-MM-dd');
      const [u, g, allDebts] = await Promise.all([
        window.api.bills.toPay(to) as Promise<UpcomingBill[]>,
        window.api.goals.list() as Promise<SavingsGoal[]>,
        window.api.debts.list() as Promise<Debt[]>,
      ]);
      setRevolvingDebts(
        allDebts.filter((d) => d.type === 'credit_card' || d.type === 'line_of_credit')
      );

      let merged = u;
      const checked: Record<string, boolean> = {};
      const amounts: Record<string, string> = {};

      if (editing) {
        // Build a map of (bill_id -> allocation) for current bill allocations
        const allocByBill = new Map<number, { amount: number; note: string | null }>();
        for (const a of editing.allocations) {
          if (a.kind === 'bill' && a.ref_id != null) {
            allocByBill.set(a.ref_id, { amount: a.amount, note: a.note ?? null });
          }
        }
        const projectionBillIds = new Set(u.map((e) => e.bill.id));
        // For any allocation whose bill isn't in projection, fabricate a row using the
        // allocation's note (the originally-stored due date) or the paycheck date itself.
        const allBills = (await window.api.bills.list()) as Bill[];
        const billsById = new Map(allBills.map((b) => [b.id, b]));
        const extras: UpcomingBill[] = [];
        for (const [billId, info] of allocByBill) {
          if (projectionBillIds.has(billId)) continue;
          const b = billsById.get(billId);
          if (!b) continue;
          extras.push({
            bill: b,
            dueDate: info.note && /^\d{4}-\d{2}-\d{2}$/.test(info.note) ? info.note : date,
            category: null,
          });
        }
        merged = [...extras, ...u].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        // Pre-check/pre-fill bills present in allocations
        merged.forEach((e, i) => {
          const k = key(e, i);
          const a = allocByBill.get(e.bill.id);
          if (a) {
            checked[k] = true;
            amounts[k] = a.amount.toFixed(2);
          } else {
            checked[k] = false;
            amounts[k] = e.bill.amount.toFixed(2);
          }
        });
      } else {
        merged.forEach((e, i) => {
          const k = key(e, i);
          checked[k] = true;
          amounts[k] = e.bill.amount.toFixed(2);
        });
      }

      setUpcoming(merged);
      setBillChecked(checked);
      setBillAmounts(amounts);
      setGoals(g);
    })();
  }, [open, date, editing]);

  const paycheck = Number(amount) || 0;
  const billsTotal = useMemo(() => {
    let t = 0;
    upcoming.forEach((e, i) => {
      const k = key(e, i);
      if (billChecked[k]) t += Number(billAmounts[k] || 0);
    });
    return t;
  }, [upcoming, billChecked, billAmounts]);

  const overdueCount = useMemo(
    () => upcoming.filter((e) => e.overdue).length,
    [upcoming]
  );

  const goalsTotal = useMemo(
    () => Object.values(goalAmounts).reduce((a, v) => a + (Number(v) || 0), 0),
    [goalAmounts]
  );
  const debtsTotal = useMemo(
    () => Object.values(debtAmounts).reduce((a, v) => a + (Number(v) || 0), 0),
    [debtAmounts]
  );
  const fun = Number(funAmount) || 0;
  const other = Number(otherAmount) || 0;
  const allocated = billsTotal + goalsTotal + debtsTotal + fun + other;
  const remainder = paycheck - allocated;

  // The Debt step only appears when there's a revolving debt to pay.
  const STEPS = useMemo(
    () =>
      revolvingDebts.length > 0 ? ALL_STEPS : ALL_STEPS.filter((s) => s.id !== 'debt'),
    [revolvingDebts]
  );

  const stepIdx = STEPS.findIndex((s) => s.id === step);
  const next = () => setStep(STEPS[Math.min(STEPS.length - 1, stepIdx + 1)].id);
  const prev = () => setStep(STEPS[Math.max(0, stepIdx - 1)].id);

  const canNext = () => {
    if (step === 'amount') return paycheck > 0 && !!date;
    return true;
  };

  const save = async () => {
    if (paycheck <= 0) return;
    const allocations: PaycheckAllocationInput[] = [];
    upcoming.forEach((e, i) => {
      const k = key(e, i);
      if (billChecked[k]) {
        const amt = Number(billAmounts[k] || 0);
        if (amt > 0) {
          allocations.push({
            kind: 'bill',
            ref_id: e.bill.id,
            amount: amt,
            note: e.dueDate,
          });
        }
      }
    });
    for (const [gid, v] of Object.entries(goalAmounts)) {
      const n = Number(v);
      if (n > 0) {
        allocations.push({ kind: 'goal', ref_id: Number(gid), amount: n, note: null });
      }
    }
    for (const [did, v] of Object.entries(debtAmounts)) {
      const n = Number(v);
      if (n > 0) {
        allocations.push({ kind: 'debt', ref_id: Number(did), amount: n, note: null });
      }
    }
    if (fun > 0) allocations.push({ kind: 'fun', ref_id: null, amount: fun, note: null });
    if (other > 0) allocations.push({ kind: 'other', ref_id: null, amount: other, note: null });

    if (isEditing && editing) {
      await window.api.paychecks.update(editing.id, {
        date,
        amount: paycheck,
        notes: notes || null,
        allocations,
      });
    } else {
      await window.api.paychecks.create({
        date,
        amount: paycheck,
        notes: notes || null,
        allocations,
      });
      // Roll forward the user's next-paycheck date by 14 days only for new entries
      await window.api.settings.update({
        next_paycheck_date: format(addDays(parseISO(date), 14), 'yyyy-MM-dd'),
      });
    }

    // Check if any goal hit 100% as a result of this save
    await checkForCompletions();
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} size="xl">
      {/* Stepper header */}
      <div className="px-6 pt-5 pb-4 border-b border-border bg-surface-2 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-base">
            {isEditing ? 'Edit paycheck' : 'Log a paycheck'}
          </h2>
          <div className="text-sm text-content-muted">
            <span className="num font-semibold text-content">{fmtMoney(paycheck)}</span>
            <span className="mx-2 text-content-subtle">·</span>
            Remainder{' '}
            <span
              className={cn(
                'num font-semibold',
                remainder < 0 ? 'text-danger' : 'text-success'
              )}
            >
              {fmtMoney(remainder)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            const done = i < stepIdx;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition flex-1',
                    active
                      ? 'bg-brand-soft text-brand font-medium'
                      : done
                        ? 'text-content-muted'
                        : 'text-content-subtle'
                  )}
                >
                  <Icon size={15} />
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'h-px flex-1 transition',
                      i < stepIdx ? 'bg-brand' : 'bg-border'
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="px-6 py-6 min-h-[360px]">
        {step === 'amount' && (
          <div className="max-w-md mx-auto space-y-4">
            <div>
              <label className="label">Paycheck amount</label>
              <input
                className="input text-xl font-semibold num"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Date received</label>
              <input
                className="input"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Notes (optional)</label>
              <input
                className="input"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Bonus, raise, etc."
              />
            </div>
          </div>
        )}

        {step === 'bills' && (
          <div className="space-y-2">
            {overdueCount > 0 && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-danger/10 text-danger mb-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  <span className="font-semibold">
                    {overdueCount} overdue {overdueCount === 1 ? 'bill' : 'bills'}
                  </span>{' '}
                  — these came due and haven't been paid yet. They're checked for you; pay them
                  off from this paycheck if you can.
                </div>
              </div>
            )}
            <div className="text-sm text-content-muted mb-3">
              {isEditing
                ? 'Bills on this paycheck, plus anything overdue or due within 14 days. Adjust freely.'
                : "Overdue and soon-due bills are checked for you. Uncheck anything you're not paying from this paycheck."}
            </div>
            {upcoming.length === 0 ? (
              <div className="text-sm text-content-muted py-8 text-center">
                🎉 You're all caught up — nothing due to pay right now.
              </div>
            ) : (
              upcoming.map((e, i) => {
                const k = key(e, i);
                const isOverdue = !!e.overdue;
                return (
                  <label
                    key={k}
                    className={cn(
                      'flex items-center gap-3 p-3 rounded-lg border transition cursor-pointer',
                      isOverdue && !billChecked[k]
                        ? 'border-danger/50 bg-danger/5'
                        : billChecked[k]
                          ? 'border-brand bg-brand-soft/50'
                          : 'border-border hover:bg-surface-3'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={!!billChecked[k]}
                      onChange={(ev) =>
                        setBillChecked((s) => ({ ...s, [k]: ev.target.checked }))
                      }
                      className="w-4 h-4 accent-current text-brand"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: e.category?.color ?? '#64748b' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {e.bill.name}
                        {isOverdue && (
                          <span className="pill bg-danger/15 text-danger shrink-0">
                            <AlertTriangle size={10} /> Overdue
                          </span>
                        )}
                      </div>
                      <div className={cn('text-xs', isOverdue ? 'text-danger' : 'text-content-muted')}>
                        {e.category?.name ?? 'Uncategorized'} · due {fmtDate(e.dueDate)}
                      </div>
                    </div>
                    <input
                      className="input w-28 text-right num shrink-0"
                      type="number"
                      step="0.01"
                      min="0"
                      value={billAmounts[k] ?? ''}
                      onChange={(ev) =>
                        setBillAmounts((s) => ({ ...s, [k]: ev.target.value }))
                      }
                      disabled={!billChecked[k]}
                    />
                  </label>
                );
              })
            )}
          </div>
        )}

        {step === 'debt' && (
          <div className="space-y-3">
            <div className="text-sm text-content-muted mb-1">
              Pay down your credit cards and lines of credit. Whatever you enter comes off the
              balance when you save.
            </div>
            {revolvingDebts.length === 0 ? (
              <div className="text-sm text-content-muted py-6 text-center">
                No credit cards or lines of credit to pay.
              </div>
            ) : (
              revolvingDebts.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg grid place-items-center text-white shrink-0',
                      d.type === 'credit_card' ? 'bg-danger' : 'bg-info'
                    )}
                  >
                    <CreditCard size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{d.name}</div>
                    <div className="text-xs text-content-muted num whitespace-nowrap">
                      {fmtMoney(d.current_balance)} owing · {d.interest_rate}% APR
                    </div>
                  </div>
                  <input
                    className="input w-32 text-right num shrink-0"
                    type="number"
                    step="0.01"
                    min="0"
                    value={debtAmounts[d.id] ?? ''}
                    onChange={(e) =>
                      setDebtAmounts((s) => ({ ...s, [d.id]: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {step === 'savings' && (
          <div className="space-y-3">
            <div className="text-sm text-content-muted mb-1">
              Allocate any amount toward each goal.
            </div>
            {goals.length === 0 ? (
              <div className="text-sm text-content-muted py-6 text-center">
                You haven't created any goals yet. Add some on the Goals page first.
              </div>
            ) : (
              goals.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <div
                    className="w-9 h-9 rounded-lg grid place-items-center text-white shrink-0"
                    style={{ backgroundColor: g.color }}
                  >
                    <PiggyBank size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-xs text-content-muted num whitespace-nowrap">
                      {fmtMoney(g.current_amount)} of {fmtMoney(g.target_amount)}
                    </div>
                  </div>
                  <input
                    className="input w-32 text-right num shrink-0"
                    type="number"
                    step="0.01"
                    min="0"
                    value={goalAmounts[g.id] ?? ''}
                    onChange={(e) =>
                      setGoalAmounts((s) => ({ ...s, [g.id]: e.target.value }))
                    }
                    placeholder="0.00"
                  />
                </div>
              ))
            )}
          </div>
        )}

        {step === 'fun' && (
          <div className="max-w-md mx-auto space-y-5">
            <div>
              <label className="label">Fun money (lump sum)</label>
              <input
                className="input text-xl font-semibold num"
                type="number"
                step="0.01"
                min="0"
                value={funAmount}
                onChange={(e) => setFunAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-content-subtle mt-2">
                Discretionary spending for this pay period — eating out, hobbies, etc.
              </p>
            </div>
            <div>
              <label className="label">Other (optional)</label>
              <input
                className="input num"
                type="number"
                step="0.01"
                min="0"
                value={otherAmount}
                onChange={(e) => setOtherAmount(e.target.value)}
                placeholder="0.00"
              />
              <p className="text-xs text-content-subtle mt-2">
                Anything else: gifts, one-off expenses, etc.
              </p>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="max-w-2xl mx-auto">
            <div className="card p-5 bg-surface-3/40">
              <Row label="Paycheck" amount={paycheck} />
              <Row label="− Bills" amount={-billsTotal} />
              {debtsTotal > 0 && <Row label="− Debt payments" amount={-debtsTotal} />}
              <Row label="− Savings" amount={-goalsTotal} />
              <Row label="− Fun money" amount={-fun} />
              {other > 0 && <Row label="− Other" amount={-other} />}
              <div className="border-t border-border mt-3 pt-3">
                <Row label="Remainder" amount={remainder} bold />
              </div>
            </div>
            {remainder < 0 && (
              <div className="mt-4 p-3 rounded-lg bg-danger/10 text-danger text-sm">
                You've allocated more than the paycheck amount. Adjust before saving.
              </div>
            )}
            {remainder > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-info/10 text-info text-sm">
                You have {fmtMoney(remainder)} unallocated. You can save now and it will be tracked as
                leftover, or go back and add it to savings/fun money.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border flex items-center justify-between bg-surface-3/40">
        <button
          className="btn-ghost"
          onClick={stepIdx === 0 ? onClose : prev}
        >
          {stepIdx === 0 ? (
            'Cancel'
          ) : (
            <>
              <ChevronLeft size={16} /> Back
            </>
          )}
        </button>
        {step !== 'review' ? (
          <button className="btn-primary" disabled={!canNext()} onClick={next}>
            Next <ChevronRight size={16} />
          </button>
        ) : (
          <button className="btn-primary" disabled={remainder < 0} onClick={save}>
            <Check size={16} /> {isEditing ? 'Save changes' : 'Save paycheck'}
          </button>
        )}
      </div>
    </Modal>
  );
}

function key(e: UpcomingBill, i: number) {
  return `${e.bill.id}__${e.dueDate}__${i}`;
}

function Row({ label, amount, bold }: { label: string; amount: number; bold?: boolean }) {
  return (
    <div className={cn('flex items-center justify-between py-1.5', bold && 'text-lg')}>
      <span className={cn(bold ? 'font-semibold' : 'text-content-muted')}>{label}</span>
      <span className={cn('num', bold && 'font-bold', amount < 0 && 'text-content')}>
        {fmtMoney(amount)}
      </span>
    </div>
  );
}
