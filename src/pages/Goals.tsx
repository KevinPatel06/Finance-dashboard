import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Target,
  Check,
  Trophy,
  Undo2,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { useCelebration } from '@/lib/celebration';
import { cn } from '@/lib/utils';
import type { SavingsGoal } from '@shared/types';

const PALETTE = [
  '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b',
  '#ef4444', '#14b8a6', '#06b6d4', '#a855f7', '#f97316',
];

type PendingDelete = { goal: SavingsGoal; from: 'active' | 'archived' } | null;
type PendingComplete = SavingsGoal | null;

export default function Goals() {
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [archived, setArchived] = useState<SavingsGoal[]>([]);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  const [pendingComplete, setPendingComplete] = useState<PendingComplete>(null);
  const { checkForCompletions } = useCelebration();

  const load = useCallback(async () => {
    const [active, done] = await Promise.all([
      window.api.goals.list() as Promise<SavingsGoal[]>,
      window.api.goals.listArchived() as Promise<SavingsGoal[]>,
    ]);
    setGoals(active);
    setArchived(done);
  }, []);

  useEffect(() => {
    load();
    checkForCompletions();
  }, [load, checkForCompletions]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await window.api.goals.purge(pendingDelete.goal.id);
    setPendingDelete(null);
    load();
  };

  const confirmComplete = async () => {
    if (!pendingComplete) return;
    await window.api.goals.remove(pendingComplete.id);
    setPendingComplete(null);
    load();
  };

  const onRestore = async (g: SavingsGoal) => {
    await window.api.goals.restore(g.id);
    load();
  };

  const active = goals.filter((g) => !g.archived);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-content-muted">
          Set targets and we'll track your progress as you allocate paychecks.
        </p>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus size={16} /> Add goal
        </button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <EmptyState
          icon={<Target size={26} />}
          title="No savings goals yet"
          description="Name something you're saving toward — emergency fund, trip, down payment — and set a target."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Add your first goal
            </button>
          }
        />
      ) : (
        <>
          {/* ---------- Active ---------- */}
          {active.length > 0 && (
            <section className="space-y-3">
              <SectionHeader title="Active" count={active.length} />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {active.map((g) => {
                  const pct =
                    g.target_amount > 0
                      ? Math.min(100, (g.current_amount / g.target_amount) * 100)
                      : 0;
                  const reached = pct >= 100;
                  return (
                    <div key={g.id} className="card p-5 relative group">
                      <div className="flex items-start justify-between">
                        <div
                          className="w-10 h-10 rounded-xl grid place-items-center text-white"
                          style={{ backgroundColor: g.color }}
                        >
                          <Target size={18} />
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition flex gap-1">
                          <button
                            onClick={() => setEditing(g)}
                            className="btn-ghost p-1.5"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setPendingDelete({ goal: g, from: 'active' })}
                            className="btn-ghost p-1.5 hover:text-danger"
                            title="Delete permanently"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <div className="font-semibold text-lg leading-tight">{g.name}</div>
                        {g.target_date && (
                          <div className="text-xs text-content-muted mt-0.5">
                            Target: {fmtDate(g.target_date)}
                          </div>
                        )}
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="num font-medium">{fmtMoney(g.current_amount)}</span>
                          <span className="num text-content-muted">
                            {fmtMoney(g.target_amount)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-3 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: g.color }}
                          />
                        </div>
                        <div className="text-xs text-content-muted mt-1.5 num">
                          {pct.toFixed(1)}% complete
                        </div>
                      </div>

                      {reached && (
                        <button
                          onClick={() => setPendingComplete(g)}
                          className="btn-primary w-full mt-4"
                          title="Move to Accomplished"
                        >
                          <Check size={16} /> Mark complete
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---------- Accomplished ---------- */}
          {archived.length > 0 && (
            <section className="space-y-3">
              <SectionHeader
                title="Accomplished"
                count={archived.length}
                icon={<Trophy size={14} className="text-warning" />}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {archived.map((g) => (
                  <AchievementCard
                    key={g.id}
                    goal={g}
                    onRestore={() => onRestore(g)}
                    onDelete={() => setPendingDelete({ goal: g, from: 'archived' })}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <GoalEditor
        open={showNew || !!editing}
        goal={editing}
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
        title={
          pendingDelete?.from === 'archived'
            ? 'Delete this accomplishment?'
            : 'Delete this goal?'
        }
        description={
          pendingDelete ? (
            <>
              <span className="text-content font-medium">{pendingDelete.goal.name}</span> will be
              permanently removed. Past paycheck contributions to it stay on your records, but the
              goal itself is gone for good.{' '}
              <span className="text-content">This cannot be undone.</span>
            </>
          ) : undefined
        }
        confirmLabel="Delete forever"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!pendingComplete}
        title="Mark this goal as complete?"
        description={
          pendingComplete ? (
            <>
              <span className="text-content font-medium">{pendingComplete.name}</span> will move to
              the Accomplished section. You can restore it later if you want.
            </>
          ) : undefined
        }
        confirmLabel="Mark complete"
        onCancel={() => setPendingComplete(null)}
        onConfirm={confirmComplete}
      />
    </div>
  );
}

function SectionHeader({
  title,
  count,
  icon,
}: {
  title: string;
  count: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold uppercase tracking-wider text-content-muted">
        {title}
      </h2>
      <span className="pill bg-surface-3 text-content-muted">{count}</span>
    </div>
  );
}

function AchievementCard({
  goal,
  onRestore,
  onDelete,
}: {
  goal: SavingsGoal;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const reached = goal.current_amount >= goal.target_amount && goal.target_amount > 0;
  return (
    <div
      className={cn(
        'card p-5 relative group overflow-hidden',
        'before:content-[""] before:absolute before:inset-y-0 before:left-0 before:w-1'
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1 rounded-r"
        style={{ backgroundColor: goal.color }}
      />

      <div className="absolute top-4 right-4 pill bg-warning/10 text-warning">
        <Trophy size={12} /> Achieved
      </div>

      <div className="flex items-start gap-3 pr-24">
        <div
          className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0"
          style={{ backgroundColor: goal.color }}
        >
          <Check size={18} strokeWidth={3} />
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-lg leading-tight truncate">{goal.name}</div>
          <div className="text-xs text-content-muted mt-0.5">
            {goal.archived_at
              ? `Completed ${fmtDate(goal.archived_at.slice(0, 10))}`
              : 'Completed'}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-baseline justify-between">
        <div>
          <div className="text-xs text-content-muted uppercase tracking-wide">Target reached</div>
          <div className="text-2xl font-bold num">{fmtMoney(goal.target_amount)}</div>
        </div>
        {reached && goal.current_amount > goal.target_amount && (
          <div className="text-right">
            <div className="text-xs text-content-muted uppercase tracking-wide">Saved</div>
            <div className="text-sm font-medium num">{fmtMoney(goal.current_amount)}</div>
          </div>
        )}
      </div>

      <div className="absolute bottom-3 right-3 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={onRestore}
          className="btn-ghost text-xs px-2 py-1"
          title="Move back to Active"
        >
          <Undo2 size={12} /> Restore
        </button>
        <button
          onClick={onDelete}
          className="btn-ghost text-xs p-1.5 hover:text-danger"
          title="Delete permanently"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function GoalEditor({
  open,
  goal,
  onClose,
  onSaved,
}: {
  open: boolean;
  goal: SavingsGoal | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  useEffect(() => {
    if (goal) {
      setName(goal.name);
      setTarget(String(goal.target_amount));
      setDate(goal.target_date ?? '');
      setColor(goal.color);
    } else {
      setName('');
      setTarget('');
      setDate('');
      setColor(PALETTE[0]);
    }
  }, [goal, open]);

  const save = async () => {
    if (!name || !target) return;
    const payload = {
      name,
      target_amount: Number(target),
      target_date: date || null,
      color,
    };
    if (goal) await window.api.goals.update(goal.id, payload);
    else await window.api.goals.create(payload);
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? 'Edit goal' : 'Add a savings goal'}
      size="md"
    >
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Emergency fund, Vacation, New car…"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Target amount</label>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="5000"
            />
          </div>
          <div>
            <label className="label">Target date (optional)</label>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label">Color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PALETTE.map((c) => (
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
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save}>
          {goal ? 'Save changes' : 'Add goal'}
        </button>
      </div>
    </Modal>
  );
}
