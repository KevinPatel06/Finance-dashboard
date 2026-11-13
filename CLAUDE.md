# Finance Dashboard — Project Brief

Personal-finance app for tracking biweekly paychecks, bills, savings goals, expenses, and
debt payoff. Built for Kevin (Canada), but shareable — the displayed user name is a runtime
setting so anyone can rebrand it to their own.

Ships as **three apps from one codebase**: a Windows **Electron** desktop app, an **iOS** app
(Capacitor, sideloaded via LiveContainer) and an **Android** app (Capacitor, a signed `.apk`
Kevin sends a friend). iOS and Android are one *mobile* build. All share `src/` verbatim and
all business logic through `core/`. A change is written once.

## Stack
- **React 18** + **TypeScript** + **Vite 6** + **TailwindCSS 3** — shared by both targets
- **Electron** (desktop shell) + **better-sqlite3** (main process)
- **Capacitor 6** (iOS + Android shell) + **sql.js** (WASM SQLite, in the WebView)
- **Recharts** (charts), **date-fns** (dates), **lucide-react** (icons), **canvas-confetti**
- **react-router-dom** (HashRouter), **zustand** available but UI mostly uses local state
- **Vitest** for tests; **node:sqlite** as the Node-side test driver
- Packaged with **electron-builder** → Windows NSIS installer; GitHub Actions → unsigned `.ipa`
  + signed `.apk`

## Run / Build
```
npm run dev            # Vite + Electron dev (hot reload)
npm test               # Vitest — repo contract on 2 drivers + apiMap + migration tests
npm run build:web      # tsc -b && vite build          (shared step)
npm run build          # build:web && electron-builder → release/ installer
npm run build:unpacked # same but --dir (skips installer; avoids Windows symlink issue)
npm run build:mobile   # vite build --config vite.config.mobile.ts → dist-mobile/ (iOS + Android)
npm run build:ios      # build:mobile && cap sync ios
npm run build:android  # build:mobile && cap sync android
```
- Requires **Node 18+** for the app; **Node 22.5+** for the test suite (`node:sqlite`).
  Dev machine runs Node 24.
- Type-check directly with: `node node_modules/typescript/bin/tsc --noEmit`
  Build directly with: `node node_modules/vite/bin/vite.js build`
  Test directly with: `node node_modules/vitest/vitest.mjs run`
  (the `.bin` shims sometimes fail on this Windows shell — call via `node` directly. `npm test`
  itself can fail here because npm spawns cmd.exe without `node` on PATH; CI is unaffected.)
- **Phone builds happen on GitHub Actions** (`.github/workflows/phone.yml`, "Build phone
  apps"). Locally the `npx` shim fails too: run `node node_modules/@capacitor/cli/bin/capacitor`.
- **iOS** (`build` job, `macos-latest`, free for public repos). It runs the test suite on ubuntu first, then archives unsigned and zips a
  `Payload/` into `FinanceDashboard.ipa`, uploaded as a workflow artifact. No Mac, no Apple
  Developer account, and no code signing are needed — LiveContainer takes the unsigned ipa.
  `npx cap add ios` DOES work on Windows; only `pod install` is skipped (CI runs it).
  A run failing with "The job was not acquired by Runner" means GitHub had no Mac free: re-run.
- **Android** (`android` job, `ubuntu-latest`): `build:mobile` → `cap sync android` → JDK 17 →
  `./gradlew assembleRelease` → artifact `FinanceDashboard-apk`. There's no Android SDK or Java
  on Kevin's PC, so the APK is only ever built in CI. Signing: see "Android app" below.
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
  installed `window.api`); on the phone it opens the DB and builds the API before React renders.
- `src/platform/mobile/` (iOS + Android) — `db.ts` (sql.js adapter), `storage.ts` (open/flush/rotate backup),
  `api.ts` (in-process `window.api`), `notify.ts`, `files.ts`, `haptics.ts`, plus Android-only
  `androidBack.ts` and `statusBar.ts` (no-ops unless `Capacitor.getPlatform() === 'android'`).

**IPC pattern (unchanged — still 4 files):** add channel to `shared/ipc.ts` → repo fn in
`core/repo.ts` → entry in `core/apiMap.ts` → namespace method in `electron/preload.ts` AND
`src/platform/mobile/api.ts` → use `window.api.x.y()` in a page. `test/apiMap.test.ts` fails if
a channel has no apiMap entry, so phone support can't be silently forgotten.

## Data model (migrations v1–v14)
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
- **v14** (`contributions`, phone): **rebuilds `budget_lines`** (SQLite can't alter a CHECK) so
  `kind` allows `'contribution'` — ids, uuids and `updated_at` are copied, the sync triggers are
  dropped first and re-added, so no tombstones. `registered_accounts` gains `tax_year, goal,
  goal_deadline, budgeted, waiting, fhsa_lifetime_max` (existing rows → current CRA year,
  budgeting off). New `registered_years(account_id,tax_year,room,goal,goal_deadline,
  contributed,closed_at)` for closed years. Setting `contributions_hidden` ("Not for me").

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
- `registered_accounts(kind[rrsp|tfsa|fhsa],label,contribution_room,notes,archived,created_at,
  tax_year,goal,goal_deadline,budgeted,waiting,fhsa_lifetime_max)` — `archived = 1` is how both
  apps "delete" (confirmed months that planned a contribution keep their numbers)
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
  warning, inline contribution ledger. Standalone — doesn't touch paycheck/dashboard math. The
  phone owns the richer version (Contributions, below); the desktop page only shows the current
  CRA year and isn't developed further.
- **Payoff** (nav label deliberately NOT "Debt") — typed debt cards, payoff date/interest
  projections, progress bars, expandable "what if I paid more?" line chart (base vs +extra).
  **Mark as paid off** (`debts.markPaidOff`) sets balance 0 + `archived = 1` → "Paid off"
  section with Restore/Delete; drops the debt's plan lines in unconfirmed months ≥ this month
  (confirmed months keep theirs). A $0 card shows a prompt; with money owing it confirms first.
  Anything that puts money back on an archived debt (card charge, undone paycheck payment,
  lowered confirmed plan line) un-archives it via `reopenIfOwing()` — owing debt never hides.
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
  The gauge's **Left to spend** = sum of spend lines − everyday spend (unbudgeted categories
  included); it shows "of $X spending plan" under it, and tapping it opens a breakdown sheet
  (income − recurring − debt − funds ∓ unassigned = plan − spent = left).
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
- **Budget home layout** (Nov 2026 revamp; mockups in the "Finance Phone Revamp" design canvas):
  Spending/Saving switch under the title, then the gauge in a card (or `SavingSummary`), then
  every to-do banner in one swipeable **Needs you** row (`budget/NeedsYou.tsx`) so they never push
  the gauge off screen. Category rows use `Bar` (plain track, filled in the item's `fillTint`).
  The breakdown sheet (`BreakdownSheet.tsx`) lists income, then every plan line **sorted biggest
  first**; the Edit plan sheet opens on a "Left to assign" card with one stacked bar (a line marks
  where income runs out) and folds each section to one row (`PlanSection`, `collapsible`; setup
  leaves them open). Plan-line colours live in `budget/planColors.ts` so the breakdown, Edit plan
  and Saving bar agree. No pace markers: the "Spending fast" chip is the only pace signal.
- **Expenses calendar**: fixed-step green shades (`HEAT` in `MonthCalendar.tsx`, not relative to
  the month's biggest day), `$1.5k` from $1,000 up (`moneyCompact`), today's date in a dark pill,
  the picked day ringed with its expenses (notes included) in a card under the calendar.
  Calendar · Categories · Upcoming is one segmented control.
- **Log expense** (`ExpenseEditor`): its own number pad (`expenses/Keypad.tsx`, `pressKey` is
  unit-tested) so the amount never raises the phone keyboard; Today / Yesterday / Pick a day
  chips; three suggested categories (the description's `guessCategory`, then most used lately)
  + "All". Paid from stays a segmented control; the note field stays.
- **Contributions (RRSP / TFSA / FHSA)** — spec `docs/superpowers/specs/2026-11-08-contributions-
  design.md`. **Optional**: no accounts → the budget is exactly as before; "Not for me" hides the
  section. CRA rules live in `shared/registered.ts` (limits, `rrspDeadline` = 60th day, weekend →
  Monday; `yearBounds`, `monthlyLine`, `suggestNewYear`, `scheduleRows`). Each account has a **CRA
  year** (`tax_year`; TFSA/FHSA calendar year, RRSP day-after-last-deadline → 60th day) and an
  optional goal whose **deadline is only when the goal is due** (never later than the year's end).
  Deposits belong to a year **by date**. With "Budget it monthly" a `'contribution'` budget line =
  (goal − deposits before the month) ÷ months whose 1st is before the deadline; **draft months
  recompute it on every read** (`syncContributionLines`, writes only on change), confirmed months
  are frozen, so an extra/short deposit moves the following months. Lines come **off the top**
  like funds (`leftToAllocate`), but **only logged deposits count as contributed**
  ("I deposited it"). A year **closes lazily** after its CRA end (`closeRegisteredYears`, in
  `listRegisteredAccounts`/`budgetMonth` → both write): row in `registered_years`, account
  `waiting`; TFSA/FHSA get a "Start your <year>" banner with suggested room (snooze = meta
  `reg_newyear_snooze:<id>`), the RRSP waits for the user's NOA number (summary ack = meta
  `reg_summary_ack:<id>:<year>`). Saving tab: the Budget hero **swaps with the tab** for
  `SavingSummary` ("Put away in <Month>" = confirmed fund lines + deposits this month, as one
  number with a bar split by funds and each account; status copy in `budget/savingCopy.ts`), then
  a "To deposit this month" list with Log buttons, a card per account, account screen
  `/account/:id`. The More entry and `/registered` route are gone.
  Small rules, all in `shared/registered.ts` so the UI, budget and export can't disagree:
  `overRoomBy` (an RRSP may be $2,000 over with **no** charge; only the part above is taxed 1%/mo,
  TFSA/FHSA the whole excess), `depositEffect` (the deposit sheet's "From Dec: $600 → $350 a month"
  — built on `monthlyLine`, its "before" assumes this month's plan gets deposited; a contract test
  pins it to the budget's real next line), `planStatus` + `PLAN_STATUS_LABEL` (why there's no
  monthly amount: goal met / no goal / not budgeted / deadline passed — the AI export and setup
  use it). The FHSA "$40,000 reached" box ticks itself when lifetime deposits reach the cap.
  **Deleting an account** archives it; in a confirmed month its line keeps its number, its
  deposits still count as put away, it is never "due" (`left` = 0), and the Saving gauge's
  planned counts only what was deposited into it.
- **Quick add** (`shared/quickAdd.ts`, rules only — no AI) parses "coffee 5, gas 50 yesterday",
  learning categories from history. **Export** (`shared/budgetExport.ts`) builds one Markdown
  file for the user's own AI; platform channel `files:exportText`.
- **Reminders**: repeating iOS local notifications (ids 9001–9003) scheduled by
  `scheduleReminders()` in `src/platform` — daily log, 1st of month, Monday report.
- Theme defaults to **light** for fresh installs. A light/dark button (`ui/ThemeButton.tsx`) is
  pinned top-right on every phone screen; `LargeHeader`/`NavHeader` leave room for it, and it
  cross-fades colours by putting `theming` on `<html>` for ~400ms.
- **Warm phone palette** (Life Centralized's): `PhoneApp` puts `phone` on `<html>`, and
  `index.css` redefines the tokens under `html.phone` — light = Beige page + Ivory cards, dark =
  Charcoal page + **Sage cards**. Sage cards are light, so in dark mode anything with
  `bg-surface-2` / `.card` / `.input` / `[data-on-card]` re-scopes the tokens to dark ink (plus a
  base-layer `color` rule, since inherited text colour is computed and won't follow the vars).
  New card-like surfaces must use one of those or they'll get light text on sage. The phone
  ignores the accent picker (`--brand` is `!important` there; Settings hides it on mobile).
  `pastel.ts` washes toward the (always light) card colour.
- **Motion** (all in `index.css`, phone-scoped, off under Reduce Motion): `.press` (dip + spring
  back via `linear()` springs `--spring-press/slide/sheet`; `[--dip:0.9]` to tune). `PhoneLayout`
  is a screen **stack**: pushes slide in over the previous screen, which stays mounted
  underneath (`ph-under`) so Back / the left-edge swipe reveal it with scroll intact; tabs and
  `replace` navigations fade up. Animations use `fill: backwards` so a resting screen has no
  transform (a transform would re-anchor `position: fixed` children). `Sheet` is portalled to
  `<body>`, springs in, drags down to dismiss, and animates out by cloning its last frame (callers
  usually unmount it, leaving React nothing to animate). Segmented control + tab bar use one
  sliding thumb; the gauge lights segment by segment (`CountUp` for the amount); bars fill on mount.
- **Icons, not emoji**: the phone never shows emoji. Categories, funds and recurring items still
  STORE an emoji (`emoji` columns, `shared/emoji.ts` suggestions, the AI export, desktop all
  unchanged); `src/phone/ui/icons.ts` maps each to a lucide icon, drawn by `EmojiAvatar` (pastel
  circle, icon tinted by `iconInk()`), `EmojiIcon` (bare) and `Banner` (string `icon`). The picker
  (`EmojiField`, needs `name` + `context`) shows **five suggestions** (`ui/iconChoices.ts`
  `topIcons`: current pick, name match, common picks per editor — worked out around the pick the
  picker OPENED with, so tapping one never reorders the row; a pick from the grid takes the last
  slot via `withPick`) **+ "See all"** for the full `PICKABLE` grid; an unknown stored emoji draws a package. New app-owned rows pass an emoji that
  has an entry in `icons.ts` (RRSP 🏦, TFSA 🌱, FHSA 🏠).
- **Sheets that hold a form don't autofocus** (`Sheet autoFocus={false}`): Log expense opens at the
  top with the keyboard down. Quick add keeps focusing its text box on purpose.
- **Haptics**: `haptic()` in `src/platform` (`@capacitor/haptics`, iOS-only branch). Clicks on
  `.press` / `[role=switch]` tap; success/error toasts buzz (`lib/ui.tsx`).
- First run: one welcome screen (app icon, three points, name box) → `SetupFlow` (pay →
  recurring → debts → funds → registered accounts → export → plan → done). There's no budget-period step; the pay
  step says the budget runs 1st to month-end. Every item added in setup is tappable to edit or
  delete (DebtSheet/FundEditor/CategoryEditor take an optional `onDeleted`; PlanForm takes
  optional `onEdit*`), and a delete also drops it from the plan draft.
- Visual check: `scripts/phone-shots.mjs` (headless Edge over CDP, no puppeteer) — build
  `vite.config.mobile.ts`, `vite preview --config vite.config.mobile.ts --port 4173`, then
  `node scripts/phone-shots.mjs <outDir> light|dark [fresh]`.

## iOS app
- **Phone shell, not desktop parity** — the iPhone runs `PhoneApp`; Payoff, Reports and
  Settings are the shared desktop pages under a back header. Bills, Paychecks/
  Wizard, Calendar and the desktop Dashboard aren't reachable on the phone. Same `src/`.
- **Storage**: sql.js holds the DB in memory and flushes `db.export()` to Capacitor Filesystem
  after every mutating call (per `apiMap`'s `mutates` flag) and on `appStateChange` when iOS
  backgrounds the app, keeping one rotated `finance.db.bak`. The DB is well under 1MB.
  **Flushes MUST stay serialised, and each MUST snapshot inside its own turn** (`storage.ts`).
  Concurrent `writeFile`s to one path can interleave; worse, a flush that snapshots early and
  lands late writes back pre-write state, silently reverting committed rows. That cost the
  first-run goals: `setUserName()` fires a settings write it never awaits, so its flush raced
  the awaited `goals.create` ones. `test/iosFlush.test.ts` pins both properties.
  **A mutating call only flushes if it changed a row** (`flushIfChanged`, comparing SQLite's
  `total_changes()` before/after): `registered.list` and `budget.month` are flagged mutating
  because they may close a year or fill a draft, but usually write nothing.
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
- **No IPC** — `src/platform/mobile/api.ts` builds `window.api` in-process from `core/apiMap.ts`
  and wraps results in Promises, so pages can't tell the difference.
- **Restore is desktop-only** (no first-party Capacitor document picker). Settings hides the
  button on iOS and relabels Backup as "Share database".
- **Distribution**: unsigned `.ipa` from GitHub Actions → LiveContainer. No App Store review,
  so no compliance constraints. WKWebView gets JS JIT from the system WebContent process
  regardless of the host app's entitlements, so it runs at full speed under LiveContainer.

## Android app
- **Same phone app as iOS**, no Android-only screens; everything in "Phone app" and the iOS
  storage/resume rules applies. Capacitor Filesystem's Android `rename` deletes the target
  then renames, so the tmp → `finance.db` swap works as on iOS (the `.bak` covers the gap).
- **Back button** (`src/lib/backStack.ts`): `Sheet`, `Modal`, `ConfirmDialog` and `FlowShell`
  register with `useBackHandler()` while open. Back runs the top one, else `navigate(-1)`, else
  on a root tab or the welcome screen `App.minimizeApp()`. A new overlay must register too, or
  back skips straight past it.
- **Status bar** follows the theme (`setStatusBar()`, called from `applyTheme`): Beige
  `#EEE5D5` / Charcoal `#1D1E1C`. Portrait-only activity; Beige launch screen. Reminder icon
  `res/drawable/ic_stat_notify.xml` (`capacitor.config.ts` → `LocalNotifications.smallIcon`).
  App icon = a full-bleed 1024px PNG as the adaptive-icon background (`res/drawable-nodpi`), its
  mark scaled to 0.8 because the launcher shows only the middle ~2/3. See "App icon" below.
- **Signing: never regenerate or lose the key.** One PKCS#12 keystore signs every APK, which is
  what lets a new build install over the old one and keep the friend's data. It lives ONLY in
  repo secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) and in Kevin's backup folder `Documents\Finance Dashboard signing key`.
  The repo is **public**: never commit it (`.gitignore` blocks `*.p12`, `*.jks`, `*.keystore`),
  print it, or upload it as an artifact. Without the secret, CI builds an unsigned APK.
- **versionCode = `git rev-list --count HEAD`** (CI checks out full history); `versionName` =
  `package.json` version. Android refuses an "update" with a lower code, so never rewrite
  `main`'s history. (Not `run_number`: that restarts whenever the workflow file is renamed.)
- **Sending it to the friend**: open the green run → Artifacts → `FinanceDashboard-apk` (a zip)
  → unzip → send `FinanceDashboard.apk` (chat app, email, Drive). On first install Android asks
  to allow "Install unknown apps" for whatever opened the file. Updates: same steps; the phone
  says "Update" and keeps their data.

## App icon
- **The gauge** (the Budget screen's left-to-spend gauge, green on Ivory). ONE source:
  `shared/appIcon.ts` → `appIconSvg()`. The welcome screen inlines it (`src/phone/ui/AppIcon.tsx`);
  `node scripts/render-icons.mjs` (headless Edge, no image libs) writes `build/icon.svg` + `.png`
  (desktop, rounded), the iOS `AppIcon-512@2x.png` and Android `ic_launcher_full.png` (square,
  RGB with NO alpha: iOS paints transparency black), and `branding/app-icon.png` (rounded) +
  `app-icon-square.png` for sharing. Change the TS, re-run the script, commit the PNGs. The Android
  notification icon `ic_stat_notify.xml` is a hand-made white gauge silhouette to match.

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
  `emit-sql-wasm` plugin in `vite.config.mobile.ts` emits it phone-only instead.
- **`__PLATFORM__`** (`'electron' | 'mobile'`) is a Vite `define` in both configs, declared in
  `src/global.d.ts`. Because it's a compile-time constant, platform branches are eliminated
  from the bundle that doesn't need them — that's what keeps sql.js out of the desktop build.
- **Responsive rule**: the desktop layout is `md` and above and must stay pixel-identical.
  Below `md` the app is `src/phone/` (its own shell). Shared desktop pages shown on the phone
  (Payoff/Reports/Settings) keep their `md:hidden` / `hidden md:block` treatments.
- **Tests**: `test/shared/repoContract.ts` is a driver-agnostic behavioural contract run
  against BOTH node:sqlite and sql.js. Both must pass identically — that's the iOS parity
  proof. If a change makes them disagree, fix the adapter, never weaken the contract.
  better-sqlite3 itself isn't under test because `electron-rebuild` builds it against
  Electron's ABI (MODULE_VERSION 130), which plain Node (137) can't load; rebuilding it for
  Node would break the desktop app. It's covered by the same interface plus `npm run dev`.
- **Kevin's working style**: design-first then iterate; prefers polished UI. Present the result,
  then take change requests.
