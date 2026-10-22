# iPhone Budget Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the iPhone app into a DaTrack-style monthly zero-based budget (Budget / Expenses / More + quick-add), with funds, payday check-ins, a new onboarding with Markdown export, and reminders — without changing the Windows app's screens.

**Architecture:** One additive migration (v13) plus pure modules in `shared/` and new repo functions in `core/repo.ts`, wired through the existing 4-file IPC pattern. The renderer branches once in `App.tsx` on `useIsMobile()`: desktop keeps today's routes; phone gets a new `src/phone/` app shell that reuses Payoff/Registered/Reports/Settings pages.

**Tech Stack:** React 18, TypeScript, Vite 6, Tailwind 3, date-fns 4, lucide-react, Recharts, Capacitor 6 (LocalNotifications, Filesystem, Share), sql.js / node:sqlite / better-sqlite3 behind `core/db.ts`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-iphone-budget-redesign-design.md`

## Global Constraints

- Positional `?` binding only in SQL; no named parameters (sql.js/node:sqlite shims).
- `core/` stays platform-neutral (no DOM, Electron, Capacitor). Pure helpers go in `shared/`.
- Every repo-backed channel: `shared/ipc.ts` → `core/repo.ts` → `core/apiMap.ts` (correct `mutates`) → `electron/preload.ts` AND `src/platform/ios/api.ts`.
- New bundled libraries go in `devDependencies` (none are planned).
- Desktop (≥ `md`) layout must stay pixel-identical; phone work lives under `src/phone/`.
- Currency CAD, `en-CA`; use `fmtMoney` from `src/lib/format.ts`.
- "Today" is the LOCAL date: `formatISO(new Date(), { representation: 'date' })`. Never `toISOString().slice(0,10)` in new code.
- Months are `'YYYY-MM'` strings; days are `'YYYY-MM-DD'`.
- Run tools via node: `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit -p .`, `node node_modules/vite/bin/vite.js build` (and `--config vite.config.ios.ts`).
- Commit messages end with the Co-Authored-By / Claude-Session trailer lines.

## Review Focus

1. **Evening dates** — after 8 pm in Toronto the UTC date is tomorrow; month/payday/report math must use the local date. Pure modules take `today` as a parameter; tests pass explicit dates.
2. **Day 29–31 anchors** — a monthly payday or recurring item on the 31st must land on Feb 28/29 and return to the 31st in March (compute from the anchor by index, never step from the previous occurrence). Tests in Task 1.
3. **Deleting things a plan references** — deleting a category, fund or debt with budget lines and expenses must remove the lines, keep the expenses, and leave `budgetMonth()` working. Test in Task 5.
4. **Messy quick-add text** — "$1,234.56 rent", "7-eleven 12", "2 coffees 9", "coffee" (no amount), trailing commas. Tests in Task 2.
5. **Upgrading Kevin's real database** — a v12 database with goals, custom categories, `note='Recurring'` expenses and paychecks must migrate with balances unchanged. Test in Task 4.

---

## File Structure

**Create**
- `shared/emoji.ts` — keyword → emoji / need-want suggestions.
- `shared/recurrence.ts` — anchor-indexed occurrence math for recurring templates.
- `shared/paydays.ts` — payday enumeration, guaranteed counts, bonus classification.
- `shared/quickAdd.ts` — smart-text parser.
- `shared/budgetExport.ts` — Markdown export builder.
- `test/unit/emoji.test.ts`, `test/unit/recurrence.test.ts`, `test/unit/paydays.test.ts`, `test/unit/quickAdd.test.ts`, `test/unit/budgetExport.test.ts`
- `test/migrationV13.test.ts`
- `src/phone/**` — phone app (see spec's tree).
- `scripts/phone-shots.mjs` — headless Edge (CDP) screenshot driver for visual checks.

**Modify**
- `shared/types.ts`, `shared/ipc.ts`, `core/migrations.ts`, `core/repo.ts`, `core/apiMap.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`, `src/platform/ios/api.ts`, `src/platform/ios/files.ts`, `src/platform/ios/notify.ts`, `src/App.tsx`, `src/lib/theme.tsx`, `src/pages/Settings.tsx`, `src/pages/Dashboard.tsx` (drop phone branch), `test/shared/repoContract.ts`, `test/apiMap.test.ts`, `CLAUDE.md`.

**Delete**
- `src/pages/MobileDashboard.tsx` (only reachable on phone, replaced by Budget).

---

## Phase 1 — Data layer

### Task 1: Pure date modules (emoji, recurrence, paydays)

**Files:**
- Create: `shared/emoji.ts`, `shared/recurrence.ts`, `shared/paydays.ts`
- Modify: `shared/types.ts` (add `PayFrequency`, `CategoryKind`)
- Test: `test/unit/emoji.test.ts`, `test/unit/recurrence.test.ts`, `test/unit/paydays.test.ts`

**Interfaces:**
- Produces:
  - `type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly'` (types.ts)
  - `type CategoryKind = 'need' | 'want'` (types.ts)
  - `suggestEmoji(name: string, fallback?: string): string` (default fallback `'📦'`)
  - `suggestKind(name: string): CategoryKind`
  - `nthOccurrence(anchor: string, freq: RecurringFrequency, interval: number, n: number): string`
  - `occurrencesInRange(anchor: string, freq: RecurringFrequency, interval: number, from: string, to: string): string[]` (inclusive, ascending; nothing before the anchor)
  - `latestOccurrenceOnOrBefore(anchor, freq, interval, date): string | null`
  - `guaranteedPerMonth(freq: PayFrequency): number` → weekly 4, biweekly 2, semi_monthly 2, monthly 1
  - `paydaysInMonth(anchor: string, freq: PayFrequency, month: string): Array<{ date: string; kind: 'regular' | 'bonus' }>`
  - `nextPaydayAfter(anchor: string, freq: PayFrequency, after: string): string` (strictly after)
  - `monthOf(date: string): string`, `monthBounds(month: string): { start: string; end: string; days: number }`, `addMonthsToMonth(month: string, n: number): string`

- [ ] **Step 1: Write failing tests**

```ts
// emoji.test.ts
expect(suggestEmoji('Rent')).toBe('🏠');
expect(suggestEmoji('Groceries & household')).toBe('🛒');
expect(suggestEmoji('Eating out')).toBe('🍔');
expect(suggestEmoji('zzzz')).toBe('📦');
expect(suggestKind('Rent')).toBe('need');
expect(suggestKind('Groceries')).toBe('need');
expect(suggestKind('Entertainment')).toBe('want');

// recurrence.test.ts
expect(occurrencesInRange('2026-01-31', 'monthly', 1, '2026-01-01', '2026-04-30'))
  .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
expect(occurrencesInRange('2026-02-15', 'monthly', 6, '2026-01-01', '2027-03-01'))
  .toEqual(['2026-02-15', '2026-08-15', '2027-02-15']);
expect(occurrencesInRange('2026-10-05', 'weekly', 2, '2026-10-01', '2026-10-31'))
  .toEqual(['2026-10-05', '2026-10-19']);
expect(occurrencesInRange('2026-10-05', 'biweekly', 1, '2026-10-01', '2026-10-31'))
  .toEqual(['2026-10-05', '2026-10-19']);
expect(occurrencesInRange('2026-06-01', 'monthly', 1, '2026-01-01', '2026-05-31')).toEqual([]);
expect(latestOccurrenceOnOrBefore('2026-01-31', 'monthly', 1, '2026-03-15')).toBe('2026-02-28');

// paydays.test.ts
expect(paydaysInMonth('2026-10-09', 'biweekly', '2026-10')).toEqual([
  { date: '2026-10-09', kind: 'regular' }, { date: '2026-10-23', kind: 'regular' }]);
// anchor later than month → walks backwards
expect(paydaysInMonth('2026-11-06', 'biweekly', '2026-10').map(p => p.date))
  .toEqual(['2026-10-09', '2026-10-23']);
// three-payday month: last one is the bonus (Jan 2027: 1, 15, 29)
expect(paydaysInMonth('2026-10-09', 'biweekly', '2027-01')).toEqual([
  { date: '2027-01-01', kind: 'regular' }, { date: '2027-01-15', kind: 'regular' },
  { date: '2027-01-29', kind: 'bonus' }]);
expect(paydaysInMonth('2026-01-31', 'monthly', '2026-02')).toEqual([{ date: '2026-02-28', kind: 'regular' }]);
expect(paydaysInMonth('2026-10-15', 'semi_monthly', '2026-02').map(p => p.date)).toEqual(['2026-02-15', '2026-02-28']);
expect(paydaysInMonth('2026-10-02', 'weekly', '2026-10').map(p => p.kind))
  .toEqual(['regular', 'regular', 'regular', 'regular', 'bonus']);
expect(nextPaydayAfter('2026-10-09', 'biweekly', '2026-10-22')).toBe('2026-10-23');
expect(nextPaydayAfter('2026-10-09', 'biweekly', '2026-10-23')).toBe('2026-11-06');
expect(guaranteedPerMonth('weekly')).toBe(4);
expect(monthBounds('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29', days: 29 });
expect(addMonthsToMonth('2026-12', 1)).toBe('2027-01');
```

- [ ] **Step 2: Run `node node_modules/vitest/vitest.mjs run test/unit` — expect FAIL (modules missing).**
- [ ] **Step 3: Implement the three modules.** Recurrence: occurrence `n` = anchor + n×interval units via date-fns `addWeeks/addDays(14)/addMonths/addYears` applied to the ANCHOR (not the previous occurrence), which gives the 31st → 28th → 31st behavior. Paydays: weekly/biweekly lattice through the anchor in both directions; monthly = anchor's day clamped with `getDaysInMonth`; semi_monthly = 15th and last day. Mark indices ≥ `guaranteedPerMonth` as `'bonus'`.
- [ ] **Step 4: Run unit tests — expect PASS.**
- [ ] **Step 5: Commit** `feat(shared): emoji, recurrence and payday helpers`.

### Task 2: Quick-add parser

**Files:** Create `shared/quickAdd.ts`; Test `test/unit/quickAdd.test.ts`

**Interfaces:**
- Produces:
  - `interface QuickAddDraft { raw: string; description: string; amount: number | null; date: string; category_id: number | null }`
  - `interface QuickAddContext { today: string; categories: Array<{ id: number; name: string }>; history: Array<{ description: string; category_id: number | null }> /* most recent first */ }`
  - `parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddDraft[]`

- [ ] **Step 1: Failing tests** (ctx.today = `'2026-10-22'` — a Thursday; categories Groceries=1, Dining=2, Gas=3, Transport=4, Other=9; history `[{description:'Esso', category_id:3}]`):

```ts
expect(parseQuickAdd('coffee 5, gas 50', ctx)).toMatchObject([
  { description: 'Coffee', amount: 5, date: '2026-10-22', category_id: 2 },
  { description: 'Gas', amount: 50, date: '2026-10-22', category_id: 3 }]);
expect(parseQuickAdd('Esso 40 yesterday', ctx)[0]).toMatchObject({ description: 'Esso', amount: 40, date: '2026-10-21', category_id: 3 });
expect(parseQuickAdd('$1,234.56 rent', ctx)[0]).toMatchObject({ amount: 1234.56, description: 'Rent' });
expect(parseQuickAdd('7-eleven 12', ctx)[0]).toMatchObject({ description: '7-eleven', amount: 12 });
expect(parseQuickAdd('2 coffees 9', ctx)[0]).toMatchObject({ description: '2 coffees', amount: 9 });
expect(parseQuickAdd('uber 18.40 monday', ctx)[0]).toMatchObject({ date: '2026-10-19', category_id: 4 });
expect(parseQuickAdd('lunch 12 3 days ago', ctx)[0]).toMatchObject({ date: '2026-10-19', amount: 12 });
expect(parseQuickAdd('no frills 41.15 oct 3', ctx)[0]).toMatchObject({ date: '2026-10-03', category_id: 1 });
expect(parseQuickAdd('coffee', ctx)[0]).toMatchObject({ amount: null });
expect(parseQuickAdd('coffee 5,, ', ctx)).toHaveLength(1);
expect(parseQuickAdd('coffee 5 and gas 50', ctx)).toHaveLength(2);
expect(parseQuickAdd('mystery 5', ctx)[0].category_id).toBe(9); // falls back to "Other"
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Keyword table maps words → canonical category names with synonyms (e.g. coffee/lunch/dinner/restaurant/tim hortons → Dining|Eating out|Food; no frills/grocer/loblaws/walmart → Groceries; gas/esso/petro/shell → Gas|Transport; uber/ttc/presto/transit → Transport). Resolve to a user category by case-insensitive name; history beats keywords; then "Other".
- [ ] **Step 4: Run — PASS.**
- [ ] **Step 5: Commit** `feat(shared): quick-add expense parser`.

### Task 3: Markdown export builder

**Files:** Create `shared/budgetExport.ts`; Test `test/unit/budgetExport.test.ts`

**Interfaces:**
- Consumes: `periodRate` (`shared/debtMath.ts`), `guaranteedPerMonth` (Task 1), types `Debt`, `RecurringExpense`, `SavingsGoal`, `PayFrequency`.
- Produces:
  - `interface BudgetExportInput { userName: string; today: string; pay: { amount: number | null; frequency: PayFrequency }; recurring: RecurringExpense[]; debts: Debt[]; funds: SavingsGoal[]; categories: Array<{ name: string; kind: CategoryKind; avgMonthly: number }> }`
  - `buildBudgetMarkdown(input: BudgetExportInput): string`
  - `monthlyEquivalent(r: { amount: number; frequency: RecurringFrequency; interval_count: number }): number` (weekly ×52/12/n, biweekly ×26/12/n, monthly ÷n, yearly ÷12/n)

- [ ] **Step 1: Failing tests:** for pay `{amount:1200, frequency:'biweekly'}` the output contains `'$2,400.00'` and `'every 2 weeks'`; a Visa debt balance 1000 @ 19.99% monthly compounding shows est. interest `'$16.66'`; contains headings `'## Income'`, `'## Recurring expenses'`, `'## Debts'`, `'## Savings goals'`, `'## Spending categories'`; ends with the reply-format instruction `'Category | Need/Want | Monthly amount'`; empty debts list renders `'_None_'`; `monthlyEquivalent({amount: 1300, frequency:'monthly', interval_count: 6})` ≈ 216.67.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** (GitHub-flavored tables, money via a local `Intl.NumberFormat('en-CA', {style:'currency',currency:'CAD'})`). **Step 4: PASS.** **Step 5: Commit** `feat(shared): markdown budget export`.

### Task 4: Migration v13, types and settings

**Files:**
- Modify: `core/migrations.ts`, `shared/types.ts`, `core/repo.ts` (`getSettings` only)
- Test: `test/migrationV13.test.ts`, `test/shared/repoContract.ts` (settings defaults)

**Interfaces:**
- Produces (types.ts):
  - `ExpenseCategory += { emoji: string | null; kind: CategoryKind; sort_order: number | null }`; `ExpenseCategoryInput { name: string; color: string; emoji?: string | null; kind?: CategoryKind; sort_order?: number | null }`
  - `SavingsGoal += { emoji: string | null }`; `SavingsGoalInput += { emoji?: string | null }`
  - `Expense += { fund_id: number | null; recurring_id: number | null }`; `ExpenseInput += { fund_id?: number | null }`
  - `RecurringExpense += { interval_count: number; emoji: string | null }`; `RecurringExpenseInput += { interval_count?: number; emoji?: string | null; archived?: boolean }`
  - `Paycheck += { payday: string | null }`
  - `AppSettings += { pay_amount: number | null; pay_frequency: PayFrequency; notify_daily_log: boolean; notify_daily_time: string; notify_new_month: boolean; notify_weekly_report: boolean }`
  - `BudgetLineKind = 'spend' | 'fund' | 'debt'`, `FundTransaction { id; goal_id; kind: 'deposit' | 'withdrawal'; amount; date; note: string | null; created_at }`
- Migration helper: extract v11's per-table trigger block into `addSyncTracking(db: DB, table: string): void` used by v11 and v13.

- Produces: `runMigrations(db: DB, maxVersion = Infinity): void` — the optional ceiling exists so tests can build a genuine v12 database.

- [ ] **Step 1: Failing tests.** `migrationV13.test.ts`: `wrapNodeSqlite(makeNodeSqliteDb())`, `runMigrations(db, 12)`, then seed with RAW SQL (repo functions expect v13 columns) a goal + a `kind='goal'` allocation of 300, categories `Groceries` and `Gaming`, a recurring template "Spotify 11.99" and an expense `('Spotify', 11.99, note 'Recurring')`; after v13: `PRAGMA table_info(expense_categories)` has `emoji, kind, sort_order`; Groceries `kind='need'`, emoji `'🛒'`; Gaming `kind='want'`; the Spotify expense has `recurring_id` = template id; tables `budget_months`, `budget_lines`, `fund_transactions` exist with `uuid` columns and `_sync_del` triggers; `listGoals()[0].current_amount === 300`. Contract: fresh DB `getSettings()` has `theme: 'light'`, `pay_frequency: 'biweekly'`, `pay_amount: null`, `notify_daily_time: '19:00'`, `notify_daily_log: true`.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement migration v13 `budget_redesign`** exactly per spec §"Data model" (columns, tables, `UNIQUE(month, kind, ref_id)`, index `idx_budget_lines_month`, `idx_fund_tx_goal`, `idx_expenses_fund`), backfills via `suggestEmoji/suggestKind`, `addSyncTracking` for the 3 new tables; seed defaults per spec (theme seed `'light'`). `getSettings`: parse the new keys (`pay_amount` → `Number` or null when blank/invalid; frequency validated against the 4 values, default `'biweekly'`; theme fallback `'light'`).
- [ ] **Step 4: Run full suite — PASS** (v11/v12 tests must still pass after the helper extraction).
- [ ] **Step 5: Commit** `feat(db): migration v13 for the monthly budget`.

### Task 5: Repo — categories, funds, expenses, recurring

**Files:** Modify `core/repo.ts`; Test `test/shared/repoContract.ts`

**Interfaces:**
- Consumes: Task 1 recurrence helpers; Task 4 types.
- Produces:
  - `createExpenseCategory/updateExpenseCategory` accept `emoji, kind, sort_order` (create defaults emoji/kind via `suggestEmoji/suggestKind`); `listExpenseCategories()` orders by `COALESCE(sort_order, 1000000), name`.
  - `createGoal/updateGoal` accept `emoji` (default `suggestEmoji(name, '💰')`).
  - `fundBalance(goalId: number): number` (internal) — spec formula; used by `listGoals`, `listArchivedGoals`, `updateGoal`, `restoreGoal`, `createGoal`.
  - `addFundTransaction(input: { goal_id: number; kind: 'deposit' | 'withdrawal'; amount: number; date: string; note?: string | null }): FundTransaction`
  - `deleteFundTransaction(id: number): { ok: true }`
  - `fundActivity(goalId: number): FundActivityItem[]` where `FundActivityItem { id: string; date: string; kind: 'contribution' | 'deposit' | 'withdrawal' | 'spend' | 'paycheck'; amount: number /* signed */; label: string; ref_id: number | null }`, newest first.
  - `createExpense/updateExpense` handle `fund_id` (and `debt_id` set → `fund_id` forced null and vice versa: fund wins if both given).
  - `listRecurringExpenses(includeArchived = false)`; `createRecurringExpense/updateRecurringExpense` accept `interval_count, emoji, archived`; resuming (archived 1→0) sets `last_generated = latestOccurrenceOnOrBefore(anchor, …, today)`.
  - `materializeRecurringExpenses()` uses `occurrencesInRange` from the anchor and sets `recurring_id`.
  - `deleteExpenseCategory`, `hardDeleteGoal`, `deleteDebt` also `DELETE FROM budget_lines WHERE kind = ? AND ref_id = ?`.

- [ ] **Step 1: Failing contract tests:**
  - new category "Rent" → `emoji '🏠'`, `kind 'need'`.
  - fund balance: goal + deposit 100 + withdrawal 30 + expense 20 paid from fund → `current_amount === 50`; `fundActivity` has 3 items with signed amounts `[−20, −30, 100]` by date order newest first (dates 3rd, 2nd, 1st).
  - expense with `fund_id` and `debt_id` → stored `debt_id null`, card balance unchanged.
  - recurring `interval_count: 6` monthly anchored `2026-02-15`, today-independent: `materialize` with anchor in the past generates only anchor-indexed dates ≤ today and each has `recurring_id`.
  - pause then resume a template whose anchor is 3 months back → no back-filled expenses after resume (count unchanged).
  - deleting a category referenced by a budget line removes the line; its expenses remain with `category_id null` (Review Focus #3).
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement.** **Step 4: Run full suite — PASS.**
- [ ] **Step 5: Commit** `feat(repo): funds ledger, category emoji/kind, recurring intervals`.

### Task 6: Repo — budget month, plan lines, paydays

**Files:** Modify `core/repo.ts`, `shared/types.ts`; Test `test/shared/repoContract.ts`

**Interfaces:**
- Consumes: Tasks 1, 4, 5.
- Produces (types.ts):
  - `MonthStatus = 'none' | 'draft' | 'confirmed'`; `PaceStatus = 'on_track' | 'fast' | 'over'`
  - `Payday { date: string; kind: 'regular' | 'bonus'; expected: number; paycheck: { id: number; amount: number } | null; snoozed: boolean }`
  - `RecurringOccurrence { recurring_id: number; description: string; emoji: string | null; amount: number; date: string; category_id: number | null; logged: boolean }`
  - `SpendLineView { category_id; name; emoji; color; kind: CategoryKind; amount; spent; left }`, `FundLineView { goal_id; name; emoji; color; amount; balance; target }`, `DebtLineView { debt_id; name; type: DebtType; amount; balance }`
  - `BudgetMonthView { month; status; today; daysInMonth; daysLeft; paydays: Payday[]; income: number; recurring: { items: RecurringOccurrence[]; total: number }; lines: { spend: SpendLineView[]; fund: FundLineView[]; debt: DebtLineView[] }; planned: { spend; fund; debt; needs; wants }; leftToAllocate; spent: { total; needs; wants }; leftToSpend; needsLeft; wantsLeft; safePerDay; pace: PaceStatus; wantsEatingNeeds: boolean; unbudgeted: Array<{ category_id: number | null; name; emoji; color; kind: CategoryKind; spent }> }`
  - `PlanLineInput { kind: BudgetLineKind; ref_id: number; amount: number }`
- Produces (repo.ts):
  - `budgetMonth(month?: string): BudgetMonthView` (default current local month; creates draft by copying the latest earlier month; `'none'` if no earlier month)
  - `setBudgetLine(month: string, kind: BudgetLineKind, refId: number, amount: number): BudgetMonthView`
  - `removeBudgetLine(month: string, kind: BudgetLineKind, refId: number): BudgetMonthView`
  - `saveBudgetPlan(month: string, lines: PlanLineInput[], confirm: boolean): BudgetMonthView` (replaces all lines of the month in one transaction)
  - `confirmBudgetMonth(month: string): BudgetMonthView`
  - `confirmPayday(payday: string, amount: number): BudgetMonthView`
  - `snoozePayday(payday: string): { ok: true }`
  - internal: `applyDebtLineDelta(debtId, delta)` (positive delta pays down, clamped at 0; negative adds back), `mirrorSpendLinesToLegacyBudgets(month)` (only when `month` is the current month).

- [ ] **Step 1: Failing contract tests** (use dates relative to `budgetMonth()`'s `today`; set `pay_amount 1200`, `pay_frequency biweekly`, `next_paycheck_date` = a payday inside the current month):
  - empty DB → `budgetMonth().status === 'none'`, no `budget_months` row.
  - `saveBudgetPlan(M, [spend Groceries 300, fund F 200, debt Visa 100], true)` → status `confirmed`; fund F `current_amount` 200; Visa balance 500 → 400; `planned.spend 300`; `leftToAllocate === income − recurring − 600`.
  - `setBudgetLine(M,'debt',visa,150)` on the confirmed month → Visa balance 350 (delta applied).
  - expenses this month: 50 Groceries, 20 paid from F, 11.99 materialized recurring → `spent.total === 50`; Groceries `left 250`; F balance 180.
  - next month `budgetMonth(next)` → `draft`, same lines copied, F contribution NOT counted until `confirmBudgetMonth(next)`.
  - archived fund is not copied into the next month's draft.
  - `confirmPayday(regularDate, 1150)` → `income` drops by 50; payday shows `paycheck.amount 1150`; `next_paycheck_date` moves past today.
  - bonus payday confirmed adds its full amount to income; unconfirmed bonus adds nothing.
  - `snoozePayday(d)` → that payday `snoozed: true` today.
  - current-month spend lines are mirrored: `listExpenseBudgets()` shows Groceries limit 300.
  - pace: planned 300, spent 290 on day 1 of a 30-day month → `'fast'`; spent 310 → `'over'`.
- [ ] **Step 2: Run — FAIL.** **Step 3: Implement** per spec §"Month math". Use `materializeRecurringExpenses()` first so `logged` is accurate. **Step 4: PASS (both drivers).**
- [ ] **Step 5: Commit** `feat(repo): monthly budget, plan lines and payday check-ins`.

### Task 7: Repo — weekly report and bill import

**Files:** Modify `core/repo.ts`, `shared/types.ts`; Test `test/shared/repoContract.ts`

**Interfaces:**
- Produces:
  - `WeeklyReport { weekStart; weekEnd; total; previousTotal; changePct: number | null; dailyAverage; weeks: Array<{ weekStart: string; total: number }> /* 4, oldest first */; biggestDay: { date: string; total: number } | null; byCategory: Array<{ category_id: number | null; name; emoji; color; total; previous }>; fundsAdded: number; insights: string[] }`
  - `weeklyReport(weekStart?: string): WeeklyReport` (default: Monday of LAST full week)
  - `importBillsAsRecurring(): { imported: number }` — active bills not already imported (match on description + amount) become templates: frequency map biweekly→(weekly,2), monthly→(monthly,1), semi_annual→(monthly,6), yearly→(yearly,1), custom_days N→ (weekly, N/7) when N%7==0 else (monthly, max(1, round(N/30))); anchor = next due on/after today; `last_generated = null`.
- [ ] **Step 1: Failing tests:** week of 2026-10-12 with expenses Mon 10, Sun 84.70; previous week 50 → `total 94.7`, `changePct ≈ 89.4`, `biggestDay.date '2026-10-18'`, `insights[0]` contains `'Sunday'` and `'$84.70'`; previous week 0 → `changePct null`. Import: a monthly bill "Rent 1450" anchored 2026-01-01 → one template, interval 1, anchor ≥ today; calling twice imports 0 the second time.
- [ ] **Step 2: FAIL.** **Step 3: Implement.** **Step 4: PASS.** **Step 5: Commit** `feat(repo): weekly report and bill import`.

### Task 8: IPC wiring + export platform channel

**Files:** Modify `shared/ipc.ts`, `core/apiMap.ts`, `electron/preload.ts`, `electron/ipc/handlers.ts`, `src/platform/ios/api.ts`, `src/platform/ios/files.ts`, `test/apiMap.test.ts`

**Interfaces:**
- Channels (all `w` except where marked `r`): `BUDGET_MONTH 'budget:month'`, `BUDGET_SET_LINE 'budget:setLine'`, `BUDGET_REMOVE_LINE 'budget:removeLine'`, `BUDGET_SAVE_PLAN 'budget:savePlan'`, `BUDGET_CONFIRM 'budget:confirm'`, `PAYDAY_CONFIRM 'paydays:confirm'`, `PAYDAY_SNOOZE 'paydays:snooze'`, `FUND_ADD_TX 'funds:addTransaction'`, `FUND_DELETE_TX 'funds:deleteTransaction'`, `FUND_ACTIVITY 'funds:activity'` (r), `REPORT_WEEKLY 'reports:weekly'` (r), `IMPORT_BILLS_RECURRING 'recurring:importBills'`; platform: `EXPORT_TEXT 'files:exportText'`.
- Renderer namespaces (identical in preload and iOS api): `budget.{month(m?), setLine(m,kind,ref,amt), removeLine(m,kind,ref), savePlan(m,lines,confirm), confirm(m)}`, `paydays.{confirm(date,amt), snooze(date)}`, `funds.{addTransaction(input), removeTransaction(id), activity(goalId)}`, `reports.weekly(weekStart?)`, `recurringExpenses.list(includeArchived?)`, `recurringExpenses.importBills()`, `files.exportText(name, content): Promise<{ ok: boolean; path?: string }>`.
- Desktop `files:exportText`: save dialog, filter `{ name: 'Markdown', extensions: ['md'] }`, UTF-8 without BOM. iOS: `Filesystem.writeFile` to `Directory.Cache` (UTF-8, no BOM) + `Share.share`.

- [ ] **Step 1:** Add `IPC.EXPORT_TEXT` to `PLATFORM_CHANNELS` in `test/apiMap.test.ts`; add an assertion that `budget:month` and `funds:activity` mutate as `true`/`false`. Run — FAIL.
- [ ] **Step 2:** Wire all channels. Run full suite + `tsc --noEmit` — PASS.
- [ ] **Step 3: Commit** `feat(ipc): budget, paydays, funds, weekly report and text export channels`.

## Phase 2 — Phone UI

UI tasks are verified by `tsc --noEmit`, both `vite build`s, and the screenshot harness (Task 18). Each ends with a commit.

### Task 9: Phone shell and visual primitives

**Files:**
- Create: `src/phone/PhoneApp.tsx`, `src/phone/PhoneLayout.tsx`, `src/phone/TabBar.tsx`, `src/phone/ui/{EmojiAvatar,HatchedBar,Gauge,Sheet,ScreenHeader,BigButton,Banner,Card,MoneyInput,Segmented}.tsx`, `src/phone/ui/pastel.ts`, `src/phone/data.ts`
- Modify: `src/App.tsx`, `src/lib/theme.tsx` (fallback theme `'light'`), `src/pages/Dashboard.tsx` (remove phone branch), delete `src/pages/MobileDashboard.tsx`, `src/pages/Settings.tsx` (hide home-layout picker)

**Interfaces:**
- `PhoneApp` routes: `/` → BudgetScreen, `/category/:id`, `/fund/:id`, `/expenses`, `/expenses/week/:start?`, `/recurring`, `/more`, `/payoff`, `/registered`, `/reports`, `/settings`, `/pay-history`, `/setup` (budget setup for existing users), `*` → `/`.
- Gates: `!onboarded` → `<PhoneOnboarding />` (Task 16).
- `pastel(hex: string, theme: 'light'|'dark'): string` returns an opaque CSS color.
- `useMonth(): { view: BudgetMonthView | null; reload(): Promise<void> }` in `data.ts` (also exported `useAsync<T>(fn, deps)`), plus an app-wide `refreshKey` context so the quick-add sheet can refresh the visible screen.
- `HatchedBar({ pct /* 0–100 filled */, color, badge /* e.g. '76%' */, over?: boolean })`, `Gauge({ fraction /* 0–1 */, tone: 'success'|'warning'|'danger', label, value })`, `Sheet({ open, onClose, title?, children, footer? })` (bottom sheet with grabber), `EmojiAvatar({ emoji, color, size: 'sm'|'md'|'lg'|'xl' })`.
- TabBar: Budget (`/`), Expenses (`/expenses`), More (`/more`) pill + separate round **+** button opening the quick-add sheet (Task 13).

- [ ] Implement; `tsc` + both builds pass; commit `feat(phone): app shell, tab bar and visual primitives`.

### Task 10: Budget screen (Spending + Saving tabs)

**Files:** Create `src/phone/budget/{BudgetScreen,SpendingTab,SavingTab,PaydayCard,BonusSheet,PlanSummary}.tsx`

**Interfaces:** Consumes `window.api.budget.month`, `paydays.*`, `goals.list/listArchived`, Task 9 primitives.
- Header: "Budget", status line (`On Track` / `Spending fast` / `Over budget` · `October 2026`), right action "Edit plan" → PlanEditor (Task 11).
- `status === 'none'` → empty state "Set up your budget" → `/setup`.
- `status === 'draft'` → banner "November isn't confirmed yet" → review (Task 11).
- Gauge (fraction = leftToSpend / planned.spend clamped 0–1), pill "$X / day safe to spend · Next budget Nov 1" with an info sheet explaining the math.
- Banners: pending paydays (PaydayCard: Yes / Different amount / Not yet; bonus → BonusSheet), `leftToAllocate ≠ 0`, `wantsEatingNeeds`, no pay set.
- Segmented Spending | Saving. Spending: filter All / Needs / Wants, sort (% used / name), cards (EmojiAvatar, name, chevron, HatchedBar with % LEFT badge, "$x left"/"$x over", budget amount) → `/category/:id`; unbudgeted categories with "No budget · $x spent"; PlanSummary card (Income, Fixed → `/recurring`, Debt → `/payoff`, Saving, Spending). Saving: "Total saved", Add fund, filter Active / Completed / All / In this budget, fund cards → `/fund/:id`.
- [ ] Implement; checks pass; commit `feat(phone): budget screen with spending and saving tabs`.

### Task 11: Category detail, plan editor and new-month review

**Files:** Create `src/phone/budget/{CategoryDetail,PlanEditor,CategoryEditor}.tsx`

- CategoryDetail per spec §"Category detail"; menu: Edit budget (MoneyInput sheet → `setBudgetLine`/`removeBudgetLine`), Edit category (CategoryEditor: name, emoji with live `suggestEmoji`, color from `GOAL_PALETTE`, Need/Want), Delete (confirm).
- PlanEditor (full-screen sheet), used for "Edit plan" and the new-month review: header "$X left to allocate" (red when negative), sections Income (paydays list with status; tap → confirm/edit), Fixed (recurring list, read-only, link), Debt payments, Savings (funds), Spending (Needs | Wants toggle, + Add category). Footer: draft → "Looks good — start {Month}" (`saveBudgetPlan(m, lines, true)`); confirmed → "Save". Review mode title "Start your {Month} budget".
- [ ] Implement; checks pass; commit `feat(phone): category detail and plan editor`.

### Task 12: Funds

**Files:** Create `src/phone/funds/{FundDetail,FundEditor,MoneySheet}.tsx`

- FundDetail per spec §"Funds"; Add money sheet with source toggle *From this month's budget* (→ `setBudgetLine(month,'fund',id, current+amt)`) / *From somewhere else* (→ `funds.addTransaction deposit`); Withdraw (→ withdrawal); activity list (swipe/long-press not needed: trailing delete button on deposits/withdrawals only); menu Edit / Mark complete (`goals.remove`) / Restore (`goals.restore`) / Delete (`goals.purge`, confirm). Confetti via existing `useCelebration` when balance first reaches target (reuse its once-per-goal localStorage guard).
- FundEditor: name, emoji (suggested), target, optional date, color.
- [ ] Implement; checks pass; commit `feat(phone): funds`.

### Task 13: Expenses tab, expense editor and quick add

**Files:** Create `src/phone/expenses/{ExpensesScreen,MonthCalendar,CategoryDonut,DaySheet,ExpenseEditor,QuickAddSheet,ExpenseRow}.tsx`

- ExpensesScreen per spec §"Expenses tab" (month picker, Calendar | Categories toggle, overflow with CSV export reusing `src/lib/csv.ts`), weekly-report card → `/expenses/week`.
- MonthCalendar modes Amount / Emoji / Upcoming (upcoming from `budget.month(m).recurring.items` where `!logged`).
- CategoryDonut: Recharts `PieChart` with `innerRadius`, `paddingAngle`, `cornerRadius`, emoji labels on segments ≥ 6%.
- ExpenseEditor sheet: description, amount, date, category (emoji grid), note, **Paid from** Budget / fund (select) / card (select of credit_card + line_of_credit debts).
- QuickAddSheet: textarea → `parseQuickAdd` live (history from `expenses.list()` most recent first, categories from `expenseCategories.list()`), preview cards with check toggles and edit (opens ExpenseEditor pre-filled), **Confirm (n)** creates via `expenses.create`, "Add manually" opens a blank ExpenseEditor; after save bumps the refresh key and toasts "Logged 2 expenses".
- [ ] Implement; checks pass; commit `feat(phone): expenses tab and quick add`.

### Task 14: Weekly report screen

**Files:** Create `src/phone/expenses/WeeklyReport.tsx`
- Per spec §"Weekly report": title, date range, "Hi {name}," card with headline sentence, stats row (Spent / vs last week / Daily avg), 4-week bar mini-chart (this week in brand color), Insights card (sparkle icon, "Insights"), Top categories list; week navigation arrows.
- [ ] Implement; checks pass; commit `feat(phone): weekly report`.

### Task 15: Recurring, More, Settings additions, pay history

**Files:** Create `src/phone/recurring/{RecurringScreen,RecurringEditor}.tsx`, `src/phone/more/{MoreScreen,PayHistory}.tsx`, `src/phone/settings/PhoneSettingsExtras.tsx`; Modify `src/pages/Settings.tsx`
- RecurringScreen per spec §"Recurring" (header "Recurring Expenses · 11 expenses", Active / Paused sections, + button); RecurringEditor (every N weeks/months/years, next date, category, card, pause/resume, delete).
- MoreScreen: rows Recurring, Payoff, Registered, Reports, Pay history, Settings, Set up budget again.
- PayHistory: paychecks list (date, amount, "payday check-in" vs "logged"), delete.
- Settings on phone (`useIsMobile()`): add **Pay** card (amount, frequency, next payday) and **Reminders** card (daily log + time, new month, weekly report) rendered by `PhoneSettingsExtras`; hide "Next paycheck" desktop card and home-layout picker on phone.
- [ ] Implement; checks pass; commit `feat(phone): recurring, more, pay settings and reminders UI`.

### Task 16: Onboarding, budget setup and export

**Files:** Create `src/phone/onboarding/{PhoneOnboarding,SetupFlow,steps/*.tsx,ExportStep.tsx,AllocateStep.tsx,DoneStep.tsx}`
- `PhoneOnboarding` = Intro (2 screens) → Name → `SetupFlow`. `/setup` route = `SetupFlow` alone for existing users.
- SetupFlow steps per spec §"Onboarding": Period, Pay (writes settings), Recurring (+ suggestion chips, + "Import from Bills" when bills exist → `recurringExpenses.importBills()`), Debts (shows `interestPerMonth`), Funds, Export (builds `buildBudgetMarkdown` input from api data; avg monthly per category from `reports.expenses` over the last 3 full months ÷ 3; **Share file** → `files.exportText('my-budget.md', md)`; **Copy** → clipboard with fallback), Allocate (lines; pre-fill spend lines from `budgets.list()` for existing users), Done (summary ring) → `budget.savePlan(currentMonth, lines, true)`; then `completeOnboarding()` (fresh install) and navigate `/`.
- Progress bar like DaTrack (segmented, step `n / total`), back arrow, full-width Continue.
- [ ] Implement; checks pass; commit `feat(phone): onboarding, budget setup and AI export`.

### Task 17: iOS reminders

**Files:** Modify `src/platform/ios/notify.ts`; Create `src/phone/reminders.ts`
- `scheduleReminders(settings: AppSettings): Promise<void>` (iOS only, no-op on Electron): cancels ids 9001–9003 then schedules repeating: 9001 daily at `notify_daily_time` ("Don't forget to log today's expenses"), 9002 monthly day 1 09:00 ("Time to plan {next month}" — generic text "Time to plan your new month's budget"), 9003 weekly Monday 09:00 ("Your weekly report is ready"); each only when its toggle and `notify_enabled` are on. Called after boot (from `installIosApi`) and after the Reminders settings change.
- [ ] Implement; checks pass; commit `feat(ios): repeating budget reminders`.

### Task 18: Visual verification harness and polish pass

**Files:** Create `scripts/phone-shots.mjs`
- Builds nothing itself: expects `dist-ios/` (from `vite build --config vite.config.ios.ts`) served by `node node_modules/vite/bin/vite.js preview --config vite.config.ios.ts --port 4173`. Launches `msedge --headless=new --remote-debugging-port=9333 --window-size=390,844`, drives it with Node's global `WebSocket` over CDP (`Page.navigate`, `Runtime.evaluate`, `Emulation.setDeviceMetricsOverride` 390×844 dpr 2, `Page.captureScreenshot`), seeds a realistic dataset through `window.api` (pay 1200 biweekly; Rent/Phone/Spotify recurring; Visa debt; 3 funds; ~25 expenses across categories; a confirmed plan), and writes PNGs per route × theme to the scratchpad.
- Review every screenshot; fix visual defects found (spacing, overflow, contrast in dark mode, truncation).
- [ ] Implement, run, fix, re-run; commit `chore: phone screenshot harness` and `fix(phone): visual polish`.

### Task 19: Docs and final verification

**Files:** Modify `CLAUDE.md`
- Update: data model v12–v13, phone app architecture (`src/phone/`), budget math, funds, payday check-in, quick add, export channel, reminders, theme default, screenshot harness.
- [ ] Run full suite, `tsc --noEmit`, both builds — all green; commit `docs: record the phone budget redesign`.
