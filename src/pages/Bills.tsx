import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Receipt, Zap, AlertTriangle, Clock, CheckCircle2, CalendarRange } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useConfirm } from '@/lib/ui';
import type { Bill, BillFrequency, BillStatus, Category } from '@shared/types';
import { format } from 'date-fns';

const FREQ_LABEL: Record<BillFrequency, string> = {
  biweekly: 'Bi-weekly',
  monthly: 'Monthly',
  semi_annual: 'Semi-annual',
  yearly: 'Yearly',
  custom_days: 'Custom',
};

const CATEGORY_PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#ef4444', '#14b8a6', '#06b6d4', '#a855f7', '#f97316',
];

export default function Bills() {
  const [bills, setBills] = useState<Bill[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [statuses, setStatuses] = useState<Map<number, BillStatus>>(new Map());
  const [editing, setEditing] = useState<Bill | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  const confirm = useConfirm();

  const load = async () => {
    const [b, c, s] = await Promise.all([
      window.api.bills.list() as Promise<Bill[]>,
      window.api.categories.list() as Promise<Category[]>,
      window.api.bills.statuses() as Promise<BillStatus[]>,
    ]);
    setBills(b);
    setCats(c);
    setStatuses(new Map(s.map((row) => [row.bill.id, row])));
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (bill: Bill) => {
    const ok = await confirm({
      title: 'Delete this bill?',
      description: (
        <>
          <span className="text-content font-medium">{bill.name}</span> will be archived and removed
          from your active bills. Past paycheck history stays intact.
        </>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.bills.remove(bill.id);
    load();
  };

  // Yearly cost of all current bills, and the monthly average that implies.
  const PER_YEAR: Record<BillFrequency, number> = {
    biweekly: 26,
    monthly: 12,
    semi_annual: 2,
    yearly: 1,
    custom_days: 0, // handled below
  };
  const yearlyTotal = bills.reduce((acc, b) => {
    const times =
      b.frequency === 'custom_days'
        ? 365.25 / Math.max(1, b.custom_days ?? 30)
        : PER_YEAR[b.frequency];
    return acc + b.amount * times;
  }, 0);
  const monthlyAvg = yearlyTotal / 12;

  // Sort by status (overdue → due soon → up to date), then by next due date.
  const STATUS_RANK: Record<BillStatus['status'], number> = {
    overdue: 0,
    due_soon: 1,
    ok: 2,
  };
  const sortedBills = [...bills].sort((a, b) => {
    const sa = statuses.get(a.id);
    const sb = statuses.get(b.id);
    const ra = sa ? STATUS_RANK[sa.status] : 3;
    const rb = sb ? STATUS_RANK[sb.status] : 3;
    if (ra !== rb) return ra - rb;
    const da = sa?.nextDueDate ?? a.anchor_date;
    const db = sb?.nextDueDate ?? b.anchor_date;
    return da.localeCompare(db);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-content-muted">
            Recurring bills & subscriptions. Edit anytime — projections update across the app.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setManageCats(true)} className="btn-outline">
            Categories
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={16} /> Add bill
          </button>
        </div>
      </div>

      {bills.length === 0 ? (
        <EmptyState
          icon={<Receipt size={26} />}
          title="No bills yet"
          description="Add your subscriptions, rent, utilities, and other recurring bills. You can edit or remove them anytime."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Add your first bill
            </button>
          }
        />
      ) : (
        <>
          {/* Cost summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center shrink-0">
                <CalendarRange size={20} />
              </div>
              <div>
                <div className="text-xs text-content-muted uppercase tracking-wide font-medium">
                  Monthly average
                </div>
                <div className="text-2xl font-bold num leading-tight">{fmtMoney(monthlyAvg)}</div>
                <div className="text-xs text-content-subtle">
                  what your bills cost per month, averaged
                </div>
              </div>
            </div>
            <div className="card p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-surface-3 text-content-muted grid place-items-center shrink-0">
                <Receipt size={20} />
              </div>
              <div>
                <div className="text-xs text-content-muted uppercase tracking-wide font-medium">
                  Yearly total
                </div>
                <div className="text-2xl font-bold num leading-tight">{fmtMoney(yearlyTotal)}</div>
                <div className="text-xs text-content-subtle">
                  across {bills.length} bill{bills.length === 1 ? '' : 's'} at current amounts
                </div>
              </div>
            </div>
          </div>

          <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-3 text-content-muted">
              <tr className="text-left">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Frequency</th>
                <th className="px-5 py-3 font-medium">Next due</th>
                <th className="px-5 py-3 font-medium text-right">Amount</th>
                <th className="px-5 py-3 font-medium w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sortedBills.map((b) => {
                const cat = cats.find((c) => c.id === b.category_id);
                const st = statuses.get(b.id);
                return (
                  <tr
                    key={b.id}
                    className="border-t border-border hover:bg-surface-3/50 transition"
                  >
                    <td className="px-5 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {b.name}
                        {b.autopay ? (
                          <span className="pill bg-info/10 text-info">
                            <Zap size={10} /> Auto
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <BillStatusBadge status={st} />
                    </td>
                    <td className="px-5 py-3">
                      {cat ? (
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: cat.color }}
                          />
                          {cat.name}
                        </span>
                      ) : (
                        <span className="text-content-subtle">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-content-muted">
                      {FREQ_LABEL[b.frequency]}
                      {b.frequency === 'custom_days' && b.custom_days
                        ? ` · ${b.custom_days}d`
                        : ''}
                    </td>
                    <td className="px-5 py-3 text-content-muted num">
                      {fmtDate(st?.nextDueDate ?? b.anchor_date)}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold num">
                      {fmtMoney(b.amount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setEditing(b)}
                          className="btn-ghost p-1.5"
                          aria-label="Edit"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => onDelete(b)}
                          className="btn-ghost p-1.5 hover:text-danger"
                          aria-label="Delete"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </>
      )}

      <BillEditor
        open={showNew || !!editing}
        bill={editing}
        categories={cats}
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

      <CategoryManager
        open={manageCats}
        categories={cats}
        onClose={() => setManageCats(false)}
        onChanged={load}
      />
    </div>
  );
}

function BillStatusBadge({ status }: { status: BillStatus | undefined }) {
  if (!status) return <span className="text-content-subtle">—</span>;

  if (status.status === 'overdue') {
    return (
      <span className="pill bg-danger/15 text-danger">
        <AlertTriangle size={11} />
        {status.overdueCount > 1 ? `${status.overdueCount} overdue` : 'Overdue'}
      </span>
    );
  }
  if (status.status === 'due_soon') {
    return (
      <span className="pill bg-warning/15 text-warning">
        <Clock size={11} /> Due soon
      </span>
    );
  }
  return (
    <span className={cn('pill bg-success/10 text-success')}>
      <CheckCircle2 size={11} /> Up to date
    </span>
  );
}

function BillEditor({
  open,
  bill,
  categories,
  onClose,
  onSaved,
}: {
  open: boolean;
  bill: Bill | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<BillFrequency>('monthly');
  const [customDays, setCustomDays] = useState('30');
  const [anchorDate, setAnchorDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [autopay, setAutopay] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (bill) {
      setName(bill.name);
      setAmount(String(bill.amount));
      setFrequency(bill.frequency);
      setCustomDays(String(bill.custom_days ?? 30));
      setAnchorDate(bill.anchor_date);
      setCategoryId(bill.category_id ?? '');
      setAutopay(!!bill.autopay);
      setNotes(bill.notes ?? '');
    } else {
      setName('');
      setAmount('');
      setFrequency('monthly');
      setCustomDays('30');
      setAnchorDate(format(new Date(), 'yyyy-MM-dd'));
      setCategoryId('');
      setAutopay(false);
      setNotes('');
    }
  }, [bill, open]);

  const save = async () => {
    if (!name || !amount) return;
    const payload = {
      name,
      amount: Number(amount),
      frequency,
      custom_days: frequency === 'custom_days' ? Number(customDays) : null,
      anchor_date: anchorDate,
      category_id: categoryId === '' ? null : Number(categoryId),
      autopay,
      notes: notes || null,
    };
    if (bill) await window.api.bills.update(bill.id, payload);
    else await window.api.bills.create(payload);
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={bill ? 'Edit bill' : 'Add a bill'}
      description="Bills can be recurring at any frequency. The anchor date is when this bill is (or was) first due."
      size="lg"
    >
      <div className="px-6 py-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Netflix, Rent, Electric…"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Amount (CAD)</label>
          <input
            className="input"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">Frequency</label>
          <select
            className="input"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as BillFrequency)}
          >
            <option value="biweekly">Bi-weekly</option>
            <option value="monthly">Monthly</option>
            <option value="semi_annual">Semi-annual</option>
            <option value="yearly">Yearly</option>
            <option value="custom_days">Custom (every N days)</option>
          </select>
        </div>
        {frequency === 'custom_days' && (
          <div>
            <label className="label">Every N days</label>
            <input
              className="input"
              type="number"
              min="1"
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="label">Anchor / next due</label>
          <input
            className="input"
            type="date"
            value={anchorDate}
            onChange={(e) => setAnchorDate(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Category</label>
          <select
            className="input"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value === '' ? '' : Number(e.target.value))}
          >
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autopay}
              onChange={(e) => setAutopay(e.target.checked)}
              className="w-4 h-4 accent-current text-brand"
            />
            Autopay
          </label>
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <textarea
            className="input min-h-[70px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save}>
          {bill ? 'Save changes' : 'Add bill'}
        </button>
      </div>
    </Modal>
  );
}

function CategoryManager({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_PALETTE[0]);
  const confirm = useConfirm();

  const add = async () => {
    if (!name) return;
    await window.api.categories.create({ name, color });
    setName('');
    onChanged();
  };

  const remove = async (cat: Category) => {
    const ok = await confirm({
      title: 'Delete this category?',
      description: (
        <>
          Bills in <span className="text-content font-medium">{cat.name}</span> will become
          uncategorized.
        </>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.categories.remove(cat.id);
    onChanged();
  };

  const canAdd = name.trim().length > 0;

  return (
    <Modal open={open} onClose={onClose} title="Categories" size="md">
      <div className="px-6 py-5 space-y-6">
        {/* ---------- New category form ---------- */}
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              placeholder="Subscriptions, Utilities, Rent…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdd) add();
              }}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Color</label>
            <div className="flex items-center gap-2 flex-wrap">
              {CATEGORY_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-lg transition ${
                    color === c
                      ? 'ring-2 ring-offset-2 ring-offset-surface-2 ring-content'
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <button
            className="btn-primary w-full"
            onClick={add}
            disabled={!canAdd}
          >
            <Plus size={16} /> Add category
          </button>
        </div>

        {/* ---------- Existing categories ---------- */}
        <div className="pt-2 border-t border-border">
          <div className="text-xs font-medium text-content-muted uppercase tracking-wide mb-2">
            Existing
          </div>
          {categories.length === 0 ? (
            <div className="text-sm text-content-muted py-4 text-center">
              No categories yet.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {categories.map((c) => (
                <li key={c.id} className="py-2 flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="flex-1">{c.name}</span>
                  <button
                    onClick={() => remove(c)}
                    className="btn-ghost p-1.5 hover:text-danger"
                    aria-label="Delete"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
