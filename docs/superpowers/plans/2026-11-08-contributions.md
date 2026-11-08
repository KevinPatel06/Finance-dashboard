# Contributions, Saving Gauge & Two Phone Fixes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** RRSP/TFSA/FHSA "contributions" on the phone, with a Saving gauge and cards, a
year-based monthly split that counts only logged deposits, a setup step, the AI export, a
five-icon picker, and a Log expense sheet that opens at the top.

**Architecture:**
- **CRA rules:** pure functions in `shared/registered.ts`, unit-tested.
- **Repo:** `core/repo.ts` owns the account year (lazy close, deposits by date) and adds a fourth
  `budget_lines` kind, `'contribution'`. Draft months recompute those lines from the rules on
  every read. Confirmed months are frozen.
- **UI:** the phone UI lives under `src/phone/contributions/` and plugs into the existing Budget
  screen, plan editor and setup flow. Copy decisions sit in small pure helpers, so they can be
  unit-tested.

**Tech Stack:** React 18 + TS, Vite 6, Tailwind, Capacitor 6 (sql.js), Electron
(better-sqlite3), date-fns, lucide-react, Vitest (node:sqlite + sql.js drivers).

**Spec:** `docs/superpowers/specs/2026-11-08-contributions-design.md`. Mockups are in
`docs/superpowers/specs/2026-11-08-contributions-mockups/`. When the mockup files disagree, the
higher-numbered file wins.

## Global Constraints

- Phone only (`src/phone/`). The desktop `md`+ layout stays pixel-identical.
  `src/pages/Registered.tsx` must still compile and not crash; it needs no new behaviour.
- **Everything is optional.** With no registered accounts, `budgetMonth()` returns exactly what
  it does today, plus empty `lines.contribution` and `planned.contribution = 0`. The deposit
  banner never shows.
- SQL uses positional `?` binding only. `core/db.ts` is unchanged.
- IPC follows the 4-file pattern: `shared/ipc.ts` → `core/repo.ts` → `core/apiMap.ts` (correct
  `mutates`) → `electron/preload.ts` + `src/platform/mobile/api.ts`.
- **No emoji drawn on the phone.**
  - Stored emoji per kind: RRSP `'🏦'` (already → Landmark), TFSA `'🌱'` (**add `Sprout`** to
    `ICONS` in `src/phone/ui/icons.ts`), FHSA `'🏠'` (→ House).
  - Kind colours: `rrsp '#6366f1'`, `tfsa '#10b981'`, `fhsa '#f59e0b'`.
  - Short labels: `'RRSP'`, `'TFSA'`, `'FHSA'`.
- **Limits** (in `shared/registered.ts`):

  | Value | Amount |
  |---|---|
  | `TFSA_LIMITS` | `{2009:5000, 2010:5000, 2011:5000, 2012:5000, 2013:5500, 2014:5500, 2015:10000, 2016:5500, 2017:5500, 2018:5500, 2019:6000, 2020:6000, 2021:6000, 2022:6000, 2023:6500, 2024:7000, 2025:7000, 2026:7000}` |
  | `FHSA_ANNUAL` | `8000` |
  | `FHSA_CARRY_MAX` | `8000` |
  | `FHSA_LIFETIME` | `40000` |
  | `RRSP_BUFFER` | `2000` |
  | `RRSP_DOLLAR_LIMITS` | `{2026:33810, 2027:35390}` (hint text only) |
- **Every new line of copy fits on one line at 375pt.** Pill and banner amounts use `moneyWhole`.
  Sheets and rows use `money`.
- New migration = **v14** (`'contributions'`). New tables get `addSyncTracking`.
- **Commands** (call node directly; the `.bin` shims fail on this machine):

  | Purpose | Command |
  |---|---|
  | Tests | `node node_modules/vitest/vitest.mjs run` |
  | Types | `node node_modules/typescript/bin/tsc --noEmit` |
  | Mobile build | `node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts` |
  | Desktop build | `node node_modules/vite/bin/vite.js build` |
- Work on branch `feat/contributions`. Every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **No accounts at all:** Kevin's explicit ask. The budget, banners and gauge behave exactly as
   today, apart from the funds-only button copy. *(Task 4 test `no accounts leaves the budget
   unchanged`.)*
2. **A deposit backdated into a closed year, or dated in the future:** it is assigned to a year by
   its date. The current year's contributed and lines are unaffected by a backdated one. *(Task 3
   test `deposits are assigned to years by date`.)*
3. **A deposit deleted or edited after the month was confirmed:** the confirmed line doesn't move;
   only the projection for future months changes. *(Task 4 test `confirmed lines are frozen`.)*
4. **Budgeting on with no goal, goal 0, or the goal already met:** no line and no crash, and the
   card says the goal is met. *(Task 4 test `no line without a positive remaining goal`.)*
5. **Cent rounding across months:** each month rounds to the cent and the last month absorbs the
   rest, so the lines sum to the goal exactly. *(Task 1 test `last month absorbs rounding`.)*

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b feat/contributions`. Expected: `Switched to a new branch`.

---

### Task 1: CRA rules — `shared/registered.ts`

**Files:**
- Create: `shared/registered.ts`
- Test: `test/unit/registered.test.ts`

**Interfaces:**
- Consumes: `RegisteredKind`, `RegisteredScheduleRow`, `NewYearSuggestion` from
  `shared/types.ts`. Add these two types in this task; they are exactly as written in Task 2's
  Interfaces block.
- Produces (all pure; dates are ISO `YYYY-MM-DD`, months `YYYY-MM`):
  - `rrspDeadline(taxYear: number): string`: the 60th day of `taxYear+1`, moved to Monday if it
    falls on a Saturday or Sunday.
  - `yearBounds(kind: RegisteredKind, taxYear: number): { start: string; end: string }`:
    - TFSA/FHSA: `${y}-01-01`…`${y}-12-31`;
    - RRSP: `addDays(rrspDeadline(y-1), 1)`…`rrspDeadline(y)`.
  - `taxYearFor(kind: RegisteredKind, dateIso: string): number`
  - `defaultDeadline(kind: RegisteredKind, taxYear: number): string` = `yearBounds(...).end`
  - `monthsLeft(fromMonth: string, deadline: string): number`: the count of months `m ≥
    fromMonth` with `${m}-01 < deadline`.
  - `monthlyLine(goal: number, contributedBefore: number, fromMonth: string, deadline: string):
    number`: `max(0, goal − before) / monthsLeft`, rounded to the cent. `0` when `monthsLeft` is
    0 or nothing remains.
  - `tfsaLimit(year: number): { amount: number; known: boolean }`: an unknown year returns the
    latest known amount with `known: false`.
  - `suggestNewYear(last: { kind: RegisteredKind; room: number; contributed: number; goal:
    number | null; budgeted: boolean; lifetimeContributed: number; lifetimeMaxReached: boolean },
    lastTaxYear: number, newTaxYear: number): NewYearSuggestion`
  - `scheduleRows(input: { yearStart: string; yearEnd: string; goalDeadline: string; goal: number
    | null; budgeted: boolean; deposits: { date: string; amount: number }[]; lines:
    Record<string, number>; currentMonth: string; currentPlanned: number }):
    RegisteredScheduleRow[]`
  - Plus the limit constants from Global Constraints and
    `KIND_LABEL: Record<RegisteredKind, string>`.

- [ ] **Step 1: Write the failing tests** in `test/unit/registered.test.ts`

```ts
describe('rrspDeadline / yearBounds / taxYearFor', () => {
  it('is the 60th day, moved off weekends', () => {
    expect(rrspDeadline(2025)).toBe('2026-03-02'); // Mar 1 2026 is a Sunday
    expect(rrspDeadline(2026)).toBe('2027-03-01'); // Monday
    expect(rrspDeadline(2027)).toBe('2028-02-29'); // leap year, Tuesday
  });
  it('bounds the CRA year by kind', () => {
    expect(yearBounds('tfsa', 2026)).toEqual({ start: '2026-01-01', end: '2026-12-31' });
    expect(yearBounds('rrsp', 2026)).toEqual({ start: '2026-03-03', end: '2027-03-01' });
  });
  it('maps a date to its tax year', () => {
    expect(taxYearFor('rrsp', '2027-03-01')).toBe(2026);
    expect(taxYearFor('rrsp', '2027-03-02')).toBe(2027);
    expect(taxYearFor('rrsp', '2026-03-02')).toBe(2025);
    expect(taxYearFor('fhsa', '2026-11-08')).toBe(2026);
  });
});
describe('monthsLeft / monthlyLine', () => {
  it('counts months whose 1st is before the deadline', () => {
    expect(monthsLeft('2026-11', '2027-03-01')).toBe(4);
    expect(monthsLeft('2026-11', '2026-12-31')).toBe(2);
    expect(monthsLeft('2026-11', '2027-03-15')).toBe(5);
    expect(monthsLeft('2027-03', '2027-03-01')).toBe(0);
  });
  it('splits what is left', () => {
    expect(monthlyLine(6000, 3600, '2026-11', '2027-03-01')).toBe(600);
    expect(monthlyLine(7000, 5800, '2026-11', '2026-12-31')).toBe(600);
    expect(monthlyLine(6000, 6500, '2026-11', '2027-03-01')).toBe(0);
    expect(monthlyLine(6000, 0, '2027-03', '2027-03-01')).toBe(0);
  });
  it('last month absorbs rounding', () => {
    expect(monthlyLine(1000, 0, '2026-10', '2026-12-31')).toBe(333.33);
    expect(monthlyLine(1000, 333.33, '2026-11', '2026-12-31')).toBe(333.34);
    expect(monthlyLine(1000, 666.67, '2026-12', '2026-12-31')).toBe(333.33);
  });
});
describe('suggestNewYear', () => {
  const base = { goal: 7000, budgeted: true, lifetimeContributed: 0, lifetimeMaxReached: false };
  it('TFSA: unused room plus each new year limit', () => {
    expect(suggestNewYear({ ...base, kind: 'tfsa', room: 19500, contributed: 7000 }, 2026, 2027).room).toBe(19500);
    expect(suggestNewYear({ ...base, kind: 'tfsa', room: 10000, contributed: 0 }, 2025, 2027).room).toBe(24000);
  });
  it('FHSA: carry at most 8000, cap at the lifetime limit, checkbox wins', () => {
    const f = { ...base, kind: 'fhsa' as const, goal: 8000 };
    expect(suggestNewYear({ ...f, room: 8000, contributed: 6000 }, 2026, 2027).room).toBe(10000);
    expect(suggestNewYear({ ...f, room: 16000, contributed: 0 }, 2026, 2027).room).toBe(16000);
    expect(suggestNewYear({ ...f, room: 8000, contributed: 0, lifetimeContributed: 36000 }, 2026, 2027).room).toBe(4000);
    expect(suggestNewYear({ ...f, room: 8000, contributed: 0, lifetimeMaxReached: true }, 2026, 2027).room).toBe(0);
  });
  it('RRSP: room is left to the user; goal, deadline and switch carry over', () => {
    const s = suggestNewYear({ ...base, kind: 'rrsp', room: 14200, contributed: 6000, goal: 6000 }, 2026, 2027);
    expect(s).toEqual({ tax_year: 2027, room: null, goal: 6000, goal_deadline: '2028-02-29', budgeted: true });
  });
  it('caps the carried goal at the suggested room', () => {
    expect(suggestNewYear({ ...base, kind: 'fhsa', room: 8000, contributed: 0, goal: 8000, lifetimeContributed: 36000 }, 2026, 2027).goal).toBe(4000);
  });
});
describe('scheduleRows', () => {
  it('reproduces the mockup RRSP year', () => {
    const rows = scheduleRows({
      yearStart: '2026-03-03', yearEnd: '2027-03-01', goalDeadline: '2027-03-01', goal: 6000, budgeted: true,
      deposits: [
        { date: '2026-03-20', amount: 1500 }, { date: '2026-08-01', amount: 500 },
        { date: '2026-09-01', amount: 1000 }, { date: '2026-10-01', amount: 600 }, { date: '2026-11-03', amount: 350 },
      ],
      lines: { '2026-08': 642.86, '2026-09': 666.67, '2026-10': 600 },
      currentMonth: '2026-11', currentPlanned: 600,
    });
    expect(rows.map((r) => [r.month, r.state, r.planned, r.deposited])).toEqual([
      ['2026-03', 'past', null, 1500], ['2026-08', 'past', 642.86, 500], ['2026-09', 'past', 666.67, 1000],
      ['2026-10', 'past', 600, 600], ['2026-11', 'current', 600, 350],
      ['2026-12', 'future', 600, 0], ['2027-01', 'future', 600, 0], ['2027-02', 'future', 600, 0],
    ]);
  });
  it('drops future months after an early deadline', () => {
    const rows = scheduleRows({
      yearStart: '2026-01-01', yearEnd: '2026-12-31', goalDeadline: '2026-06-30', goal: 6000, budgeted: true,
      deposits: [], lines: {}, currentMonth: '2026-05', currentPlanned: 3000,
    });
    expect(rows.map((r) => r.month)).toEqual(['2026-05', '2026-06']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
  Run `node node_modules/vitest/vitest.mjs run test/unit/registered.test.ts`. Expected: FAIL,
  cannot resolve `../../shared/registered`.

- [ ] **Step 3: Implement `shared/registered.ts`** with the Interfaces above, using only
  `date-fns` and `./types`.
  - **`scheduleRows`:**
    - **Range:** the months from `yearStart` to `yearEnd`. Drop past months that have no line
      and no deposits. Drop future months with `${m}-01 >= goalDeadline`.
    - **Past rows:** `planned = lines[m] ?? null`.
    - **Current row:** `planned = currentPlanned`.
    - **Future rows:** `remaining = goal − deposits before the current month − max(currentPlanned,
      current deposits)`, spread over the future months with the same per-month
      rounding as `monthlyLine`. When `!budgeted`, `planned` is `null` on future rows.
  - **`suggestNewYear`:**
    - **TFSA room** = `max(0, room − contributed)` plus `tfsaLimit(y).amount` for each `y` in
      `lastTaxYear+1..newTaxYear`.
    - **FHSA room** = `min(FHSA_CARRY_MAX, max(0, room − contributed) + FHSA_ANNUAL ×
      (newTaxYear − lastTaxYear − 1)) + FHSA_ANNUAL`, then capped at `FHSA_LIFETIME −
      lifetimeContributed`. It is `0` when `lifetimeMaxReached`.
    - **RRSP room** = `null`.
    - **Goal** = `last.goal` capped at the suggested room (only when the room isn't `null`).

- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit**
  `git add shared/registered.ts shared/types.ts test/unit/registered.test.ts`, then
  `git commit -m "feat(registered): CRA year, deadline and monthly-split rules"`.

---

### Task 2: Types + migration v14

**Files:**
- Modify: `shared/types.ts` (Registered types ~313-350, budget types ~373-487, `AppSettings`)
- Modify: `core/migrations.ts` (new v14 at the top of `migrations`, `SYNC_TRACKED_TABLES` comment
  only)
- Modify: `core/repo.ts` (`getSettings`: one line)
- Test: `test/migrationV14.test.ts`

**Interfaces:**
- Produces, in `shared/types.ts`:

```ts
export type BudgetLineKind = 'spend' | 'fund' | 'debt' | 'contribution';
export interface RegisteredYear {
  id: number; account_id: number; tax_year: number; room: number | null;
  goal: number | null; goal_deadline: string | null; contributed: number; closed_at: string;
}
export interface RegisteredScheduleRow { month: string; planned: number | null; deposited: number; state: 'past' | 'current' | 'future' }
export interface NewYearSuggestion { tax_year: number; room: number | null; goal: number | null; goal_deadline: string; budgeted: boolean }
export interface RegisteredAccount {
  id: number; kind: RegisteredKind; label: string; contribution_room: number; notes: string | null;
  archived: number; created_at: string;
  tax_year: number; goal: number | null; goal_deadline: string; budgeted: number; waiting: number; fhsa_lifetime_max: number;
  // Computed
  year_start: string; year_end: string;           // the open year, or (waiting) the year containing today
  contributed: number; remaining: number;          // that year only
  lifetime_contributed: number;
  contributions: RegisteredContribution[];         // all years, newest first (desktop reads this)
  monthly_plan: number | null;                     // formula for the current month; null if not budgeted / waiting / nothing left
  months_left: number;
  this_month: { planned: number; deposited: number } | null; // null when not budgeted or waiting
  schedule: RegisteredScheduleRow[];
  past_years: RegisteredYear[];                    // newest first
  suggestion: NewYearSuggestion | null;            // only while waiting
  new_year_snoozed: boolean;
  summary_pending: RegisteredYear | null;          // latest closed year not yet acknowledged
}
export interface RegisteredAccountInput {
  kind: RegisteredKind; label: string; contribution_room: number; notes?: string | null;
  goal?: number | null; goal_deadline?: string; budgeted?: boolean; fhsa_lifetime_max?: boolean;
  already_contributed?: number; // create only → one deposit dated year_start, note 'Already in when you set it up'
}
export interface StartYearInput { contribution_room: number; goal: number | null; goal_deadline: string; budgeted: boolean; fhsa_lifetime_max?: boolean }
export interface ContributionLineView { account_id: number; kind: RegisteredKind; label: string; amount: number; deposited: number; left: number }
// BudgetMonthView gains:
//   lines.contribution: ContributionLineView[]
//   planned.contribution: number
//   saving: { planned: number; putAway: number; leftToDeposit: number; due: string[] }
// AppSettings gains: contributions_hidden: boolean
```

- Schema after v14:
  - `registered_accounts` + `tax_year INTEGER`, `goal REAL`, `goal_deadline TEXT`,
    `budgeted INTEGER NOT NULL DEFAULT 0`, `waiting INTEGER NOT NULL DEFAULT 0`,
    `fhsa_lifetime_max INTEGER NOT NULL DEFAULT 0`;
  - new `registered_years(id, account_id → registered_accounts ON DELETE CASCADE, tax_year INTEGER
    NOT NULL, room REAL, goal REAL, goal_deadline TEXT, contributed REAL NOT NULL, closed_at TEXT
    NOT NULL DEFAULT CURRENT_TIMESTAMP)` with sync tracking;
  - `budget_lines.kind` CHECK includes `'contribution'`.

- [ ] **Step 1: Write the failing test** `test/migrationV14.test.ts`. Follow the shape of
  `migrationV13.test.ts`: `runMigrations(db, 13)`, seed with raw SQL, `runMigrations(db)`,
  `setDb`. The seed is:
  - two `budget_months` (`'2026-10'` confirmed, `'2026-11'`) with three `budget_lines` (spend,
    fund, debt);
  - one `registered_accounts` row (`kind 'tfsa', label 'TFSA', contribution_room 7000`) with one
    contribution of 500 **dated today**. The migration test runs on the real clock, so the
    deposit must fall inside the current TFSA year.

  It records the `budget_lines` uuids and the `_deletions` count before the upgrade. Tests:

```ts
it('records itself as applied', () => expect(name(14)).toBe('contributions'));
it('keeps every budget line with its uuid', () => expect(uuidsAfter).toEqual(uuidsBefore));
it('accepts the contribution kind', () =>
  expect(() => db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-11','contribution',1,600)").run()).not.toThrow());
it('restores the sync triggers and writes no tombstones', () => {
  for (const t of ['budget_lines_sync_ins', 'budget_lines_sync_upd', 'budget_lines_sync_del']) expect(trigger(t)).toBeTruthy();
  expect(count('_deletions')).toBe(deletionsBefore);
});
it('backfills existing accounts to an open year with budgeting off', () => {
  const a = db.prepare('SELECT tax_year, goal, goal_deadline, budgeted, waiting FROM registered_accounts').get();
  expect(a).toEqual({ tax_year: taxYearFor('tfsa', today), goal: null, goal_deadline: defaultDeadline('tfsa', taxYearFor('tfsa', today)), budgeted: 0, waiting: 0 });
});
it('creates registered_years with sync tracking', () => expect(cols('registered_years')).toEqual(expect.arrayContaining(['uuid', 'updated_at'])));
it('the desktop list still works', () => expect(repo.listRegisteredAccounts()[0].contributed).toBe(/* the seeded amount */ 500));
```

- [ ] **Step 2: Run the test to verify it fails.**
  `node node_modules/vitest/vitest.mjs run test/migrationV14.test.ts`. Expected: FAIL, there is
  no version 14.

- [ ] **Step 3: Implement v14** (`name: 'contributions'`). The `budget_lines` rebuild must follow
  this order:

```sql
DROP TRIGGER IF EXISTS budget_lines_sync_ins; DROP TRIGGER IF EXISTS budget_lines_sync_upd; DROP TRIGGER IF EXISTS budget_lines_sync_del;
CREATE TABLE budget_lines_v14 (id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL REFERENCES budget_months(month) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('spend','fund','debt','contribution')),
  ref_id INTEGER NOT NULL, amount REAL NOT NULL CHECK (amount >= 0),
  uuid TEXT, updated_at INTEGER, UNIQUE (month, kind, ref_id));
INSERT INTO budget_lines_v14 (id, month, kind, ref_id, amount, uuid, updated_at)
  SELECT id, month, kind, ref_id, amount, uuid, updated_at FROM budget_lines;
DROP TABLE budget_lines;
ALTER TABLE budget_lines_v14 RENAME TO budget_lines;
CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(month);
```

  Then call `addSyncTracking(db, 'budget_lines')` and `addSyncTracking(db, 'registered_years')`.
  Add the six `registered_accounts` columns with `ALTER TABLE`, then backfill each row with
  `tax_year = taxYearFor(kind, today)` and `goal_deadline = defaultDeadline(kind, tax_year)`
  (import from `../shared/registered`).
  - In `getSettings`, add `contributions_hidden: map.contributions_hidden === 'true'`.
  - Update `listRegisteredAccounts` only enough for the type to compile. Task 3 rewrites it.

- [ ] **Step 4: Run all tests.** `node node_modules/vitest/vitest.mjs run`. Expected: all PASS,
  including v11, v12, v13 and both repo contracts.

- [ ] **Step 5: Type-check.** `node node_modules/typescript/bin/tsc --noEmit`. Expected: no
  errors. Stub any new required view fields you introduced as empty/zero so the build compiles;
  Tasks 3 and 4 fill them in.

- [ ] **Step 6: Commit**
  `git add shared/types.ts core/migrations.ts core/repo.ts test/migrationV14.test.ts`, then
  `git commit -m "feat(db): v14 contributions schema and contribution budget lines"`.

---

### Task 3: Repo: accounts, deposits and years (+ IPC)

**Files:**
- Modify: `core/repo.ts` (the "Registered accounts" section, ~1470-1550)
- Modify: `shared/ipc.ts`, `core/apiMap.ts`, `electron/preload.ts`, `src/platform/mobile/api.ts`
- Modify: `test/shared/repoContract.ts` (new `describe('contributions — accounts')`)
- Modify: `test/repo.sqljs.test.ts` (`POOL_SIZE` 100 → 150)

**Interfaces:**
- Consumes: everything from Task 1; the types from Task 2.
- Produces:
  - `listRegisteredAccounts(): RegisteredAccount[]`. This now **writes** (it closes years
    lazily), so the apiMap entry becomes `w`.
  - `createRegisteredAccount(input: RegisteredAccountInput): RegisteredAccount`:
    - `tax_year = taxYearFor(kind, today)`;
    - defaults: `goal_deadline = defaultDeadline`, `goal = null`, `budgeted = 0`;
    - an `already_contributed > 0` becomes a deposit dated `year_start`.
  - `updateRegisteredAccount(id, input: Partial<RegisteredAccountInput>): RegisteredAccount`.
    It clamps `goal_deadline` to `≤ year_end`.
  - `deleteRegisteredAccount(id): { ok: true }`. It **archives** (`archived = 1`) and deletes
    `'contribution'` lines for this `ref_id` in months `>= current month` that are not confirmed.
  - `addRegisteredContribution(input)` / `deleteRegisteredContribution(id)`: as today.
  - `startRegisteredYear(id: number, input: StartYearInput): RegisteredAccount`:
    - `tax_year = taxYearFor(kind, today)` and `waiting = 0`;
    - inserts `registered_years` rows for skipped tax years (`room/goal/goal_deadline` NULL,
      `contributed` = deposits inside that year);
    - acknowledges `summary_pending`.
  - `snoozeRegisteredNewYear(id: number): { ok: true }`: meta `reg_newyear_snooze:<id>` = today.
  - `ackRegisteredSummary(id: number): { ok: true }`: meta `reg_summary_ack:<id>:<tax_year>` =
    `'1'`.
  - Private `closeRegisteredYears(db, todayIso)`: for each non-archived, non-waiting account with
    `today > yearBounds(kind, tax_year).end`, it inserts a `registered_years` row (room, goal,
    goal_deadline, contributed in that year) and sets `waiting = 1`.
  - **IPC:**

    | Channel | Repo function | Mode |
    |---|---|---|
    | `REGISTERED_START_YEAR: 'registered:startYear'` | `startRegisteredYear` | `w` |
    | `REGISTERED_SNOOZE_NEW_YEAR: 'registered:snoozeNewYear'` | `snoozeRegisteredNewYear` | `w` |
    | `REGISTERED_ACK_SUMMARY: 'registered:ackSummary'` | `ackRegisteredSummary` | `w` |

    Namespace methods: `registered.startYear(id, input)`, `registered.snoozeNewYear(id)`,
    `registered.ackSummary(id)`.
  - **Computed fields** per the Task 2 type:
    - `this_month.planned` = the stored `'contribution'` line for the current month if that month
      is confirmed, else `monthlyLine(...)` for the current month;
    - `schedule` comes from `scheduleRows`, with `lines` = this account's stored lines by month;
    - `suggestion` comes from `suggestNewYear`, using the latest `registered_years` row.

- [ ] **Step 1: Write the failing contract tests.** Add a `describe('contributions — accounts')`
  block with `vi.useFakeTimers({ toFake: ['Date'] })` and `vi.setSystemTime(new Date(2026, 10, 8,
  12))` in `beforeEach`, and `vi.useRealTimers()` in `afterEach`. Add `vi` and `afterEach` to the
  vitest import.

```ts
it('creates an account in the current CRA year with an opening deposit', () => {
  const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true, already_contributed: 3600 });
  expect([a.tax_year, a.year_start, a.year_end, a.goal_deadline]).toEqual([2026, '2026-03-03', '2027-03-01', '2027-03-01']);
  expect([a.contributed, a.remaining, a.monthly_plan, a.months_left]).toEqual([3600, 10600, 600, 4]);
  expect(a.contributions[0]).toMatchObject({ date: '2026-03-03', amount: 3600 });
});
it('clamps a deadline past the CRA year end', () => {
  const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
  expect(repo.updateRegisteredAccount(a.id, { goal_deadline: '2027-06-30' }).goal_deadline).toBe('2026-12-31');
});
it('deposits are assigned to years by date', () => {
  const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
  repo.addRegisteredContribution({ account_id: a.id, amount: 500, date: '2025-12-31' });
  repo.addRegisteredContribution({ account_id: a.id, amount: 200, date: '2027-01-02' });
  const v = repo.listRegisteredAccounts()[0];
  expect([v.contributed, v.lifetime_contributed]).toEqual([0, 700]);
});
it('closes the year at the CRA end, not the goal deadline', () => {
  const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 7000, goal_deadline: '2026-06-30', budgeted: true });
  vi.setSystemTime(new Date(2026, 11, 31, 12));
  expect(repo.listRegisteredAccounts()[0].waiting).toBe(0);
  vi.setSystemTime(new Date(2027, 0, 1, 12));
  const v = repo.listRegisteredAccounts()[0];
  expect([v.waiting, v.past_years[0].tax_year, v.suggestion?.room, v.suggestion?.goal_deadline]).toEqual([1, 2026, 14000, '2027-12-31']);
});
it('RRSP waits for the user; deposits while waiting count toward the new year', () => {
  const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true });
  vi.setSystemTime(new Date(2027, 2, 10, 12));
  repo.addRegisteredContribution({ account_id: a.id, amount: 500, date: '2027-03-05' });
  let v = repo.listRegisteredAccounts()[0];
  expect([v.waiting, v.suggestion?.room, v.contributed, v.summary_pending?.tax_year]).toEqual([1, null, 500, 2026]);
  v = repo.startRegisteredYear(a.id, { contribution_room: 15000, goal: 6000, goal_deadline: '2028-02-29', budgeted: true });
  expect([v.tax_year, v.waiting, v.contributed, v.summary_pending]).toEqual([2027, 0, 500, null]);
});
it('a skipped year gets a past-years row and starts in the year containing today', () => {
  const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
  vi.setSystemTime(new Date(2028, 4, 1, 12));
  repo.listRegisteredAccounts();
  const v = repo.startRegisteredYear(a.id, { contribution_room: 21000, goal: null, goal_deadline: '2028-12-31', budgeted: false });
  expect([v.tax_year, v.past_years.map((y) => y.tax_year)]).toEqual([2028, [2027, 2026]]);
});
it('snooze and acknowledge are per account', () => {
  const a = repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000 });
  vi.setSystemTime(new Date(2027, 0, 2, 12));
  repo.snoozeRegisteredNewYear(a.id);
  expect(repo.listRegisteredAccounts()[0].new_year_snoozed).toBe(true);
});
it('delete archives and hides the account', () => {
  const a = repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000 });
  repo.deleteRegisteredAccount(a.id);
  expect(repo.listRegisteredAccounts()).toHaveLength(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail.**
  `node node_modules/vitest/vitest.mjs run test/repo.nodeSqlite.test.ts test/repo.sqljs.test.ts`.
  Expected: the new tests FAIL.

- [ ] **Step 3: Implement the repo functions, IPC channels, apiMap entries and both namespaces.**
  `LIST_REGISTERED` becomes `w(...)`.

- [ ] **Step 4: Run the full suite.** `node node_modules/vitest/vitest.mjs run`. Expected: PASS,
  including `test/apiMap.test.ts`.

- [ ] **Step 5: Type-check and build the desktop.** Run
  `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build`.
  Expected: no errors. `Registered.tsx` still compiles.

- [ ] **Step 6: Commit**
  `git commit -am "feat(registered): CRA years, deposits by date, new-year start and archive"`.

---

### Task 4: Repo: budget integration

**Files:**
- Modify: `core/repo.ts` (`budgetMonth` ~1849, plus a new private `syncContributionLines`)
- Modify: `test/shared/repoContract.ts` (new `describe('contributions — budget')`, same fake
  clock as Task 3)

**Interfaces:**
- Consumes: Task 3's account model; `monthlyLine` and `yearBounds`.
- Produces: the `BudgetMonthView` additions from Task 2.
  - `lines.contribution` is ordered RRSP, TFSA, FHSA.
  - `ContributionLineView.deposited` = this account's deposits dated within the month.
  - `left = max(0, amount − deposited)`.
  - `planned.contribution` is the sum of the lines.
  - `leftToAllocate` subtracts `planned.contribution`.
  - **`saving`:**
    - `planned` = `planned.fund + planned.contribution`;
    - `putAway` = `(status === 'confirmed' ? planned.fund : 0)` + all non-archived accounts'
      deposits dated in the month;
    - `leftToDeposit` = Σ `left`;
    - `due` = the labels of the lines with `left > 0`.
- **Behaviour:**
  - `budgetMonth` calls `closeRegisteredYears` first.
  - **Draft month:** `syncContributionLines(db, m)` upserts `monthlyLine(goal, depositsBefore(m),
    m, goal_deadline)` for every eligible account (non-archived, not waiting, `budgeted = 1`,
    `goal > 0`) and deletes the others, including ones that would be 0.
  - **`'none'` month:** the same amounts are returned in `lines.contribution`, but not stored.
  - **Confirmed month:** the stored lines are read as they are. An archived account's line still
    renders, so look it up without the archived filter.
  - `ensureBudgetMonth`'s copy already lists kinds explicitly, so contribution lines are never
    copied. Keep it that way.
  - **No "set by hand" flag is needed** (spec §4.2/§7.2), because a draft month's lines can only
    be edited in two places:
    - **Review & confirm,** which calls `savePlan(..., true)`, so the user's amounts are stored
      and frozen at once;
    - **the account screen's planned row,** which Task 9 makes editable only in a confirmed
      month.

    So "draft lines always follow the formula" and "a hand-set amount is left alone" never
    conflict.

- [ ] **Step 1: Write the failing contract tests**

```ts
it('no accounts leaves the budget unchanged', () => {
  seedConfirmedMonth('2026-11'); // existing helper pattern: income, a fund line, a spend line
  const v = repo.budgetMonth('2026-11');
  expect([v.lines.contribution, v.planned.contribution, v.saving.leftToDeposit, v.saving.due]).toEqual([[], 0, 0, []]);
  expect(v.saving.planned).toBe(v.planned.fund);
});
it('a draft month gets the monthly split and it comes off the top', () => {
  const a = repo.createRegisteredAccount({ kind: 'rrsp', label: 'RRSP', contribution_room: 14200, goal: 6000, budgeted: true, already_contributed: 3600 });
  draftMonth('2026-11'); // previous month exists → '2026-11' is a draft
  const v = repo.budgetMonth('2026-11');
  expect(v.lines.contribution).toEqual([{ account_id: a.id, kind: 'rrsp', label: 'RRSP', amount: 600, deposited: 0, left: 600 }]);
  expect(v.leftToAllocate).toBe(round2(v.income - v.recurring.total - v.planned.debt - v.planned.fund - 600 - v.planned.spend));
});
it('only logged deposits count toward put away and left to deposit', () => {
  /* confirm Nov with the 600 line; deposit 350 on 2026-11-03 */
  expect(v.saving).toMatchObject({ putAway: v.planned.fund + 350, leftToDeposit: 250, due: ['RRSP'] });
});
it('confirmed lines are frozen', () => {
  /* confirm Nov (600), add then delete a 1000 deposit dated 2026-11-05 */
  expect(repo.budgetMonth('2026-11').lines.contribution[0].amount).toBe(600);
  expect(repo.listRegisteredAccounts()[0].schedule.find((r) => r.month === '2026-12')?.planned).toBe(600);
});
it('an extra deposit lowers next month, a short month raises it', () => {
  /* confirm Nov at 600, deposit 1000 → Dec draft = (6000-3600-1000)/3 = 466.67 */
  vi.setSystemTime(new Date(2026, 11, 1, 12));
  expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(466.67);
});
it('no line without a positive remaining goal', () => {
  repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, budgeted: true }); // no goal
  repo.createRegisteredAccount({ kind: 'fhsa', label: 'FHSA', contribution_room: 8000, goal: 0, budgeted: true });
  draftMonth('2026-11');
  expect(repo.budgetMonth('2026-11').lines.contribution).toEqual([]);
});
it('budgeting switched on after confirming starts next month', () => {
  /* confirm Nov first, then create a budgeted TFSA goal 7000 */
  expect(repo.budgetMonth('2026-11').lines.contribution).toEqual([]);
  vi.setSystemTime(new Date(2026, 11, 1, 12));
  expect(repo.budgetMonth('2026-12').lines.contribution[0].amount).toBe(7000);
});
it('archiving keeps confirmed months and drops unconfirmed ones', () => {
  /* confirm Nov with a line, view Dec as a draft (line stored), archive the account */
  expect(repo.budgetMonth('2026-11').lines.contribution).toHaveLength(1);
  expect(repo.budgetMonth('2026-12').lines.contribution).toHaveLength(0);
});
it('setup ("none") months return suggestions without storing them', () => {
  repo.createRegisteredAccount({ kind: 'tfsa', label: 'TFSA', contribution_room: 7000, goal: 1200, budgeted: true });
  const v = repo.budgetMonth('2026-11');
  expect([v.status, v.lines.contribution[0].amount]).toEqual(['none', 600]);
  expect((getDb().prepare("SELECT COUNT(*) AS n FROM budget_lines WHERE kind = 'contribution'").get() as { n: number }).n).toBe(0);
});
```

  Use the existing contract helpers for seeding months if they exist. Otherwise add two small
  local helpers at the top of the block: `draftMonth(m)` saves an empty plan for the previous
  month, then reads `m`; `seedConfirmedMonth(m)` calls `saveBudgetPlan(m, [...], true)`.

- [ ] **Step 2: Run the tests to verify they fail.** Same command as Task 3. Expected: the new
  tests FAIL.

- [ ] **Step 3: Implement it in `budgetMonth`, plus a private
  `syncContributionLines(db: Db, month: string): void`.**

- [ ] **Step 4: Run the full suite.** `node node_modules/vitest/vitest.mjs run`. Expected: PASS.

- [ ] **Step 5: Commit**
  `git commit -am "feat(budget): contribution lines off the top, saving summary"`.

---

### Task 5: Icon picker: five suggestions and See all

**Files:**
- Create: `src/phone/ui/iconChoices.ts` (pure)
- Modify: `src/phone/ui/EmojiField.tsx`, `src/phone/budget/CategoryEditor.tsx:109`,
  `src/phone/funds/FundEditor.tsx:113`, `src/phone/recurring/RecurringEditor.tsx:195`
- Test: `test/unit/iconChoices.test.ts`

**Interfaces:**
- Produces:
  - `type IconContext = 'category' | 'fund' | 'recurring'`;
  - `topIcons(value: string, name: string, context: IconContext): string[]`: five entries,
    de-duplicated ignoring U+FE0F, in the order value, then `suggestEmoji(name, '')`, then
    `CONTEXT_DEFAULTS[context]`;
  - `CONTEXT_DEFAULTS = { category: ['🛒','🍔','🏠','🚗','🛍️'], fund: ['🆘','✈️','🏠','🚗','🎁'],
    recurring: ['📱','🌐','💡','📺','🛡️'] }`.
- `EmojiField` props become `{ value; onChange; name: string; context: IconContext }`.

- [ ] **Step 1: Write the failing test**

```ts
expect(topIcons('', 'Groceries', 'category')).toEqual(['🛒', '🍔', '🏠', '🚗', '🛍️']);
expect(topIcons('🎮', 'Games', 'category')).toEqual(['🎮', '🎬', '🛒', '🍔', '🏠']);
expect(topIcons('', 'Emergency fund', 'fund')).toEqual(['🆘', '✈️', '🏠', '🚗', '🎁']);
expect(topIcons('', '', 'recurring')).toEqual(['📱', '🌐', '💡', '📺', '🛡️']);
expect(topIcons('🛡', 'Insurance', 'recurring')).toEqual(['🛡', '📱', '🌐', '💡', '📺']); // no FE0F duplicate
```

- [ ] **Step 2: Run it to verify it fails.**
  `node node_modules/vitest/vitest.mjs run test/unit/iconChoices.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `topIcons`, then the `EmojiField` UI.**
  - Collapsed: a `grid-cols-6` row with the five `topIcons` cells plus a dashed "See all" cell
    (`LayoutGrid` icon, label "See all").
  - Expanded: today's full `PICKABLE` grid, then a centred `text-brand` "Show less" button.
  - The expanded state is local `useState`.
  - Pass `name` and `context` from the three editors.

- [ ] **Step 4: Run tests and type-check.**
  `node node_modules/vitest/vitest.mjs run test/unit/iconChoices.test.ts && node node_modules/typescript/bin/tsc --noEmit`.
  Expected: PASS, no errors.

- [ ] **Step 5: Commit**
  `git commit -am "feat(phone): icon picker shows five suggestions and See all"`.

---

### Task 6: Log expense opens at the top

**Files:**
- Modify: `src/phone/expenses/ExpenseEditor.tsx:105-118`
- Modify: `src/phone/ui/Sheet.tsx` (only if needed: reset the panel's scroll to the top on open)

- [ ] **Step 1: Change `ExpenseEditor`.**
  - Pass `autoFocus={false}` to `Sheet` and remove `autoFocus` from `MoneyInput`.
  - Under the amount, add `<p className="text-xs text-content-subtle text-center">Tap to enter the
    amount</p>` while `amount === ''`.
  - Leave `QuickAddSheet`'s textarea autofocus unchanged.

- [ ] **Step 2: Verify the scroll position.**
  - Build the mobile app and serve it:
    `node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts` and
    `node node_modules/vite/bin/vite.js preview --config vite.config.mobile.ts --port 4173`.
  - In a 390px-wide window, open + → "Add manually instead". Expected: the sheet title and the
    "$0.00" amount are visible, nothing is focused and no keyboard is up.
  - If the panel opens scrolled down, set `panelRef.current.scrollTop = 0` in `Sheet` when it
    opens, and check again.

- [ ] **Step 3: Commit**
  `git commit -am "fix(phone): Log expense opens at the top with the keyboard down"`.

---

### Task 7: Phone contribution building blocks

**Files:**
- Create: `src/phone/contributions/meta.ts`, `AccountCard.tsx`, `DepositSheet.tsx`,
  `AccountEditor.tsx`
- Create: `src/phone/budget/savingCopy.ts` (pure)
- Modify: `src/phone/ui/icons.ts` (`'🌱': Sprout`)
- Test: `test/unit/savingCopy.test.ts`

**Interfaces:**
- Consumes: `RegisteredAccount`, `StartYearInput`, `BudgetMonthView`; `monthlyLine`,
  `monthsLeft`, `defaultDeadline`, `KIND_LABEL` and `RRSP_BUFFER` from `@shared/registered`;
  `window.api.registered.*`.
- Produces:
  - `KIND_META: Record<RegisteredKind, { label: string; color: string; emoji: string }>` (values
    from Global Constraints).
  - `savingButton(v: Pick<BudgetMonthView, 'status' | 'month' | 'planned' | 'saving' | 'lines'>):
    { line1: string; line2: string; done: boolean }`.
  - `joinNames(names: string[]): string`.
  - `depositBanner(v): { title: string; body: string } | null`: `null` unless
    `status === 'confirmed' && saving.leftToDeposit > 0`.
  - `<AccountCard account onOpen onDeposit />`: layout C.
  - `<DepositSheet account onClose onSaved />`.
  - `<AccountEditor mode: 'add' | 'edit' | 'newYear'; account?; kinds?: RegisteredKind[];
    onClose; onSaved(a: RegisteredAccount); onDeleted? />`.

- [ ] **Step 1: Write the failing copy tests.** These lock in Kevin's option 2 wording.

```ts
const v = (o) => ({ status: 'confirmed', month: '2026-11', planned: { fund: 750, contribution: 2200 },
  saving: { planned: 2950, putAway: 1700, leftToDeposit: 1250, due: ['RRSP', 'FHSA'] },
  lines: { fund: [{ name: 'Emergency fund' }, { name: 'Vacation' }], contribution: [{}, {}, {}] }, ...o });
expect(savingButton(v({}))).toEqual({ line1: '$1,250 left to deposit', line2: 'RRSP and FHSA', done: false });
expect(savingButton(v({ saving: { planned: 2950, putAway: 2950, leftToDeposit: 0, due: [] } })))
  .toEqual({ line1: 'All deposited', line2: '$2,950 put away in November', done: true });
expect(savingButton(v({ planned: { fund: 750, contribution: 0 }, lines: { fund: [{ name: 'Emergency fund' }, { name: 'Vacation' }], contribution: [] },
  saving: { planned: 750, putAway: 750, leftToDeposit: 0, due: [] } })))
  .toEqual({ line1: '$750 into funds', line2: 'Emergency fund and Vacation', done: false });
expect(savingButton(v({ planned: { fund: 900, contribution: 0 }, lines: { fund: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], contribution: [] },
  saving: { planned: 900, putAway: 900, leftToDeposit: 0, due: [] } })).line2).toBe('3 funds');
expect(savingButton(v({ status: 'draft' }))).toEqual({ line1: '$2,950 planned', line2: 'Counts once you confirm', done: false });
expect(savingButton(v({ planned: { fund: 0, contribution: 0 }, lines: { fund: [], contribution: [] },
  saving: { planned: 0, putAway: 0, leftToDeposit: 0, due: [] } })))
  .toEqual({ line1: 'Nothing planned yet', line2: 'Add a fund or an account', done: false });
expect(joinNames(['RRSP', 'TFSA', 'FHSA'])).toBe('RRSP, TFSA and FHSA');
expect(depositBanner(v({}))?.title).toBe('Deposit $1,250 this month');
expect(depositBanner(v({ status: 'draft' }))).toBeNull();
```

  `depositBanner(...).body` = `"<LABEL> $<left> · <LABEL> $<left>. It's already set aside in your
  plan. Log each one once it's in the account."`, built from the `lines.contribution` that have
  `left > 0`.

- [ ] **Step 2: Run it to verify it fails.**
  `node node_modules/vitest/vitest.mjs run test/unit/savingCopy.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement `savingCopy.ts` and `meta.ts`, and add `'🌱': Sprout` to `icons.ts`.**

- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Build the three components** (mockup 1 screens 5 and 6, mockup 2 card C, mockup
  1 screen 8).
  - **`AccountCard`:**
    - header: `EmojiAvatar` with `KIND_META`, the label, `"<tax_year> · by <goal_deadline 'MMM d, yyyy'>"`
      and a chevron;
    - the this-month panel (states below);
    - `HatchedBar` (pct of `contributed / goal`, badge `NN%`; no goal → pct of
      `contributed / contribution_room`);
    - a three-column stats row: **Contributed · Goal · Room left**. Goal shows `"—"` when
      there's none.
    - **Panel states:**
      - `this_month.deposited >= planned` → green ✓ `"$X deposited · <Month> done"`;
      - `deposited === 0` → amber `"Deposit due"` with `"$0 of $X deposited"`;
      - otherwise neutral `"$D of $X deposited"`, with a small bar.
      - `waiting` → hourglass `"Enter your <year> room from your Notice of Assessment to start
        budgeting."`, `"$N in since <year_start 'MMM d'>"`, and "Log deposit" / "Enter room"
        chips (RRSP) or "Start <year>" (others).
      - Not budgeted → no panel; a "Log deposit" chip sits under the stats.
    - **Over room:** add an amber line `"$X over your room"`. For an RRSP, add `"(up to $2,000 is
      allowed)"` when the excess is ≤ `RRSP_BUFFER`.
  - **`DepositSheet`:** a `MoneySheet`-style sheet.
    - Title `"Log <LABEL> deposit"`, subtitle `"<Month> plan: $P · $D in so far"`.
    - The amount is pre-filled with `max(0, planned − deposited)`.
    - A date input (default today) and an optional note.
    - Preview line: `"After this: $C of $G."`
    - CTA `"I deposited it"`. It calls `registered.addContribution` and toasts.
  - **`AccountEditor`:**
    - The kind segmented control appears only in `'add'` mode, limited to `kinds`.
    - **Fields:**
      - room (with the hint per kind);
      - "Already put in for <year>" (add only);
      - goal with a "Use all my room" link;
      - deadline as a date input with `max={year_end}`;
      - a "Budget it monthly" switch with the preview
        `"$X a month · <Mon> – <Mon> (N months)"` (from `monthlyLine` / `monthsLeft`);
      - FHSA only: a checkbox, `"I've reached the $40,000 lifetime limit"`.
    - **Warning:** an amber line when goal > room.
    - **`'newYear'` mode:**
      - a summary panel `"<year> done: you put in $C of your $G goal."`;
      - fields pre-filled from `account.suggestion`;
      - the TFSA hint `"Took money out in <year>? Add it here, since CRA gives it back on Jan 1."`;
      - buttons `"Start <year>"` (`registered.startYear`) and `"Not now"`
        (`registered.snoozeNewYear`).
    - **Delete** (edit mode, via `useConfirm`) calls `registered.remove`, then `onDeleted`.
    - **No `EmojiField`** in this editor.

- [ ] **Step 6: Type-check and build the mobile app.**
  `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts`.
  Expected: no errors.

- [ ] **Step 7: Commit**
  `git add src/phone/contributions src/phone/budget/savingCopy.ts src/phone/ui/icons.ts test/unit/savingCopy.test.ts`,
  then `git commit -m "feat(phone): contribution card, deposit sheet and account editor"`.

---

### Task 8: Saving tab, gauge swap, breakdown sheets, banners and routes

**Files:**
- Create: `src/phone/budget/SavingGauge.tsx` (gauge + button + "Saving in <Month>" sheet)
- Modify: `src/phone/budget/BudgetScreen.tsx`, `src/phone/budget/SavingTab.tsx`,
  `src/phone/PhoneApp.tsx:114`, `src/phone/more/MoreScreen.tsx:9`

**Interfaces:**
- Consumes: `savingButton`, `depositBanner`, `AccountCard`, `DepositSheet`, `AccountEditor` and
  `KIND_META` (Task 7); `BudgetMonthView.saving` / `lines.contribution` (Task 4);
  `AppSettings.contributions_hidden`.
- Produces: the route `/account/:id`, which Task 9 renders. Until then, register it to
  `AccountDetail` as a stub.

- [ ] **Step 1: `BudgetScreen` gauge swap.**
  - **Lift the tab state** above the gauge.
  - **`tab === 'saving'`:** render `<SavingGauge view={v} />` in place of the `Gauge` and the
    safe-per-day button. In `SavingGauge`:
    - the `Gauge` uses `fraction = putAway / planned` (capped at 1; 0 when nothing is planned),
      tone `success`, label `"Put away in <Month>"`, value `CountUp(putAway, moneyWhole)` and sub
      `"of <moneyWhole(planned)> savings plan"`;
    - the button uses the same classes as the safe-per-day pill, with `line1` / `line2` from
      `savingButton`, a ✓ when `done`, and `ChevronRight`;
    - tapping it opens the sheet.
  - **Sheet content:**
    - Funds rows with a subtotal headed "Added when you confirmed";
    - Contribution rows: `"$D of $P"`, a ✓ when met, amber `"Due"` when D is 0. Subtotal headed
      "Counted once deposited";
    - a total row `"Put away"`;
    - the footnote `"All $<planned> already came off the top of your budget."`, plus `" The $<left>
      still to deposit is waiting in your bank account."` when left > 0.
  - **Spending breakdown sheet:** add `<BreakdownRow label="Contributions"
    amount={v.planned.contribution} minus />` after "Savings funds" when it's > 0. Extend the
    footnote to `"Recurring charges, purchases paid from a fund, and RRSP/TFSA/FHSA contributions
    don't count as spending here."`

- [ ] **Step 2: `BudgetScreen` banners** (after the payday cards, in this order):
  - **Deposits due:** `depositBanner(v)` → `Banner tone="brand" icon={<PiggyBank size={20} />}`
    (`Banner` accepts a node), with the chip "Log deposits" → `setTab('saving')`.
  - **TFSA/FHSA waiting:** for each such account (not `new_year_snoozed`), a `Banner tone="brand"`
    titled `"Start your <year> <LABEL> year"`. Tapping it opens `AccountEditor mode="newYear"`.
  - **RRSP year summary:** for each RRSP with `summary_pending`, a `Banner tone="brand"` titled
    `"Your <year> RRSP year is done"`, with the body `"You put in $C of your $G goal. Add your
    <year+1> room when your Notice of Assessment arrives."`. Its action chip is "Got it"
    (`registered.ackSummary`).
  - The accounts come from `useApi(() => window.api.registered.list())`.

- [ ] **Step 3: `SavingTab`.**
  - **Contributions section first**, unless `settings.contributions_hidden` is set and there are
    no accounts:
    - a `SectionTitle` "Contributions" with "+ Add account" while a kind is missing;
    - an `AccountCard` per account, which opens `/account/:id`;
    - **with no accounts:** a `PCard` prompt, `"Have an RRSP, TFSA or FHSA? Add it to plan this
      year's contributions."`, with "Add account" and "Not for me" (`settings.update({
      contributions_hidden: true })`).
  - **Then Funds:** a `SectionTitle` "Funds" with `"Total saved: $X"` on the right and an
    "+ Add fund" button, then the existing filter and cards, unchanged.
  - **Bottom link:** while contributions are hidden, a centred `text-sm text-brand` link "Add an
    RRSP, TFSA or FHSA" opens `AccountEditor mode="add"`. Saving an account also calls
    `settings.update({ contributions_hidden: false })`.

- [ ] **Step 4: Routes.**
  - In `PhoneApp`, remove the `/registered` route and the `Registered` import. Add
    `<Route path="/account/:id" element={<AccountDetail />} />`.
  - In `MoreScreen`, remove the `/registered` entry from `LINKS`.

- [ ] **Step 5: Type-check, build and run the tests.**
  `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts && node node_modules/vitest/vitest.mjs run`.
  Expected: all pass.

- [ ] **Step 6: Commit**
  `git commit -am "feat(phone): Saving gauge, contributions section and deposit banners"`.

---

### Task 9: The account screen

**Files:**
- Create: `src/phone/contributions/AccountDetail.tsx` (replaces Task 8's stub)

**Interfaces:**
- Consumes: `RegisteredAccount.schedule`, `past_years`, `contributions`; `DepositSheet`,
  `AccountEditor`; `useMonth()` for the current month's status.

- [ ] **Step 1: Build the screen to mockup 1, screen 4, styled like `FundDetail`.**
  - **Header:** `NavHeader title=<LABEL>` with an options `CircleButton`.
  - **Hero `PCard`:**
    - xl avatar, `"$C of $G"`, `"<year> goal · by <MMMM d, yyyy>"`;
    - `HatchedBar`, then `"$X to go"` and `"N months left"`;
    - two tiles, `"Room for <year>"` and `"Room left"`;
    - the same over-room amber line as `AccountCard`, plus `"CRA charges 1% a month on the
      excess."`;
    - chips "Log deposit" (active) and "Edit".
  - **Planned row:** `Group` with a `Row`, `"Planned for <Month>"`, `"$D / $P"`. It is tappable
    to edit (`budget.setLine(month, 'contribution', id, amount)` via `MoneySheet`) **only when
    the current month is confirmed**. Otherwise its subtitle is `"Set when you confirm
    <Month>"`.
  - **"By month":** one row per `schedule` entry:
    - month short name;
    - `"$D of $P"`, or `"$D deposited"` when `planned` is null;
    - tag `"$X short"` (amber) or `"+$X extra"` (brand) on past rows when they differ by ≥ $1,
      or a ✓ when they're equal;
    - the current row highlighted and labelled `"This month"`;
    - future rows `"$P planned"`, greyed.
    - Caption: `"Put in extra and the months ahead go down. Miss one and what's left spreads over
      the rest."`
  - **"Contribution history":** this year's deposits newest first, as `Row`s with a trash button
    (`registered.removeContribution`). The opening deposit's note reads "Already in when you set
    it up".
  - **"Past years"** (when there are any): `"<year> · $C of $G goal"`.
  - **Options sheet:** "Edit account", "Stop budgeting monthly" / "Budget it monthly"
    (`registered.update(id, { budgeted })`), and "Delete account" (confirm → `registered.remove`
    → `navigate('/', { replace: true })`).

- [ ] **Step 2: Type-check and build the mobile app.** Same as Task 7, Step 6. Expected: no
  errors.

- [ ] **Step 3: Commit**
  `git commit -am "feat(phone): account screen with by-month history"`.

---

### Task 10: Plan editor, setup step and AI export

**Files:**
- Modify: `src/phone/budget/PlanForm.tsx` (`PlanDraft`, `emptyDraft`, `draftFromView`,
  `draftToLines`, `left`, a new section)
- Modify: `src/phone/budget/PlanEditor.tsx`, `src/phone/onboarding/SetupFlow.tsx`
- Modify: `shared/budgetExport.ts`, `src/phone/onboarding/ExportPanel.tsx`
- Test: `test/unit/budgetExport.test.ts`

**Interfaces:**
- **`PlanDraft`** gains `contribution: Record<number, string>`:
  - `draftToLines` iterates `['spend', 'fund', 'debt', 'contribution']`;
  - `draftFromView` maps `v.lines.contribution` by `account_id`;
  - `left` subtracts `draftSum(draft.contribution)`.
- **`PlanForm`** gains the props `accounts: RegisteredAccount[]` and `onEditAccount?: (a) =>
  void`. It renders a "Contributions" section after "Savings funds", one `MoneyInput` row per
  account that isn't waiting.
- **`BudgetExportInput`** gains `registered: Array<{ label: string; taxYear: number; room: number;
  goal: number | null; deadline: string; contributed: number; monthly: number | null }>`.

- [ ] **Step 1: Write the failing export test.**

```ts
const md = buildBudgetMarkdown({ ...input, registered: [
  { label: 'TFSA', taxYear: 2026, room: 19500, goal: 7000, deadline: '2026-12-31', contributed: 6400, monthly: 600 },
  { label: 'RRSP', taxYear: 2026, room: 14200, goal: null, deadline: '2027-03-01', contributed: 3950, monthly: null } ] });
expect(md).toContain('## Registered accounts');
expect(md).toContain('| TFSA | 2026 | $19,500.00 | $7,000.00 | 2026-12-31 | $6,400.00 | $600.00 |');
expect(md).toContain('| RRSP | 2026 | $14,200.00 | — | 2027-03-01 | $3,950.00 | Not budgeted |');
expect(md).toContain('| Planned registered contributions | $600.00 |');
expect(buildBudgetMarkdown({ ...input, registered: [] })).toContain('## Registered accounts\n\n_None_');
```

  The section goes after `## Savings goals`, with the headers `Account | Year | Room | Goal |
  Deadline | Contributed so far | Monthly plan`. In `## Summary`, insert the row `Planned
  registered contributions` after `Current debt payments`, and make the last row `Left for funds
  and spending` = available − contributions. Update the prompt sentence so the AI keeps the
  planned contributions.

- [ ] **Step 2: Run it to verify it fails.**
  `node node_modules/vitest/vitest.mjs run test/unit/budgetExport.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implement the export.** `ExportPanel` passes `registered` from
  `window.api.registered.list()`, mapping `monthly_plan` → `monthly`.

- [ ] **Step 4: Run it to verify it passes.** Same command. Expected: PASS.

- [ ] **Step 5: Update `PlanForm` and `PlanEditor`** per the Interfaces. `PlanEditor` loads the
  accounts with `useApi`.

- [ ] **Step 6: Add the `SetupFlow` step.**
  - `STEPS` becomes `['pay', 'recurring', 'debts', 'funds', 'registered', 'export', 'plan',
    'done']`, with `TITLES.registered = 'Registered accounts'`.
  - **Body** (mockup 1, screen 9):
    - an `h1`, "Registered accounts";
    - the copy `"Have an RRSP, TFSA or FHSA? Add it to plan this year's contributions. You can skip
      this and add them later from Saving."`;
    - added accounts as tappable `Row`s, subtitle `"$G goal by <MMM d> · $M/month"`, or `"Not
      budgeted"`;
    - an `EditHint`;
    - dashed `"+ Add an <LABEL>"` rows for the kinds that are missing.
  - **Sheet:** `{ kind: 'account'; account?: RegisteredAccount; addKind?: RegisteredKind }` opens
    `AccountEditor`. `onDeleted` calls `dropFromDraft('contribution', id)`.
  - **Footer:** `continueBtn(accounts.length ? 'Continue' : 'Skip for now')`.
  - **Entering `plan` with status `'none'`:** seed `draft.contribution` from
    `v.lines.contribution`.
  - **Done step:** the `savings` part of the `DoneRing` adds `draftSum(draft.contribution)`.

- [ ] **Step 7: Type-check, build and run the tests.**
  `node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts && node node_modules/vitest/vitest.mjs run`.
  Expected: all pass.

- [ ] **Step 8: Commit**
  `git commit -am "feat(phone): contributions in the plan editor, setup and AI export"`.

---

### Task 11: Screenshots, docs and full verification

**Files:**
- Modify: `scripts/phone-shots.mjs` (seed accounts + new shots)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Extend `phone-shots.mjs`.**
  - In the seeding block, create a TFSA (room 19500, goal 7000, budgeted, already 5800) and an
    RRSP (room 14200, goal 6000, budgeted, already 3600), and log a 350 RRSP deposit.
  - Add these shots:
    - `02-saving`: already exists, now showing the gauge;
    - `02b-saving-breakdown`: click the pill;
    - `02c-account`: `#/account/<rrspId>`;
    - `02d-deposit`: click "Log deposit";
    - `10-icon-picker`: open "Edit category", which shows five icons and See all.

- [ ] **Step 2: Run the screenshots.** Run the mobile build, then
  `vite preview --config vite.config.mobile.ts --port 4173`, then
  `node scripts/phone-shots.mjs shots-contrib light fresh` and
  `node scripts/phone-shots.mjs shots-contrib-dark dark`.
  - **Expected:** the screens match mockups 1, 2 and 3 (gauge B, button 2, card C). No text wraps
    or touches at 390px. Dark-mode cards render dark ink on sage.
  - Fix anything that's off before continuing.

- [ ] **Step 3: Update `CLAUDE.md`.**
  - **Data model:** a v14 bullet (registered year columns, `registered_years`, the
    `'contribution'` budget line, `contributions_hidden`).
  - **Phone app section:** contributions on the Saving tab, the gauge swap, deposits counting only
    when logged, the CRA year vs goal deadline, the setup step order, the icon picker's five +
    See all, and Log expense opening without focus.
  - Remove "Registered" from the list of desktop pages shown on the phone.
  - **Features → Registered:** note that the phone now owns it.

- [ ] **Step 4: Full verification.** Run
  `node node_modules/vitest/vitest.mjs run && node node_modules/typescript/bin/tsc --noEmit && node node_modules/vite/bin/vite.js build && node node_modules/vite/bin/vite.js build --config vite.config.mobile.ts`.
  Expected: every test passes on both drivers, there are no type errors, and both builds
  succeed.

- [ ] **Step 5: Commit**
  `git commit -am "docs: contributions, saving gauge and phone fixes"`.
