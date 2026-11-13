import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { Debt, Expense, ExpenseCategory, SavingsGoal } from '@shared/types';
import { useConfirm, useToast } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { useApi, useMonth } from '../data';
import { friendlyDate, nextBudgetLabel, todayIso } from '../dates';
import { money, pct } from '../format';
import { useQuickAdd } from '../PhoneLayout';
import MoneySheet from '../ui/MoneySheet';
import Sheet from '../ui/Sheet';
import { Bar, CircleButton, Group, NavHeader, PCard, Row, SectionTitle, StatTrio } from '../ui/kit';
import ExpenseEditor from '../expenses/ExpenseEditor';
import ExpenseRow from '../expenses/ExpenseRow';
import CategoryEditor from './CategoryEditor';

/** One category this month: budget vs spent, its expenses, and its recurring charges. */
export default function CategoryDetail() {
  const { id } = useParams();
  const catId = Number(id);
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { openQuickAdd } = useQuickAdd();
  const { data: v, reload } = useMonth();
  const { data: cats, reload: reloadCats } = useApi<ExpenseCategory[]>(() => window.api.expenseCategories.list());
  const { data: expenses } = useApi<Expense[]>(() => window.api.expenses.list());
  const { data: funds } = useApi<SavingsGoal[]>(() => window.api.goals.list());
  const { data: debts } = useApi<Debt[]>(() => window.api.debts.list());
  const [menu, setMenu] = useState(false);
  const [editBudget, setEditBudget] = useState(false);
  const [editCat, setEditCat] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const cat = cats?.find((c) => c.id === catId);
  if (!v || !cats || !expenses) return null;
  if (!cat) return <NavHeader title="Category not found" />;

  const line = v.lines.spend.find((l) => l.category_id === catId);
  const spent = line?.spent ?? v.unbudgeted.find((u) => u.category_id === catId)?.spent ?? 0;
  const left = line ? line.amount - spent : 0;
  const over = !!line && left < 0;
  const leftPct = line ? pct(Math.max(0, left), line.amount) : 0;
  const isRecurring = (e: Expense) => e.recurring_id != null || e.note === 'Recurring';
  const today = todayIso();
  const list = expenses
    .filter((e) => e.category_id === catId && e.date.startsWith(v.month) && !isRecurring(e))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  const fixed = v.recurring.items.filter((r) => r.category_id === catId);
  const fundName = new Map((funds ?? []).map((f) => [f.id, f.name]));
  const cardName = new Map((debts ?? []).map((d) => [d.id, d.name]));

  return (
    <div className="space-y-4">
      <NavHeader title={cat.name} right={<CircleButton icon={MoreHorizontal} label="Options" onClick={() => setMenu(true)} />} />

      <PCard className="px-[18px] pt-[18px] pb-4">
        {line ? (
          <>
            <div className={cn('text-[28px] leading-none font-display font-bold num-display', over && 'text-danger')}>
              {money(Math.abs(left))}
            </div>
            <div className="mt-1.5 text-[15px] text-content-muted">
              {over ? `over the ${money(line.amount)} budget` : `left of ${money(line.amount)}`} · {v.daysLeft} day
              {v.daysLeft === 1 ? '' : 's'} to go
            </div>
            <div className="mt-4">
              <Bar
                pct={over ? 100 : leftPct}
                color={cat.color}
                over={over}
                label={over ? 'Over budget' : `${Math.round(leftPct)}% left`}
              />
            </div>
          </>
        ) : (
          <>
            <div className="text-[28px] leading-none font-display font-bold num-display">{money(spent)}</div>
            <div className="mt-1.5 text-[15px] text-content-muted">spent · not in this month’s plan</div>
          </>
        )}
        <div className="mt-4 pt-3 border-t border-border/70">
          <StatTrio
            items={[
              { label: 'Spent', value: money(spent) },
              {
                label: 'Per day now',
                value: line && left > 0 && v.daysLeft > 0 ? money(left / v.daysLeft) : '—',
              },
              { label: 'Resets', value: nextBudgetLabel(v.month) },
            ]}
          />
        </div>
      </PCard>

      <SectionTitle
        right={
          <button
            onClick={() => openQuickAdd({ categoryId: catId, manual: true })}
            className="inline-flex items-center gap-1 text-[15px] font-medium"
          >
            <Plus size={17} /> Log expense
          </button>
        }
      >
        Expenses
      </SectionTitle>
      {list.length === 0 ? (
        <p className="text-sm text-content-subtle px-1">Nothing logged here this month.</p>
      ) : (
        [
          { title: 'Today', rows: list.filter((e) => e.date === today), showDate: false },
          { title: 'Earlier this month', rows: list.filter((e) => e.date !== today), showDate: true },
        ]
          .filter((g) => g.rows.length > 0)
          .map((g) => (
            <div key={g.title}>
              <div className="px-1 mb-1.5 text-[13px] font-semibold uppercase tracking-wide text-content-subtle">
                {g.title}
              </div>
              <Group>
                {g.rows.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    category={cat}
                    hideCategory
                    hideDate={!g.showDate}
                    byName
                    fundName={e.fund_id != null ? fundName.get(e.fund_id) : undefined}
                    cardName={e.debt_id != null ? cardName.get(e.debt_id) : undefined}
                    onClick={() => setEditing(e)}
                  />
                ))}
              </Group>
            </div>
          ))
      )}

      {fixed.length > 0 && (
        <>
          <SectionTitle>Recurring · taken off the top</SectionTitle>
          <Group>
            {fixed.map((r) => (
              <Row
                key={`${r.recurring_id}-${r.date}`}
                emoji={r.emoji}
                color={cat.color}
                title={r.description}
                subtitle={`${friendlyDate(r.date)}${r.logged ? '' : ' · upcoming'}`}
                value={money(r.amount)}
                valueTone="muted"
              />
            ))}
          </Group>
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={cat.name}>
        <Group>
          <Row title="Edit budget" subtitle="This month's amount" chevron onClick={() => { setMenu(false); setEditBudget(true); }} />
          <Row title="Edit category" subtitle="Name, icon, colour, need or want" chevron onClick={() => { setMenu(false); setEditCat(true); }} />
          <Row
            title={<span className="text-danger">Delete category</span>}
            subtitle="Its expenses stay, uncategorized"
            onClick={async () => {
              setMenu(false);
              const ok = await confirm({
                title: `Delete ${cat.name}?`,
                description: 'Expenses in it are kept but lose their category. It also leaves this month’s plan.',
                confirmLabel: 'Delete',
                destructive: true,
              });
              if (!ok) return;
              await window.api.expenseCategories.remove(cat.id);
              toast.success('Category deleted.');
              navigate('/', { replace: true });
            }}
          />
        </Group>
      </Sheet>

      {editBudget && (
        <MoneySheet
          title={`${cat.name} budget`}
          subtitle={`How much to spend on ${cat.name.toLowerCase()} this month. Spent so far: ${money(spent)}.`}
          initial={line?.amount ?? null}
          allowZero
          onClose={() => setEditBudget(false)}
          onSave={async (amount) => {
            await window.api.budget.setLine(v.month, 'spend', cat.id, amount);
            setEditBudget(false);
            await reload();
          }}
        >
          {line && (
            <button
              className="w-full py-3 text-[15px] font-semibold text-danger"
              onClick={async () => {
                await window.api.budget.removeLine(v.month, 'spend', cat.id);
                setEditBudget(false);
                await reload();
              }}
            >
              Remove from this month's plan
            </button>
          )}
        </MoneySheet>
      )}
      {editCat && (
        <CategoryEditor
          category={cat}
          onClose={() => setEditCat(false)}
          onSaved={async () => {
            setEditCat(false);
            await reloadCats();
            await reload();
          }}
        />
      )}
      {editing && <ExpenseEditor expense={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
