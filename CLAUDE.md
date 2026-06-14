# Finance Dashboard — Project Brief

Personal-finance **desktop app** for tracking biweekly paychecks, bills, savings goals,
expenses, and debt payoff. Built for Kevin (Canada), but shareable — the displayed user
name is a runtime setting so anyone can rebrand it to their own.

## Stack
- **Electron** (desktop shell) + **React 18** + **TypeScript** + **Vite 6** + **TailwindCSS 3**
- **better-sqlite3** (local SQLite DB) in the main process
- **Recharts** (charts), **date-fns** (dates), **lucide-react** (icons), **canvas-confetti**
- **react-router-dom** (HashRouter), **zustand** available but UI mostly uses local state
- Packaged with **electron-builder** → Windows NSIS installer

## Run / Build
```
npm run dev            # Vite + Electron dev (hot reload)
npm run build          # tsc -b && vite build && electron-builder  → release/ installer
npm run build:unpacked # same but --dir (skips installer; avoids Windows symlink issue)
```
- Requires **Node 18+** (dev machine runs Node 24). Node 12 will NOT work.
- Type-check directly with: `node node_modules/typescript/bin/tsc --noEmit`
  Build directly with: `node node_modules/vite/bin/vite.js build`
  (the `tsc`/`vite` shims sometimes fail on this Windows shell — call via `node` directly).
- **Install gotcha**: better-sqlite3 has no Node 24 prebuild + no VS Build Tools here.
  Install with `npm install --ignore-scripts`, then `npx electron-rebuild -f -w better-sqlite3`
  (pulls Electron's prebuilt binary). If Electron itself won't launch
  ("Electron failed to install correctly"), run `npm rebuild electron --foreground-scripts`.
- **Installer gotcha**: `electron-builder` needs Windows **Developer Mode ON** (or run as admin)
  to extract the winCodeSign toolkit's macOS symlinks. `build:unpacked` sidesteps this.
- Product name "Finance Dashboard"; installer → `release/Finance Dashboard-Setup-<ver>.exe`.

## Architecture
- `electron/main.ts` — app entry. Pins userData to `%AppData%\Finance Dashboard` via
  `app.setPath` (so renames don't orphan the DB); one-time migration copies an old
  `Kevin's Finance Application` DB if present.
- `electron/preload.ts` — exposes `window.api.*` (contextBridge). Namespaces:
  `settings, categories, bills, goals, paychecks, debts, expenseCategories, expenses,
  dashboard, reports, calendar, db`.
- `electron/ipc/handlers.ts` — registers `ipcMain.handle` for every channel.
- `electron/db/index.ts` — opens SQLite (WAL, FK on), runs migrations.
- `electron/db/migrations.ts` — versioned migrations, applied ascending, recorded in
  `_migrations`. Settings seeded each launch (`INSERT OR IGNORE`).
- `electron/db/repo.ts` — ALL data logic + computed projections.
- `shared/types.ts` + `shared/ipc.ts` — types & channel-name constants shared by main+renderer.
- `src/` — renderer. `pages/` = one file per screen; `components/` (Layout, Sidebar, TopBar,
  ThemeToggle, ui/{Modal,ConfirmDialog,EmptyState}); `lib/` (theme, accents, format, utils,
  debtMath, celebration).
- IPC pattern: add channel to `shared/ipc.ts` → repo fn → `handlers.ts` → `preload.ts` → use
  `window.api.x.y()` in a page. Keep this 4-file rhythm.

## Data model (migrations v1–v7)
- **v1**: `settings(key,value)`, `categories`, `bills`, `savings_goals`, `paychecks`,
  `paycheck_allocations`.
- **v2**: `savings_goals.archived_at`.
- **v3**: `expense_categories`, `expenses` (+ seeds 9 expense categories ONCE in the migration).
- **v4**: `debts`.
- **v5**: `expenses.debt_id` (CC charge link) + rebuilt `paycheck_allocations` to allow
  `kind='debt'`.
- **v6**: `debts.interest_day` + `debts.last_interest_applied` (auto-charge bookkeeping).
- **v7**: `debts.compounding` ('monthly'|'semi_annual'); existing mortgages set to semi_annual.

Key tables:
- `bills(name,amount,frequency[biweekly|monthly|semi_annual|yearly|custom_days],custom_days,
  anchor_date,category_id,autopay,notes,archived,created_at)`
- `paycheck_allocations(paycheck_id,kind[bill|goal|fun|other|debt],ref_id,amount,note)`
- `debts(name,type[credit_card|mortgage|car_loan|line_of_credit|loan],original_amount,
  current_balance,interest_rate,payment_amount,payment_frequency[weekly|biweekly|semi_monthly|
  monthly],split_count,interest_day,last_interest_applied,compounding,notes,archived,created_at)`
- `expenses(description,amount,date,category_id,note,debt_id,created_at)`

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
- **Payoff** (nav label deliberately NOT "Debt") — typed debt cards, payoff date/interest
  projections, progress bars, expandable "what if I paid more?" line chart (base vs +extra).
- **Expenses** — purchases ledger, own categories, filter/search, "spent this month" header,
  optional note. Defaults filter to current month.
- **Calendar** — month grid of bills due / paid / paychecks. Expenses NEVER appear here.
- **Reports** — toggle Overview (bills/savings charts) ↔ Expenses (Month/6mo/1yr/All-time:
  total, pie by category, over-time bar, top purchases; month views show a praise/reality-check
  comparison vs prior month).
- **Settings** — user name (→ sidebar + window title), theme (light/dark), accent color
  (7 options), next-paycheck date, DB backup/restore.

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
  (inside `listDebts()`) adds balance×APR/12 on/after that day, compounding per elapsed month,
  idempotent via `last_interest_applied`; never retro-charges.
- **Compounding** (`src/lib/debtMath.ts` `periodRate()`): semi_annual = Canadian fixed-mortgage
  convention `(1+APR/2)^(2/ppy)−1`; monthly = US/everything-else. Mortgages default semi_annual.
  All payoff math routes through `periodRate`.

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
  payments. Nothing else touches dashboard/paycheck/bill calc paths. Backup/restore copies the
  whole `finance.db`, so all sections ride along.
- **Kevin's working style**: design-first then iterate; prefers polished UI. Present the result,
  then take change requests.
