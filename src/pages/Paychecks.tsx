import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Wallet } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { useConfirm } from '@/lib/ui';
import type { PaycheckWithAllocations } from '@shared/types';
import PaycheckWizard from './PaycheckWizard';

export default function Paychecks() {
  const [list, setList] = useState<PaycheckWithAllocations[]>([]);
  const [showWizard, setShowWizard] = useState(false);
  const [editing, setEditing] = useState<PaycheckWithAllocations | null>(null);
  const confirm = useConfirm();

  const load = async () => {
    setList((await window.api.paychecks.list()) as PaycheckWithAllocations[]);
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (p: PaycheckWithAllocations) => {
    const ok = await confirm({
      title: 'Delete this paycheck?',
      description: (
        <>
          The <span className="text-content font-medium">{fmtMoney(p.amount)}</span> paycheck from{' '}
          {fmtDate(p.date)} will be removed, along with its goal contributions. Any debt payments on
          it are reverted.
        </>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.paychecks.remove(p.id);
    load();
  };

  const startEdit = (p: PaycheckWithAllocations) => {
    setEditing(p);
    setShowWizard(true);
  };

  const startNew = () => {
    setEditing(null);
    setShowWizard(true);
  };

  const closeWizard = () => {
    setShowWizard(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-content-muted">
          Log each biweekly paycheck and allocate it to bills, savings goals, and fun money.
        </p>
        <button onClick={startNew} className="btn-primary shrink-0">
          <Plus size={16} /> Log paycheck
        </button>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Wallet size={26} />}
          title="No paychecks logged yet"
          description="Use the wizard to log a paycheck — it'll walk you through paying bills, savings, and fun money."
          action={
            <button onClick={startNew} className="btn-primary">
              <Plus size={16} /> Log your first paycheck
            </button>
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((p) => (
            <div key={p.id} className="card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-baseline gap-3">
                    <div className="text-2xl font-display font-semibold num-display">{fmtMoney(p.amount)}</div>
                    <div className="text-sm text-content-muted">{fmtDate(p.date)}</div>
                  </div>
                  {p.notes && <div className="text-sm text-content-muted mt-1">{p.notes}</div>}
                  <div className="mt-4 grid grid-cols-2 md:grid-cols-6 gap-3 text-sm">
                    <Stat label="Bills" amount={p.totals.bills} />
                    <Stat label="Debt" amount={p.totals.debt} />
                    <Stat label="Savings" amount={p.totals.goals} />
                    <Stat label="Fun" amount={p.totals.fun} />
                    <Stat label="Other" amount={p.totals.other} />
                    <Stat label="Remainder" amount={p.totals.remainder} highlight />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => startEdit(p)}
                    className="btn-ghost p-1.5"
                    aria-label="Edit paycheck"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(p)}
                    className="btn-ghost p-1.5 hover:text-danger"
                    aria-label="Delete paycheck"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <PaycheckWizard
        open={showWizard}
        editing={editing}
        onClose={closeWizard}
        onSaved={() => {
          closeWizard();
          load();
        }}
      />
    </div>
  );
}

function Stat({
  label,
  amount,
  highlight,
}: {
  label: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 ${
        highlight ? 'bg-brand-soft text-brand' : 'bg-surface-3'
      }`}
    >
      <div className="text-xs text-content-muted uppercase tracking-wide">{label}</div>
      <div className="font-semibold num mt-0.5">{fmtMoney(amount)}</div>
    </div>
  );
}
