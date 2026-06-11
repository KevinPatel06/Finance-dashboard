import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, ShoppingCart, Search, CreditCard } from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO, isWithinInterval } from 'date-fns';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import type { Debt, Expense, ExpenseCategory } from '@shared/types';

const CATEGORY_PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#ef4444', '#14b8a6', '#06b6d4', '#a855f7', '#f97316',
];

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cats, setCats] = useState<ExpenseCategory[]>([]);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [manageCats, setManageCats] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Expense | null>(null);

  // Filters — month defaults to the current month; pick "All months" to widen.
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<number | 'all'>('all');
  const [filterMonth, setFilterMonth] = useState<string>(format(new Date(), 'yyyy-MM'));

  const [creditCards, setCreditCards] = useState<Debt[]>([]);

  const load = async () => {
    const [e, c, d] = await Promise.all([
      window.api.expenses.list() as Promise<Expense[]>,
      window.api.expenseCategories.list() as Promise<ExpenseCategory[]>,
      window.api.debts.list() as Promise<Debt[]>,
    ]);
    setExpenses(e);
    setCats(c);
    setCreditCards(d.filter((x) => x.type === 'credit_card'));
  };

  useEffect(() => {
    load();
  }, []);

  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);

  // Months present in the data (always including the current month so the
  // default selection has an option to bind to), for the month filter dropdown.
  const monthsAvailable = useMemo(() => {
    const set = new Set<string>([format(new Date(), 'yyyy-MM')]);
    for (const e of expenses) set.add(e.date.slice(0, 7));
    return Array.from(set).sort().reverse();
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filterCat !== 'all' && e.category_id !== filterCat) return false;
      if (filterMonth !== 'all' && e.date.slice(0, 7) !== filterMonth) return false;
      if (q) {
        const hay = `${e.description} ${e.note ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, search, filterCat, filterMonth]);

  // "Spent this month" summary (always current calendar month, independent of filters)
  const thisMonth = useMemo(() => {
    const now = new Date();
    const interval = { start: startOfMonth(now), end: endOfMonth(now) };
    let total = 0;
    let count = 0;
    for (const e of expenses) {
      try {
        if (isWithinInterval(parseISO(e.date), interval)) {
          total += e.amount;
          count++;
        }
      } catch {
        /* ignore bad dates */
      }
    }
    return { total, count };
  }, [expenses]);

  const filteredTotal = useMemo(
    () => filtered.reduce((a, e) => a + e.amount, 0),
    [filtered]
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await window.api.expenses.remove(pendingDelete.id);
    setPendingDelete(null);
    load();
  };

  const anyFilterActive = search.trim() !== '' || filterCat !== 'all' || filterMonth !== 'all';

  return (
    <div className="space-y-5">
      {/* Summary header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="card px-5 py-4 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-brand-soft text-brand grid place-items-center">
            <ShoppingCart size={20} />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-content-muted font-medium">
              Spent this month
            </div>
            <div className="text-2xl font-bold num leading-tight">
              {fmtMoney(thisMonth.total)}
            </div>
            <div className="text-xs text-content-subtle">
              {thisMonth.count} purchase{thisMonth.count === 1 ? '' : 's'}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setManageCats(true)} className="btn-outline">
            Categories
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus size={16} /> Add expense
          </button>
        </div>
      </div>

      {expenses.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={26} />}
          title="No expenses logged yet"
          description="Track your purchases here — groceries, gas, dining, shopping. Expenses are kept separate from your bills and paychecks."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Add your first expense
            </button>
          }
        />
      ) : (
        <>
          {/* Filter & search bar */}
          <div className="card p-3 flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-content-subtle"
              />
              <input
                className="input pl-9"
                placeholder="Search description or note…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="input w-auto"
              value={filterCat}
              onChange={(e) =>
                setFilterCat(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
            >
              <option value="all">All categories</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="input w-auto"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="all">All months</option>
              {monthsAvailable.map((m) => (
                <option key={m} value={m}>
                  {format(parseISO(`${m}-01`), 'MMMM yyyy')}
                </option>
              ))}
            </select>
            {anyFilterActive && (
              <button
                className="btn-ghost text-xs"
                onClick={() => {
                  setSearch('');
                  setFilterCat('all');
                  setFilterMonth('all');
                }}
              >
                Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-surface-3 text-content-muted">
                <tr className="text-left">
                  <th className="px-5 py-3 font-medium w-32">Date</th>
                  <th className="px-5 py-3 font-medium">Description</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-content-muted">
                      No expenses match your filters.
                    </td>
                  </tr>
                ) : (
                  filtered.map((e) => {
                    const cat = e.category_id != null ? catById.get(e.category_id) : null;
                    return (
                      <tr
                        key={e.id}
                        className="border-t border-border hover:bg-surface-3/50 transition"
                      >
                        <td className="px-5 py-3 text-content-muted num whitespace-nowrap">
                          {fmtDate(e.date)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="font-medium flex items-center gap-2">
                            {e.description}
                            {e.debt_id != null && (
                              <span className="pill bg-danger/10 text-danger shrink-0">
                                <CreditCard size={10} />
                                {creditCards.find((cc) => cc.id === e.debt_id)?.name ?? 'Card'}
                              </span>
                            )}
                          </div>
                          {e.note && (
                            <div className="text-xs text-content-subtle truncate max-w-md">
                              {e.note}
                            </div>
                          )}
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
                        <td className="px-5 py-3 text-right font-semibold num whitespace-nowrap">
                          {fmtMoney(e.amount)}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={() => setEditing(e)}
                              className="btn-ghost p-1.5"
                              aria-label="Edit"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              onClick={() => setPendingDelete(e)}
                              className="btn-ghost p-1.5 hover:text-danger"
                              aria-label="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="border-t border-border bg-surface-3/40">
                    <td className="px-5 py-3 text-content-muted" colSpan={3}>
                      {filtered.length} expense{filtered.length === 1 ? '' : 's'}
                      {anyFilterActive ? ' (filtered)' : ''}
                    </td>
                    <td className="px-5 py-3 text-right font-bold num">
                      {fmtMoney(filteredTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}

      <ExpenseEditor
        open={showNew || !!editing}
        expense={editing}
        categories={cats}
        creditCards={creditCards}
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

      <ExpenseCategoryManager
        open={manageCats}
        categories={cats}
        onClose={() => setManageCats(false)}
        onChanged={load}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete this expense?"
        description={
          pendingDelete ? (
            <>
              <span className="text-content font-medium">{pendingDelete.description}</span> (
              {fmtMoney(pendingDelete.amount)}) will be permanently removed.{' '}
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

function ExpenseEditor({
  open,
  expense,
  categories,
  creditCards,
  onClose,
  onSaved,
}: {
  open: boolean;
  expense: Expense | null;
  categories: ExpenseCategory[];
  creditCards: Debt[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [categoryId, setCategoryId] = useState<number | ''>('');
  const [note, setNote] = useState('');
  const [onCard, setOnCard] = useState(false);
  const [cardId, setCardId] = useState<number | ''>('');

  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount(String(expense.amount));
      setDate(expense.date);
      setCategoryId(expense.category_id ?? '');
      setNote(expense.note ?? '');
      setOnCard(expense.debt_id != null);
      setCardId(expense.debt_id ?? creditCards[0]?.id ?? '');
    } else {
      setDescription('');
      setAmount('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      setCategoryId('');
      setNote('');
      setOnCard(false);
      setCardId(creditCards[0]?.id ?? '');
    }
  }, [expense, open, creditCards]);

  const save = async () => {
    if (!description.trim() || !amount) return;
    const payload = {
      description: description.trim(),
      amount: Number(amount),
      date,
      category_id: categoryId === '' ? null : Number(categoryId),
      note: note.trim() || null,
      debt_id: onCard && cardId !== '' ? Number(cardId) : null,
    };
    if (expense) await window.api.expenses.update(expense.id, payload);
    else await window.api.expenses.create(payload);
    onSaved();
  };

  const canSave = description.trim().length > 0 && Number(amount) >= 0 && amount !== '';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expense ? 'Edit expense' : 'Add an expense'}
      description="Log a purchase. Expenses are tracked separately and don't affect your paychecks, bills, or savings."
      size="lg"
    >
      <div className="px-6 py-5 grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Description</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Coffee, groceries, gas fill-up…"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Amount (CAD)</label>
          <input
            className="input num"
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
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
        <div>
          <label className="label">Note (optional)</label>
          <input
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. birthday gift for mom"
          />
        </div>
        {creditCards.length > 0 && (
          <div className="col-span-2 rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onCard}
                onChange={(e) => setOnCard(e.target.checked)}
                className="w-4 h-4 accent-current text-brand"
              />
              <CreditCard size={15} className="text-danger" />
              Charged to a credit card — add it to that card's payoff balance
            </label>
            {onCard && creditCards.length > 1 && (
              <select
                className="input"
                value={cardId}
                onChange={(e) => setCardId(e.target.value === '' ? '' : Number(e.target.value))}
              >
                {creditCards.map((cc) => (
                  <option key={cc.id} value={cc.id}>
                    {cc.name} ({fmtMoney(cc.current_balance)} owing)
                  </option>
                ))}
              </select>
            )}
            {onCard && creditCards.length === 1 && (
              <p className="text-xs text-content-subtle">
                Will be added to <span className="text-content">{creditCards[0].name}</span>'s
                balance.
              </p>
            )}
          </div>
        )}
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={!canSave}>
          {expense ? 'Save changes' : 'Add expense'}
        </button>
      </div>
    </Modal>
  );
}

function ExpenseCategoryManager({
  open,
  categories,
  onClose,
  onChanged,
}: {
  open: boolean;
  categories: ExpenseCategory[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_PALETTE[0]);

  const canAdd = name.trim().length > 0;

  const add = async () => {
    if (!canAdd) return;
    await window.api.expenseCategories.create({ name: name.trim(), color });
    setName('');
    onChanged();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this category? Expenses in it will become uncategorized.')) return;
    await window.api.expenseCategories.remove(id);
    onChanged();
  };

  return (
    <Modal open={open} onClose={onClose} title="Expense categories" size="md">
      <div className="px-6 py-5 space-y-6">
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              placeholder="Food, Gas, Dining…"
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
                    color === c ? 'ring-2 ring-offset-2 ring-offset-surface-2 ring-content' : ''
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
          <button className="btn-primary w-full" onClick={add} disabled={!canAdd}>
            <Plus size={16} /> Add category
          </button>
        </div>

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
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="flex-1">{c.name}</span>
                  <button
                    onClick={() => remove(c.id)}
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
