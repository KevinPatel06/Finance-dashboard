import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Landmark, PiggyBank } from 'lucide-react';
import { format } from 'date-fns';
import Modal from '@/components/ui/Modal';
import EmptyState from '@/components/ui/EmptyState';
import { fmtMoney, fmtDate } from '@/lib/format';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import type {
  RegisteredAccount,
  RegisteredKind,
} from '@shared/types';

const KIND_META: Record<RegisteredKind, { label: string; full: string; color: string }> = {
  rrsp: { label: 'RRSP', full: 'Registered Retirement Savings Plan', color: '#6366f1' },
  tfsa: { label: 'TFSA', full: 'Tax-Free Savings Account', color: '#10b981' },
  fhsa: { label: 'FHSA', full: 'First Home Savings Account', color: '#f59e0b' },
};

export default function Registered() {
  const [accounts, setAccounts] = useState<RegisteredAccount[]>([]);
  const [editing, setEditing] = useState<RegisteredAccount | null>(null);
  const [showNew, setShowNew] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const load = async () => {
    const a = (await window.api.registered.list()) as RegisteredAccount[];
    setAccounts(a);
  };

  useEffect(() => {
    load();
  }, []);

  const removeAccount = async (acc: RegisteredAccount) => {
    const ok = await confirm({
      title: `Delete this ${KIND_META[acc.kind].label}?`,
      description: 'The account and all its logged contributions will be permanently removed.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await window.api.registered.remove(acc.id);
    toast.success('Account deleted.');
    load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-content-muted max-w-xl">
          Track your RRSP, TFSA, and FHSA contribution room. Enter your available room (from your
          CRA Notice of Assessment) and log contributions against it.
        </p>
        <button onClick={() => setShowNew(true)} className="btn-primary shrink-0">
          <Plus size={16} /> Add account
        </button>
      </div>

      {accounts.length === 0 ? (
        <EmptyState
          icon={<Landmark size={26} />}
          title="No registered accounts yet"
          description="Add an RRSP, TFSA, or FHSA to track how much contribution room you have left this year."
          action={
            <button onClick={() => setShowNew(true)} className="btn-primary">
              <Plus size={16} /> Add your first account
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {accounts.map((acc) => (
            <AccountCard
              key={acc.id}
              account={acc}
              onEdit={() => setEditing(acc)}
              onDelete={() => removeAccount(acc)}
              onChanged={load}
            />
          ))}
        </div>
      )}

      <AccountEditor
        open={showNew || editing !== null}
        account={editing}
        onClose={() => {
          setShowNew(false);
          setEditing(null);
        }}
        onSaved={() => {
          setShowNew(false);
          setEditing(null);
          load();
        }}
      />
    </div>
  );
}

function AccountCard({
  account,
  onEdit,
  onDelete,
  onChanged,
}: {
  account: RegisteredAccount;
  onEdit: () => void;
  onDelete: () => void;
  onChanged: () => void;
}) {
  const meta = KIND_META[account.kind];
  const [adding, setAdding] = useState(false);
  const confirm = useConfirm();

  const pct =
    account.contribution_room > 0
      ? Math.min(100, (account.contributed / account.contribution_room) * 100)
      : 0;
  const over = account.remaining < 0;

  const removeContribution = async (id: number) => {
    const ok = await confirm({
      title: 'Remove this contribution?',
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;
    await window.api.registered.removeContribution(id);
    onChanged();
  };

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center text-white shrink-0"
            style={{ backgroundColor: meta.color }}
          >
            <PiggyBank size={19} />
          </div>
          <div className="min-w-0">
            <div className="font-semibold truncate">{account.label}</div>
            <div className="text-xs text-content-muted">{meta.full}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onEdit} className="btn-ghost p-1.5" aria-label="Edit" title="Edit">
            <Pencil size={15} />
          </button>
          <button
            onClick={onDelete}
            className="btn-ghost p-1.5 hover:text-danger"
            aria-label="Delete"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-content-muted font-medium">
            Room remaining
          </div>
          <div
            className={cn(
              'text-2xl font-display font-semibold num-display leading-tight',
              over && 'text-danger'
            )}
          >
            {fmtMoney(account.remaining)}
          </div>
        </div>
        <div className="text-right text-sm text-content-muted num">
          {fmtMoney(account.contributed)} of {fmtMoney(account.contribution_room)}
        </div>
      </div>

      <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: over ? undefined : meta.color }}
        />
      </div>
      {over && (
        <p className="field-error mt-1">
          Over-contributed by {fmtMoney(-account.remaining)} — watch for CRA penalties.
        </p>
      )}

      <div className="mt-4 pt-3 border-t border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-content-muted uppercase tracking-wide">
            Contributions
          </div>
          <button onClick={() => setAdding((v) => !v)} className="btn-ghost text-xs px-2 py-1">
            <Plus size={14} /> Log
          </button>
        </div>

        {adding && (
          <ContributionForm
            accountId={account.id}
            onAdded={() => {
              setAdding(false);
              onChanged();
            }}
            onCancel={() => setAdding(false)}
          />
        )}

        {account.contributions.length === 0 ? (
          <div className="text-sm text-content-subtle py-2">No contributions logged yet.</div>
        ) : (
          <ul className="divide-y divide-border">
            {account.contributions.slice(0, 6).map((c) => (
              <li key={c.id} className="py-1.5 flex items-center gap-3 text-sm">
                <span className="num font-medium w-24">{fmtMoney(c.amount)}</span>
                <span className="text-content-muted flex-1 min-w-0 truncate">
                  {fmtDate(c.date)}
                  {c.note ? ` · ${c.note}` : ''}
                </span>
                <button
                  onClick={() => removeContribution(c.id)}
                  className="btn-ghost p-1 hover:text-danger"
                  aria-label="Remove contribution"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ContributionForm({
  accountId,
  onAdded,
  onCancel,
}: {
  accountId: number;
  onAdded: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');

  const amountNum = Number(amount);
  const valid = amount !== '' && amountNum > 0;

  const submit = async () => {
    if (!valid) return;
    await window.api.registered.addContribution({
      account_id: accountId,
      amount: amountNum,
      date,
      note: note.trim() || null,
    });
    onAdded();
  };

  return (
    <div className="mb-3 p-3 rounded-lg border border-border bg-surface-3/40 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input
          className="input num py-1.5"
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          autoFocus
        />
        <input
          className="input py-1.5"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <input
        className="input py-1.5"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="btn-ghost text-sm px-3 py-1.5">
          Cancel
        </button>
        <button onClick={submit} disabled={!valid} className="btn-primary text-sm px-3 py-1.5">
          Add
        </button>
      </div>
    </div>
  );
}

function AccountEditor({
  open,
  account,
  onClose,
  onSaved,
}: {
  open: boolean;
  account: RegisteredAccount | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<RegisteredKind>('tfsa');
  const [label, setLabel] = useState('');
  const [room, setRoom] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (account) {
      setKind(account.kind);
      setLabel(account.label);
      setRoom(String(account.contribution_room));
      setNotes(account.notes ?? '');
    } else {
      setKind('tfsa');
      setLabel('');
      setRoom('');
      setNotes('');
    }
    setTouched({});
  }, [account, open]);

  const roomNum = Number(room);
  const errors = {
    label: !label.trim() ? 'Name is required.' : '',
    room:
      room === ''
        ? 'Contribution room is required.'
        : !Number.isFinite(roomNum) || roomNum < 0
          ? 'Enter 0 or more.'
          : '',
  };
  const valid = !errors.label && !errors.room;
  const kinds = Object.keys(KIND_META) as RegisteredKind[];

  const save = async () => {
    if (!valid) {
      setTouched({ label: true, room: true });
      return;
    }
    const payload = {
      kind,
      label: label.trim(),
      contribution_room: roomNum,
      notes: notes.trim() || null,
    };
    if (account) await window.api.registered.update(account.id, payload);
    else await window.api.registered.create(payload);
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={account ? 'Edit account' : 'Add a registered account'}
      description="Contribution room is the amount you can still contribute — find it on your CRA Notice of Assessment or My Account."
      size="md"
    >
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="label">Account type</label>
          <div className="grid grid-cols-3 gap-2">
            {kinds.map((k) => {
              const m = KIND_META[k];
              const active = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn(
                    'rounded-lg border p-2.5 text-sm font-medium transition',
                    active
                      ? 'border-brand bg-brand-soft text-brand'
                      : 'border-border text-content-muted hover:bg-surface-3'
                  )}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="reg-label">
            Name
          </label>
          <input
            id="reg-label"
            className={`input ${touched.label && errors.label ? 'input-error' : ''}`}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, label: true }))}
            placeholder="e.g. Questrade TFSA"
          />
          {touched.label && errors.label && <p className="field-error">{errors.label}</p>}
        </div>
        <div>
          <label className="label" htmlFor="reg-room">
            Contribution room (CAD)
          </label>
          <input
            id="reg-room"
            className={`input num ${touched.room && errors.room ? 'input-error' : ''}`}
            type="number"
            step="0.01"
            min="0"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, room: true }))}
            placeholder="0.00"
          />
          {touched.room && errors.room && <p className="field-error">{errors.room}</p>}
        </div>
        <div>
          <label className="label">Notes (optional)</label>
          <textarea
            className="input min-h-[60px]"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
      </div>
      <div className="px-6 py-4 border-t border-border flex justify-end gap-2 bg-surface-3/40">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={save} disabled={!valid}>
          {account ? 'Save changes' : 'Add account'}
        </button>
      </div>
    </Modal>
  );
}
