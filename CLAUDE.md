# Finance Dashboard — Project Brief

Personal-finance app for tracking biweekly paychecks, bills, savings goals, expenses, and
debt payoff. Built for Kevin (Canada), but shareable — the displayed user name is a runtime
setting so anyone can rebrand it to their own.

Ships as **two apps from one codebase**: a Windows **Electron** desktop app and an **iOS**
app (Capacitor, sideloaded via LiveContainer). They share `src/` verbatim and all business
logic through `core/`. A change is written once.

## Stack
- **React 18** + **TypeScript** + **Vite 6** + **TailwindCSS 3** — shared by both targets
- **Electron** (desktop shell) + **better-sqlite3** (main process)
- **Capacitor 6** (iOS shell) + **sql.js** (WASM SQLite, in the WebView)
- **Recharts** (charts), **date-fns** (dates), **lucide-react** (icons), **canvas-confetti**
- **react-router-dom** (HashRouter), **zustand** available but UI mostly uses local state
- **Vitest** for tests; **node:sqlite** as the Node-side test driver
- Packaged with **electron-builder** → Windows NSIS installer; GitHub Actions → unsigned `.ipa`

## Run / Build
```
npm run dev            # Vite + Electron dev (hot reload)
npm test               # Vitest — repo contract on 2 drivers + apiMap + migration tests
npm run build:web      # tsc -b && vite build          (shared step)
npm run build          # build:web && electron-builder → release/ installer
npm run build:unpacked # same but --dir (skips installer; avoids Windows symlink issue)
npm run build:ios      # vite build (iOS config) && cap sync ios
```
- Requires **Node 18+** for the app; **Node 22.5+** for the test suite (`node:sqlite`).
  Dev machine runs Node 24.
- Type-check directly with: `node node_modules/typescript/bin/tsc --noEmit`
  Build directly with: `node node_modules/vite/bin/vite.js build`
  Test directly with: `node node_modules/vitest/vitest.mjs run`
  (the `.bin` shims sometimes fail on this Windows shell — call via `node` directly. `npm test`
  itself can fail here because npm spawns cmd.exe without `node` on PATH; CI is unaffected.)
- **iOS builds happen on GitHub Actions** (`.github/workflows/ios.yml`, `macos-latest`, free
  for public repos). It runs the test suite on ubuntu first, then archives unsigned and zips a
  `Payload/` into `FinanceDashboard.ipa`, uploaded as a workflow artifact. No Mac, no Apple
  Developer account, and no code signing are needed — LiveContainer takes the unsigned ipa.
  `npx cap add ios` DOES work on Windows; only `pod install` is skipped (CI runs it).
- **Install gotcha**: better-sqlite3 has no Node 24 prebuild + no VS Build Tools here.
  Install with `npm install --ignore-scripts`, then `npx electron-rebuild -f -w better-sqlite3`
  (pulls Electron's prebuilt binary). If Electron itself won't launch
  ("Electron failed to install correctly"), run `npm rebuild electron --foreground-scripts`.
- **Installer gotcha**: `electron-builder` needs Windows **Developer Mode ON** (or run as admin)
  to extract the winCodeSign toolkit's macOS symlinks. `build:unpacked` sidesteps this.
- Product name "Finance Dashboard"; installer → `release/Finance Dashboard-Setup-<ver>.exe`.

## Architecture

**`core/` — platform-neutral. No Electron, no Capacitor, no DOM.**
- `core/db.ts` — the ENTIRE SQLite surface the data layer uses: `prepare(sql)` →
  `.all/.get/.run`, `exec`, `transaction`. Plus `setDb()`/`getDb()`. better-sqlite3 satisfies
  this structurally with no runtime adapter; sql.js and node:sqlite get ~100-line shims.
  Keeping this surface tiny is what makes the iOS port cheap — don't widen it casually.
- `core/repo.ts` — ALL data logic + computed projections. Identical on both platforms.
- `core/migrations.ts` — versioned migrations, applied ascending, recorded in `_migrations`.
  Settings seeded each launch (`INSERT OR IGNORE`).
- `core/apiMap.ts` — **the single enumeration of repo-backed IPC channels.** Electron loops
  over it to register `ipcMain.handle`; iOS loops over it to build `window.api` in-process.
  Each entry carries a `mutates` flag that drives the iOS flush-to-disk.
- `core/notifications.ts` — `buildNotes()`: decides WHAT to remind about. Delivery is
  per-platform.

**`shared/`** — `types.ts`, `ipc.ts` (channel-name constants), `debtMath.ts`
(`periodRate`/`PERIODS_PER_YEAR`, dependency-free; `src/lib/debtMath.ts` re-exports them).

**`electron/`** — desktop shell.
- `main.ts` — app entry. Pins userData to `%AppData%\Finance Dashboard` via `app.setPath`
  (so renames don't orphan the DB); one-time migration copies an old
  `Kevin's Finance Application` DB if present.
- `preload.ts` — exposes `window.api.*` (contextBridge). Namespaces: `settings, categories,
  bills, goals, paychecks, debts, expenseCategories, expenses, recurringExpenses, registered,
  budgets, dashboard, reports, calendar, db, files`.
- `ipc/handlers.ts` — loops over `core/apiMap.ts`, then three hand-written platform handlers
  (db backup/restore, CSV export).
- `db/index.ts` — opens SQLite (WAL, FK on), calls `setDb()`, runs migrations. Keeps the
  concrete handle as `getRawDb()` for `db.backup()`, which is outside the `DB` interface.
- `notifications.ts` — desktop delivery (native `Notification`) + the once-a-day scheduler.

**`src/`** — renderer, SHARED BY BOTH TARGETS. `pages/` = one file per screen; `components/`
(Layout, Sidebar, BottomNav, TopBar, ThemeToggle, ui/{Modal,ConfirmDialog,EmptyState});
`lib/` (theme, accents, format, utils, debtMath, celebration, csv). `Modal` traps focus +
autofocuses first field (`role="dialog"`), and docks as a bottom sheet below `md`.
- `src/platform/index.ts` — `bootstrapPlatform()`. No-op on Electron (preload already
  installed `window.api`); on iOS it opens the DB and builds the API before React renders.
- `src/platform/ios/` — `db.ts` (sql.js adapter), `storage.ts` (open/flush/rotate backup),
  `api.ts` (in-process `window.api`), `notify.ts`, `files.ts`.

**IPC pattern (unchanged — still 4 files):** add channel to `shared/ipc.ts` → repo fn in
`core/repo.ts` → entry in `core/apiMap.ts` → namespace method in `electron/preload.ts` AND
`src/platform/ios/api.ts` → use `window.api.x.y()` in a page. `test/apiMap.test.ts` fails if
a channel has no apiMap entry, so iOS support can't be silently forgotten.

## Data model (migrations v1–v13)
- **v1**: `settings(key,value)`, `categories`, `bills`, `savings_goals`, `paychecks`,
  `paycheck_allocations`.
- **v2**: `savings_goals.archived_at`.
- **v3**: `expense_categories`, `expenses` (+ seeds 9 expense categories ONCE in the migration).
- **v4**: `debts`.
- **v5**: `expenses.debt_id` (CC charge link) + rebuilt `paycheck_allocations` to allow
  `kind='debt'`.
- **v6**: `debts.interest_day` + `debts.last_interest_applied` (auto-charge bookkeeping).
- **v7**: `debts.compounding` ('monthly'|'semi_annual'); existing mortgages set to semi_annual.
- **v8**: `expense_budgets(category_id PK, monthly_limit)` — optional monthly cap per category.
- **v9**: `recurring_expenses` — templates that auto-generate expenses on a schedule.
- **v10**: `registered_accounts` + `registered_contributions` (RRSP/TFSA/FHSA room tracking).
- **v11**: sync groundwork — `uuid` + `updated_at` on all 12 data tables, plus `_deletions`
  (`table_name,uuid,deleted_at`). **Pure DDL + triggers; changes zero lines of `repo.ts`.**
  UUIDs come from `AFTER INSERT` triggers (SQLite can't take a non-constant `DEFAULT` in
  `ALTER TABLE ADD COLUMN`), `updated_at` from `AFTER INSERT`/`AFTER UPDATE`, tombstones from
  `AFTER DELETE`. Deletes stay HARD — a `deleted_at` column per table would have forced
  `WHERE deleted_at IS NULL` onto nearly every SELECT. No sync is implemented; this only makes
  it possible later (integer autoincrement PKs collide across devices, and retrofitting stable
  IDs across historical rows is the expensive part).
- **v12**: `onboarded` setting decided once from existing data.
- **v13** (`budget_redesign`, phone budget): `expense_categories.emoji/kind('need'|'want')/
  sort_order`, `savings_goals.emoji`, `expenses.fund_id` ("paid from fund") + `recurring_id`
  (set by materialisation; backfilled from `note='Recurring'`), `recurring_expenses.
  interval_count/emoji`, `paychecks.payday`; new `budget_months(month PK 'YYYY-MM',
  confirmed_at)`, `budget_lines(month,kind[spend|fund|debt],ref_id,amount)` (polymorphic
  ref, no FK — deletes of categories/funds/debts clean up in repo), `fund_transactions
  (goal_id,kind[deposit|withdrawal],amount,date,note)`. All three get v11 sync triggers via
  `addSyncTracking()`. `runMigrations(db, maxVersion)` — the ceiling is for upgrade tests.

Notification prefs are seeded each launch (`INSERT OR IGNORE`): `notify_enabled`,
`notify_bill_lead_days`, `notify_paycheck`, `notify_budget`, plus (v13, phone) `pay_amount`,
`pay_frequency`, `notify_daily_log`, `notify_daily_time`, `notify_new_month`,
`notify_weekly_report`. Payday "Not yet" snoozes are meta keys `payday_snooze:<date>`. `last_notified_date` is a
bookkeeping key (once-per-day dedup) read/written via `repo.getMeta`/`setMeta`.

Key tables:
- `bills(name,amount,frequency[biweekly|monthly|semi_annual|yearly|custom_days],custom_days,
  anchor_date,category_id,autopay,notes,archived,created_at)`
- `paycheck_allocations(paycheck_id,kind[bill|goal|fun|other|debt],ref_id,amount,note)`
- `debts(name,type[credit_card|mortgage|car_loan|line_of_credit|loan],original_amount,
  current_balance,interest_rate,payment_amount,payment_frequency[weekly|biweekly|semi_monthly|
  monthly],split_count,interest_day,last_interest_applied,compounding,notes,archived,created_at)`
- `expenses(description,amount,date,category_id,note,debt_id,created_at)`
- `expense_budgets(category_id,monthly_limit)`
- `recurring_expenses(description,amount,category_id,debt_id,frequency[weekly|biweekly|monthly|
  yearly],anchor_date,last_generated,archived,created_at)`
- `registered_accounts(kind[rrsp|tfsa|fhsa],label,contribution_room,notes,archived,created_at)`
- `registered_contributions(account_id,amount,date,note,created_at)`

## Features
- **Dashboard** — hero "average savings per paycheck" (historical: goal allocations ÷ paychecks)
  + sub-stat "avg bills per paycheck" (smoothed = each bill ÷ 26 biweekly equiv). Stat cards
  (income/bills/savings/fun this month). "Bills to pay this month" card (overdue→due-soon→paid,
  paid greyed at bottom). Savings goals card. "Payoff progress" card (hidden if no debts).
- **Paychecks + Wizard** (centerpiece) — multi-step: Amount → Bills → [Debt, only if a CC/LOC
  exists] → Savings → Fun money → Review. Wizard pre-checks overdue/soon bills, flags overdue
  red. Edit/delete supported. Logging rolls `next_paycheck_date` +14d.
- **Bills** — CRUD + categories (own colors). Monthly-avg & yearly-total summary cards.
  Status column (Overdue/Due soon/Up to date), sorted by status then due date.
- **Goals** — targets, progress bars, confetti celebration at 100% (once, tracked in
  localStorage), Mark-complete (archive→Accomplished section), restore, hard-delete.
- **Registered** (nav between Goals & Payoff) — RRSP/TFSA/FHSA cards with MANUAL contribution
  room (user enters their CRA room — no tax math), contributed/remaining bars, over-contribution
  warning, inline contribution ledger. Standalone — doesn't touch paycheck/dashboard math.
- **Payoff** (nav label deliberately NOT "Debt") — typed debt cards, payoff date/interest
  projections, progress bars, expandable "what if I paid more?" line chart (base vs +extra).
- **Expenses** — purchases ledger, own categories, filter/search, "spent this month" header,
  optional note, CSV export (respects filters). Defaults filter to current month. Per-category
  monthly **budget** bars (amber ≥80%, red ≥100%); caps edited in the category manager.
  **Recurring** manager: templates auto-materialize occurrences up to today on each expenses
  read (reuses `createExpense`, so the CC charge bridge stays intact).
- **Calendar** — month grid of bills due / paid / paychecks. Expenses NEVER appear here.
- **Reports** — toggle Overview (bills/savings charts) ↔ Expenses (Month/6mo/1yr/All-time:
  total, pie by category, over-time bar, top purchases, CSV export; month views show a
  praise/reality-check comparison vs prior month).
- **Settings** — user name (→ sidebar + window title), theme (light/dark), accent color
  (7 options), next-paycheck date, **notifications** (master toggle, bill lead days, paycheck &
  budget switches), DB backup/restore (restore is desktop-only).
- **Forms** — editors validate inline (error under the field once touched) + disable Save until
  valid. Reusable `.input-error`/`.field-error` classes.

## Payment / debt logic (important)
- **Bill "paid" tracking** is derived, not stored: a paycheck's bill allocation stores the
  occurrence due date in `note`. `paidBillOccurrences()` builds the paid set from that; works
  retroactively. `billsToPay(windowEnd)`, `billStatuses()`, `billsThisMonth()` use it.
  Tracking floor = bill's created_at (capped 366d) so new bills don't show fake overdue history.
- **Revolving debts** (credit_card, line_of_credit): no payment-per-cycle. Paid via the wizard's
  Debt step (`kind='debt'` allocation decrements `current_balance`). Expenses can be charged to a
  credit card (`expenses.debt_id`) which INCREASES its balance. All reversible: paycheck/expense
  edit & delete revert balance changes. Balance writes clamp `MAX(0, …)`.
- **Interest day**: revolving debts can set day-of-month interest hits. `applyPendingInterest()`
  (inside `listDebts()`) adds balance × `periodRate(rate,'monthly',compounding)` on/after that
  day, compounding per elapsed month, idempotent via `last_interest_applied`; never retro-charges.
  (It routes through the SHARED `periodRate`, so it honours the debt's compounding convention.)
- **Compounding** (`shared/debtMath.ts` `periodRate()`): semi_annual = Canadian fixed-mortgage
  convention `(1+APR/2)^(2/ppy)−1`; monthly = US/everything-else. Mortgages default semi_annual.
  All payoff AND auto-interest math routes through `periodRate`.

## Phone app (monthly budget) — `src/phone/`
Below `md`, `App.tsx` renders `PhoneApp` instead of the desktop routes (desktop untouched).
Modelled on DaTrack: tabs **Budget · Expenses · More** + a floating **+** (quick add).
Design: `docs/superpowers/specs/2026-10-22-iphone-budget-redesign-design.md`.
- **Budget is the calendar month, zero-based**: income − recurring − debt lines − fund lines =
  spending money, split into Needs/Wants category lines. `repo.budgetMonth(m)` returns the whole
  `BudgetMonthView` (gauge, safe/day, pace, lines with spent/left, unbudgeted spend, paydays).
- **Income** = scheduled paydays (`shared/paydays.ts`, from `next_paycheck_date` +
  `pay_frequency`): confirmed amount, else `pay_amount` for *regular* paydays; *bonus* paydays
  (beyond `guaranteedPerMonth`: weekly 4, biweekly 2, semi-monthly 2, monthly 1) count only
  once confirmed. Legacy paychecks (payday NULL) fill a payday within ±4 days.
- **Only everyday spending lowers left-to-spend**: not `recurring_id`/`note='Recurring'`, not
  `fund_id`. Recurring comes off the top.
- **Months start as drafts** copied from the previous month (skipping completed funds,
  paid-off debts, deleted categories). Debt lines reduce `current_balance` and fund lines count
  toward fund balances **only once confirmed**; later edits apply the difference
  (`changePlan()`). Current-month spend lines are mirrored into `expense_budgets` for desktop.
- **Fund balance is derived** (`fundBalance()`): paycheck goal allocations + confirmed fund lines
  + deposits − withdrawals − expenses paid from the fund.
- **Deleting a fund keeps its row** as `savings_goals.archived = 2` (1 = completed). Every goal
  list asks for `archived = 0` or `1`, so it disappears everywhere. A real DELETE would null
  `expenses.fund_id` (FK `SET NULL`), turning purchases paid from it into everyday spending
  and rewriting past months. `hardDeleteGoal` drops only this and later months' fund lines.
- **Payday check-in** replaces the wizard on the phone (`paydays.confirm/snooze`).
- **Quick add** (`shared/quickAdd.ts`, rules only — no AI) parses "coffee 5, gas 50 yesterday",
  learning categories from history. **Export** (`shared/budgetExport.ts`) builds one Markdown
  file for the user's own AI; platform channel `files:exportText`.
- **Reminders**: repeating iOS local notifications (ids 9001–9003) scheduled by
  `scheduleReminders()` in `src/platform` — daily log, 1st of month, Monday report.
- Theme defaults to **light** for fresh installs. A light/dark button (`ui/ThemeButton.tsx`) is
  pinned top-right on every phone screen; `LargeHeader`/`NavHeader` leave room for it. Screen
  and step changes replay a slight `animate-page-in` fade (keyed by path / step).
- First run: one welcome screen (app icon, three points, name box) → `SetupFlow` (pay →
  recurring → debts → funds → export → plan → done). There's no budget-period step; the pay
  step says the budget runs 1st to month-end.
- Visual check: `scripts/phone-shots.mjs` (headless Edge over CDP, no puppeteer) — build
  `vite.config.ios.ts`, `vite preview --config vite.config.ios.ts --port 4173`, then
  `node scripts/phone-shots.mjs <outDir> light|dark [fresh]`.

## iOS app
- **Phone shell, not desktop parity** — the iPhone runs `PhoneApp`; Payoff, Registered,
  Reports and Settings are the shared desktop pages under a back header. Bills, Paychecks/
  Wizard, Calendar and the desktop Dashboard aren't reachable on the phone. Same `src/`.
- **Storage**: sql.js holds the DB in memory and flushes `db.export()` to Capacitor Filesystem
  after every mutating call (per `apiMap`'s `mutates` flag) and on `appStateChange` when iOS
  backgrounds the app, keeping one rotated `finance.db.bak`. The DB is well under 1MB.
  **Flushes MUST stay serialised, and each MUST snapshot inside its own turn** (`storage.ts`).
  Concurrent `writeFile`s to one path can interleave; worse, a flush that snapshots early and
  lands late writes back pre-write state, silently reverting committed rows. That cost the
  first-run goals: `setUserName()` fires a settings write it never awaits, so its flush raced
  the awaited `goals.create` ones. `test/iosFlush.test.ts` pins both properties.
  Each flush writes `finance.db.tmp`, copies the live file to `.bak` (only if the live file is
  known intact), then renames the temp over `finance.db`, because Capacitor's `writeFile` isn't
  atomic. `openDatabase()` NEVER writes: it tries `finance.db` → `.tmp` → `.bak`, each
  `PRAGMA quick_check`ed (an empty file counts as damaged, not new). It starts a fresh DB
  only when no copy exists at all, and throws (stopping the launch, files untouched) if
  the directory can't be listed, a file can't be read, or no copy is intact. Treating
  "couldn't read" as "first launch" would save an empty DB over the real one.
- **Resume**: iOS keeps the app suspended, so a return to the foreground re-runs the
  once-a-day notification check (overlapping runs share one pass) and, on a new day,
  dispatches `DAY_CHANGED` (`src/platform/events.ts`). `RefreshProvider` listens and refetches.
- **Portrait only on iPhone** (`Info.plist`). In landscape the viewport is wider than `md`, so
  `App.tsx` would swap in the desktop shell.
- **No IPC** — `src/platform/ios/api.ts` builds `window.api` in-process from `core/apiMap.ts`
  and wraps results in Promises, so pages can't tell the difference.
- **Restore is desktop-only** (no first-party Capacitor document picker). Settings hides the
  button on iOS and relabels Backup as "Share database".
- **Distribution**: unsigned `.ipa` from GitHub Actions → LiveContainer. No App Store review,
  so no compliance constraints. WKWebView gets JS JIT from the system WebContent process
  regardless of the host app's entitlements, so it runs at full speed under LiveContainer.

## Conventions / gotchas
- **Currency is CAD**, `en-CA` locale (`src/lib/format.ts`). Dates `en-CA`.
- **Build size**: only `better-sqlite3` is in `package.json` dependencies; everything else
  (react, recharts, date-fns, lucide, etc.) is in **devDependencies** because Vite bundles them —
  leaving them in deps makes electron-builder copy ~50MB of untreeshaken packages into app.asar.
  DO NOT move bundled libs back to dependencies; add new bundled libs to devDependencies.
  `build/afterPack.cjs` strips non-en-US Chromium locales (~40MB). `compression: maximum`.
  The ~180MB embedded Chromium in the exe is an unremovable floor (~340MB unpacked → ~240MB).
- **CSS**: component classes (`.input/.btn/.card/.pill`) live in `@layer components` so Tailwind
  utilities (e.g. `w-32`) win over them. Theme via CSS vars (`--surface`, `--brand`, etc.);
  accent picker overrides `--brand*` at runtime per light/dark.
- **Isolation note**: expenses/debts were originally fully isolated from paycheck math; that's
  now intentionally relaxed for exactly two bridges — CC expense charges and paycheck debt
  payments. Budgets, recurring expenses, and registered accounts are ALSO isolated (they read/
  write only their own tables + the expenses ledger via `createExpense`); nothing else touches
  dashboard/paycheck/bill calc paths. Backup/restore copies the whole `finance.db`, so all
  sections ride along — and because both platforms share one schema and migration chain, a
  file exported on Windows restores on iOS and vice versa. That is the current (manual) sync.
- **Positional `?` binding ONLY** in SQL. No named parameters (`@x`/`:x`), no object-form
  binding. The sql.js and node:sqlite shims depend on this; introducing named binding breaks
  the iOS build.
- **Capacitor plugins go in `devDependencies`** like everything else Vite bundles. The iOS
  native side gets its copies through CocoaPods, not `node_modules`.
- **Never use a `?url` import for a platform-specific asset.** Vite emits `?url` assets during
  transform regardless of whether the importing module is reachable, so
  `sql-wasm.wasm?url` leaked 660KB of dead WASM into the Electron bundle. The
  `emit-sql-wasm` plugin in `vite.config.ios.ts` emits it iOS-only instead.
- **`__PLATFORM__`** (`'electron' | 'ios'`) is a Vite `define` in both configs, declared in
  `src/global.d.ts`. Because it's a compile-time constant, platform branches are eliminated
  from the bundle that doesn't need them — that's what keeps sql.js out of the desktop build.
- **Responsive rule**: the desktop layout is `md` and above and must stay pixel-identical.
  Below `md` the app is `src/phone/` (its own shell). Shared desktop pages shown on the phone
  (Payoff/Registered/Reports/Settings) keep their `md:hidden` / `hidden md:block` treatments.
- **Tests**: `test/shared/repoContract.ts` is a driver-agnostic behavioural contract run
  against BOTH node:sqlite and sql.js. Both must pass identically — that's the iOS parity
  proof. If a change makes them disagree, fix the adapter, never weaken the contract.
  better-sqlite3 itself isn't under test because `electron-rebuild` builds it against
  Electron's ABI (MODULE_VERSION 130), which plain Node (137) can't load; rebuilding it for
  Node would break the desktop app. It's covered by the same interface plus `npm run dev`.
- **Kevin's working style**: design-first then iterate; prefers polished UI. Present the result,
  then take change requests.
