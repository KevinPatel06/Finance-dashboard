# iPhone Budget Redesign — Design

**Date:** 2026-10-22
**Status:** Approved (Kevin: "perfect plan … get started and develop it until you are finished")
**Author:** Kevin + Claude
**Branch:** `ios-port`

## Intent

Kevin wants the iPhone app to feel like **DaTrack** (App Store id6760328162): a calm,
monthly, zero-based budget with a "left to spend" gauge, emoji categories, funds, and
expenses logged in one short sentence — while keeping the parts of Finance Dashboard that
DaTrack doesn't have (debt payoff with Canadian compounding, registered accounts, the
theme/accent switcher). It is for Kevin and a few friends, some of whom are not good with
money, so the app has to *make* people look at their plan each month rather than run on
autopilot.

The reference material is ~40 screenshots of DaTrack (marketing shots, its onboarding,
budget/category/fund screens) plus its full App Store version history (1.1 → 2.9). We take
every non-AI idea that fits; we do not copy branding.

## Goals

1. A phone app built around a **monthly budget (1st → month-end)**, zero-based:
   `income − recurring − debt payments − fund contributions = spending money`, and spending
   money is split across **Needs** and **Wants** categories.
2. A **Budget** home screen: left-to-spend gauge, safe-to-spend per day, on-track status,
   Spending | Saving tabs, per-category cards, category detail pages.
3. **Funds** (renamed savings goals) with add money, withdraw, "paid from fund" expenses,
   and manual completion.
4. A **new-month review**: each month starts as a copy of last month's plan that the user
   must confirm (one tap if nothing changed). Fund contributions and debt payments apply
   only on confirmation.
5. A **payday check-in** replacing the Paycheck Wizard on the phone: "Did you get paid
   $1,200 today?" → Yes / Different amount / Not yet. Actual amounts adjust that month's
   income; a third paycheck is a **bonus** the user can direct to a fund or debt.
6. A **smart text box** ("coffee 5, gas 50 yesterday") that creates expenses with guessed
   categories, learning from the user's own history. No AI.
7. A new **onboarding**: intro → name → budget-period explainer → pay → recurring expenses
   → debts → funds → **export to Markdown for an AI of the user's choice** → allocate →
   done.
8. An **Expenses** tab: month total vs last month, calendar of daily totals (amount / emoji
   / upcoming-recurring modes), category donut + list, weekly report.
9. Reminders: daily "log today's expenses", new month, weekly report.
10. DaTrack's look and feel (pastel emoji circles, hatched progress tracks with a % badge,
    segmented gauge, floating tab bar with a separate + button) on top of **our** theme
    tokens and accent picker. **Default theme: light.**

## Non-goals

- Any AI/LLM inside the app (chat, receipt scanning, "Suggest"). The export hands data to
  the user's own AI instead.
- Home-screen widgets, Shortcuts, share extensions — LiveContainer cannot run app
  extensions.
- Excel import, translations, a paid tier, custom currency formats (CAD, `en-CA` stays).
- Changing the **Windows** app's screens. Desktop keeps its layout pixel-for-pixel.
- Device sync (still manual backup/restore of one `finance.db`).

## Anti-goals (would be failure even if it "works")

- A budget that silently rolls over or moves money into funds without the user saying so.
- Recurring bills counting twice — once off the top and again against a spending category.
- Breaking the desktop app or the shared database (both platforms share one schema).
- A setup flow that asks things we never use (age, "first time budgeting?").
- Losing existing data: Kevin's goals, expenses, debts, budgets and bills must carry over.

## Constraints (from the codebase)

- `core/` is platform-neutral and identical on both platforms; the iOS app uses sql.js
  with **positional `?` binding only** and a tiny `DB` interface (`core/db.ts`).
- Every repo-backed channel goes through `shared/ipc.ts` → `core/repo.ts` →
  `core/apiMap.ts` (with a `mutates` flag that drives the iOS flush) → `electron/preload.ts`
  **and** `src/platform/ios/api.ts`. `test/apiMap.test.ts` enforces coverage.
- `test/shared/repoContract.ts` runs against node:sqlite AND sql.js; both must pass.
- Bundled libraries go in `devDependencies`. No new runtime dependencies are needed.
- iOS flushes must stay serialised (`storage.ts`) — untouched by this work.

## Decisions Kevin made

| Topic | Decision |
|---|---|
| Budget period | Calendar month, 1st → month-end (as the app already counts). |
| Monthly income | "How much you get paid in a normal month": per-paycheck amount × the paychecks every month is guaranteed (weekly 4, biweekly 2, twice-a-month 2, monthly 1). |
| Third paycheck | A bonus; logged by confirming that payday; user can send it to a fund/debt. |
| Split model | Zero-based (income − recurring − debt − funds → Needs/Wants). |
| Spending | Only everyday (non-recurring) expenses lower "left to spend". |
| Funds | Goals are renamed funds; completion is the user's choice (manual). Expenses can be "paid from fund" (comes out of the fund, not the budget). |
| Monthly confirmation | New month = copy of last month's plan, user reviews and confirms (one tap if unchanged); editable any time. Contributions apply only on confirm. |
| Paydays | Check-in (Yes / Different amount / Not yet); Paycheck Wizard retired on the phone; history kept. |
| Logging | Smart text box, rules only. |
| Setup | intro → name → period explainer → pay → recurring → debts → funds → export → allocate. No age/experience questions, no "log your first expense". |
| Export | Markdown (one file: a ready-written question + tables), shared via the share sheet or copied. |
| Look | DaTrack-like, but keep our theme switcher/accents; default light. |
| Notifications | Built now, tested on the phone later. |
| Bills vs recurring | Merge into one "Recurring" list on the phone; each item logs itself as an expense on its date (Kevin accepted). |
| Desktop | Stays as it is (Kevin accepted). |

## Architecture

### Phone shell vs desktop shell

`App.tsx` branches once on `useIsMobile()` (the existing `md` breakpoint hook):

- **Desktop** (≥ md): today's `<Routes>` + `Layout` + `Welcome`, unchanged.
- **Phone** (< md): a new `PhoneApp` with its own routes, its own `PhoneLayout`
  (floating 3-tab bar + separate **+** button) and its own onboarding.

Branching on width (not `__PLATFORM__`) keeps the existing convention and lets the phone UI
be exercised in a narrow desktop window. New phone code lives in `src/phone/`:

```
src/phone/
  PhoneApp.tsx            routes + gates (onboarding, month review)
  PhoneLayout.tsx         scroll container, tab bar, + button, quick-add sheet host
  ui/                     visual primitives: EmojiAvatar, HatchedBar, Gauge, Sheet,
                          BigButton, Stat, Banner, etc.
  onboarding/             intro, name, period, pay, recurring, debts, funds, export,
                          allocate, done (each step a small component)
  budget/                 BudgetScreen, SpendingTab, SavingTab, CategoryDetail,
                          PlanEditor (also the new-month review), PaydayCard
  funds/                  FundDetail, FundEditor, AddMoney/Withdraw sheets
  expenses/               ExpensesScreen, MonthCalendar, CategoryDonut, DaySheet,
                          ExpenseEditor, QuickAdd, WeeklyReport
  recurring/              RecurringScreen, RecurringEditor
  more/                   MoreScreen (links to Recurring, Payoff, Registered, Reports,
                          Pay history, Settings)
```

Payoff, Registered, Reports and Settings are the **existing pages** (they already have phone
treatments) mounted inside `PhoneLayout`. Bills, Paychecks/Wizard, Calendar and the old
phone dashboard are not reachable on the phone. `MobileDashboard` and the home-layout
setting become dead and are removed from the UI (the settings key stays harmless).

### Pure modules (in `shared/`, unit-tested, no DB)

- `shared/emoji.ts` — `suggestEmoji(name)`, `suggestKind(name)` ('need'|'want'): keyword
  tables (rent/housing 🏠, groceries 🛒, gas ⛽, transport 🚌, dining/eating out 🍔,
  coffee ☕, phone 📱, internet 🌐, hydro/utilities 💡, insurance 🛡️, health/meds 💊,
  fitness/gym 🧘, shopping 🛍️, entertainment 🎬, travel ✈️, gifts 🎁, personal care 💆,
  subscriptions/streaming 📺, pets 🐶, education 📚, …; fallback 📦/💰).
- `shared/paydays.ts` — payday enumeration and month income:
  `paydaysInMonth(anchor, frequency, month)`, `guaranteedPerMonth(frequency)`,
  regular-vs-bonus classification. Frequencies: `weekly | biweekly | semi_monthly |
  monthly`. Weekly/biweekly step 7/14 days from the anchor (forwards and backwards);
  monthly uses the anchor's day-of-month (clamped); semi-monthly is the **15th and the
  last day of the month** *(my call — the common Canadian schedule)*. In a month with more
  paydays than guaranteed, the **last** ones are bonuses.
- `shared/quickAdd.ts` — the smart-text parser (below).
- `shared/budgetExport.ts` — builds the Markdown export (below).
- `shared/recurrence.ts` — occurrence stepping for recurring templates with an interval.

### Data model — migration v13 (`budget_redesign`)

All additive except where noted. Every new table joins `SYNC_TRACKED_TABLES` treatment
(uuid / updated_at / tombstone triggers) inside v13 so the v11 sync groundwork holds.

1. `expense_categories` + `emoji TEXT`, `kind TEXT NOT NULL DEFAULT 'want' CHECK (kind IN
   ('need','want'))`, `sort_order INTEGER`. Backfilled from names via `shared/emoji.ts`.
2. `savings_goals` (funds) + `emoji TEXT` (backfilled from name).
3. `expenses` + `fund_id INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL`
   ("paid from fund") and `recurring_id INTEGER REFERENCES recurring_expenses(id) ON
   DELETE SET NULL` (set by materialisation). Backfill: expenses with `note = 'Recurring'`
   get the id of the template with the same description and amount.
4. `recurring_expenses` + `interval_count INTEGER NOT NULL DEFAULT 1` ("every N
   weeks/months/years"; semi-annual = monthly × 6), `emoji TEXT`. Pausing uses the
   existing `archived` flag.
5. `paychecks` + `payday TEXT` — the scheduled payday a check-in fulfils (NULL for legacy
   or ad-hoc paychecks).
6. New `budget_months(month TEXT PRIMARY KEY /* 'YYYY-MM' */, confirmed_at TEXT,
   created_at TEXT DEFAULT CURRENT_TIMESTAMP)`.
7. New `budget_lines(id, month TEXT NOT NULL REFERENCES budget_months(month) ON DELETE
   CASCADE, kind TEXT CHECK (kind IN ('spend','fund','debt')), ref_id INTEGER NOT NULL,
   amount REAL NOT NULL CHECK (amount >= 0), UNIQUE(month, kind, ref_id))`.
   `spend` → expense category, `fund` → savings goal, `debt` → debt.
8. New `fund_transactions(id, goal_id REFERENCES savings_goals(id) ON DELETE CASCADE,
   kind TEXT CHECK (kind IN ('deposit','withdrawal')), amount REAL CHECK (amount > 0),
   date TEXT, note TEXT, created_at)` — manual money in/out from outside the budget.
9. Settings seeded: `pay_amount` (''), `pay_frequency` ('biweekly'),
   `notify_daily_log` ('true'), `notify_daily_time` ('19:00'), `notify_new_month`
   ('true'), `notify_weekly_report` ('true'). The `theme` seed changes `'dark'` →
   **`'light'`** (fresh installs only; existing databases keep their stored value).

**Fund balance** (derived, never stored):
`legacy paycheck goal allocations + Σ confirmed-month 'fund' lines + Σ deposits −
Σ withdrawals − Σ expenses paid from the fund`. `listGoals()` / `listArchivedGoals()`
return this as `current_amount`, so the desktop Goals page automatically shows the right
number too. A fund can go negative only if the user spends more from it than it holds; the
UI warns but allows it.

**Debt balance** stays stored. A `debt` line applies to `current_balance` when its month
is confirmed (balance −= amount, clamped at 0 like today), and editing a confirmed month's
debt line applies the delta. Reverting/un-confirming is not offered.

### Month math (`repo.budgetMonth(month)`)

For month `M`:

- **Paydays** = `paydaysInMonth(next_paycheck_date, pay_frequency, M)`, each regular or
  bonus, each matched to a confirmed paycheck (`paychecks.payday = date`).
- **Income** = Σ regular paydays (actual if confirmed else expected `pay_amount`)
  + Σ confirmed bonus paydays + Σ other paychecks dated in `M` with no `payday` (ad hoc).
- **Recurring (fixed)** = Σ occurrences in `M` of every active recurring template, listed
  individually (name, emoji, date, amount, logged yet?).
- **Planned** debt / fund / spend = Σ of the month's lines by kind.
- **Left to allocate** = income − recurring − debt − fund − spend. Shown in the plan
  editor; a banner on Budget when ≠ 0 ("$50 to trim" / "$1,200 unassigned").
- **Spent** (per category and total) = expenses dated in `M` with `recurring_id IS NULL`
  AND `fund_id IS NULL`.
- **Left to spend** = planned spend − spent. Needs and Wants each get their own left.
- **Safe per day** = max(0, left to spend) ÷ days remaining in `M` including today.
- **Status**: `over` if left < 0; `fast` if spent ÷ planned exceeds the elapsed fraction of
  the month by more than 10 points; else `on_track`. "Wants eating into Needs" when wants
  spent > wants planned while total left ≥ 0.
- **Unbudgeted categories**: categories with spending in `M` but no spend line appear in the
  list as "No budget".

Draft creation: `budgetMonth(M)` (a mutating read, like `listExpenses`) creates `M` as a
**draft** (unconfirmed) by copying the most recent earlier month's lines — skipping
archived funds, archived debts, and deleted categories. If there is **no** earlier month,
it returns `status: 'none'` and creates nothing (the UI shows "Set up your budget").

Mirroring: whenever spend lines of the **current** month change, they are mirrored into the
legacy `expense_budgets` table, so desktop budget bars and the "over budget" notification
keep agreeing with the phone *(my call)*.

### Payday check-in

- Budget screen shows a card for each **pending** payday: a regular or bonus payday dated
  today or earlier (within the last 14 days) with no confirmed paycheck.
- **Yes** → `confirmPayday(date, expected)`; **Different amount** → number field (0 allowed
  = "wasn't paid"); **Not yet** → hides the card until tomorrow (per-day dismissal kept in
  settings meta).
- `confirmPayday` inserts a `paychecks` row (`date = payday = date`, no allocations) and
  rolls `next_paycheck_date` forward to the next payday after today so the desktop and the
  payday notification stay correct.
- Confirming a **bonus** opens "Bonus paycheck! Where should it go?": pick a fund or debt
  (adds the amount to that month's line — applied immediately if the month is confirmed)
  or "Decide later" (stays as left to allocate).
- The plan editor's Income section lists the month's paydays with their status; tapping one
  edits/confirms it; a confirmed check-in can be undone (deletes that paycheck).

### Funds

- **Saving tab**: "Total saved", **Add fund**, filter (Active / Completed / All /
  In this budget), cards: emoji, name, hatched bar with % badge, "$a of $t",
  "by 15 Aug 2026" / "no deadline", "Goal reached" when ≥ 100%.
- **Fund detail**: emoji, "$a of $t", deadline, bar, "$x to go", "N months left",
  **+ Add money**, **− Withdraw**, "Planned this month: $y", activity log (monthly
  contributions, deposits, withdrawals, purchases paid from the fund, legacy paycheck
  allocations), menu: Edit, Mark complete / Restore, Delete.
- **Add money** has two sources: *From this month's budget* (raises this month's fund line
  → lowers left to allocate) or *From somewhere else* (a deposit; budget untouched).
  **Withdraw** records a withdrawal; the budget is untouched *(my call)*.
- Reaching 100% fires the existing confetti once; the user marks it complete. Completing
  shows "You saved $X · spent $Y from it". Completed funds aren't copied into new months.

### Expenses tab

- Header: month picker + view toggle (Calendar | Categories) + overflow (Export CSV, all
  expenses).
- "Total spent" for the month (all expenses, including recurring and fund-paid) with
  "↓25% vs September".
- **Calendar**: Mon-first grid; mode toggle **Amount** (compact `$1.5k`), **Emoji** (top
  category emoji of the day), **Upcoming** (recurring occurrences not yet logged). Tap a
  day → sheet listing that day's expenses with edit/delete.
- **Categories**: emoji donut + list (emoji, name, "N expenses", total, chevron →
  category detail).
- Below: weekly-report card ("Your weekly report is ready") and the month's expenses
  grouped by day.
- **Expense editor** (sheet): description, amount, date, category, optional note, **Paid
  from**: Budget / a fund / (charged to) a credit card. Fund and card are exclusive.

### Category detail

Title, emoji circle, **Budget / Spent / Next budget** (1st of next month), hatched bar with
% **left** badge, "$X left" / "$X over", "N days left", the month's expenses with
**+ Log expense** (pre-filled category), fixed recurring items in this category listed
separately ("taken off the top"), menu: **Edit budget** (this month's line), **Edit
category** (name, emoji, colour, Need/Want), **Delete**.

### Quick add (the + button)

A sheet with a text box ("Try “coffee 5, gas 50 yesterday”") and an **Add manually**
button. Typing shows live preview cards (✓, emoji, description, category · date, amount,
pencil to edit). **Confirm (n)** creates them. Parser rules (`shared/quickAdd.ts`):

- Items split on commas, semicolons, newlines and " and ".
- Amount: `$12`, `12`, `12.50`, `$1,234.56` (`12,50` is not supported). A token with `$`
  wins; otherwise the **last** standalone number is the amount (so "7-eleven 12" and
  "2 coffees 9" work); the rest is the description. No amount → the item is flagged and
  can't be confirmed until edited.
- Dates: `today`, `yesterday`, weekday names (most recent past occurrence, today if it
  matches), `N days ago`, `oct 3` / `3 oct`, `10/3` (month/day). A date word applies to its
  own item; with one item it applies to that item.
- Category: (1) the user's history — the most recent expense whose normalised description
  matches (whole phrase, then first word); (2) keyword table → a category the user has
  (by name, case-insensitive, with synonyms); (3) none → "Other" if it exists.
- Description is title-cased lightly ("coffee" → "Coffee").

### Recurring

List with **Active** and **Paused** sections: emoji, name, "Every month · 1st",
"Every week · Mon", "Every 6 months · next 15 Aug", amount; editor: name, amount,
category, every N weeks/months/years, next date, charged to card (optional), pause/resume.
Resuming jumps `last_generated` to the latest occurrence ≤ today so paused months aren't
back-filled. Existing users get an **Import from Bills** action in the setup's recurring
step: each active bill becomes a template whose first occurrence is its next due date on or
after today (no history generated). Bills themselves are untouched, so the desktop keeps
working *(my call — copy, don't move)*.

### Onboarding (phone)

Fresh install (`onboarded = false`):

1. **Intro** — two "tap to continue" screens adapted from DaTrack's pitch (no AI claims).
2. **Name** — "What should we call you?"
3. **Budget period** — "Your budget runs monthly, from the 1st to the end of the month. We
   plan with the paychecks every month is guaranteed to get; an extra one is a bonus." Shows
   "Your first budget: October 2026".
4. **Pay** — amount per paycheck, how often, next payday → "That's $2,400 a month to plan
   with."
5. **Recurring** — add rows (name, amount, how often, next date, category) with suggestion
   chips (Rent, Phone, Internet, Hydro, Insurance, Netflix, Spotify, Gym). Running total.
6. **Debts** — optional cards/loans: name, type, balance, APR, monthly payment, interest
   day; shows estimated interest per month (`periodRate`).
7. **Funds** — name, emoji (suggested), target, optional date.
8. **Get advice** — explains the export; **Share file** (iOS share sheet / desktop save
   dialog) and **Copy**; **Skip**.
9. **Plan** — "Set aside for savings" (funds), "Debt payments", "Set aside for spending"
   (Needs | Wants toggle over the seeded categories, + Add category), header "$X left to
   allocate", info card "Money left to budget".
10. **Done** — ring + Needs / Wants / Savings / Debt / Fixed / Remaining → "Go to my budget".
    Writes the month's lines and confirms it.

Existing install (`onboarded = true`) with no budget yet: the Budget tab shows **Set up
your budget**, which runs steps 3–10 with fields pre-filled from what exists (pay settings,
recurring templates, debts, funds, legacy `expense_budgets` as spend lines). Progress is
held in memory and written at the end (steps 5–7 write immediately, like DaTrack's "all
progress is saved").

### Export (Markdown)

`shared/budgetExport.ts` produces one `.md` file:

```
# My budget — help me plan it
(prompt: I live in Canada; I'm paid $1,200 every two weeks (≈$2,400/month planned with
2 paychecks). Here are my fixed costs, debts and savings goals. Suggest a monthly split:
how much to put toward each debt, each fund, and spending categories split into needs and
wants. Reply with a table I can copy: Category | Need/Want | Monthly amount. …)
## Income  (table)
## Recurring expenses (table: name, how often, amount, monthly equivalent)
## Debts (table: name, type, balance, APR, compounding, monthly payment, est. interest/month)
## Savings goals (table: name, target, saved, deadline, months left, needed/month)
## Spending categories I use (table: name, need/want, avg monthly spend last 3 months)
## Summary (income − fixed − minimum debt payments = available)
```

New **platform** channel `files:exportText(name, content)`: desktop opens a save dialog
filtered to `.md`; iOS writes to the cache dir and opens the share sheet (so it can go
straight into the ChatGPT/Claude/Gemini app). **Copy** uses `navigator.clipboard` with a
select-all textarea fallback.

### Weekly report

`repo.weeklyReport(weekStart)` (Mon–Sun): total, vs previous week (%), daily average, the
last 4 weeks' totals, biggest day, top categories with change vs previous week, fund
progress this week. "Insights" are sentences built from those numbers by templates
("Sunday was your biggest day at $84.70; groceries climbed to $89.80 from $46.80.").
Opened from the Expenses tab card; defaults to last full week.

### Reminders (iOS)

Settings → Notifications gains: **Daily log reminder** (time, default 7:00 PM), **New
month** (1st, 9:00 AM: "Time to plan November"), **Weekly report** (Monday 9:00 AM). These
are scheduled as **repeating** local notifications with fixed ids and rescheduled whenever
the settings change, so they fire with the app closed. The existing once-a-day computed
notes (bills, payday, over budget) are unchanged. Desktop ignores the new keys. Untested on
device until Kevin tries it.

### Look and feel

- Built on the existing tokens (`--surface*`, `--content*`, `--brand*`), so light/dark and
  all 7 accents work. Default theme for new installs: light.
- **EmojiAvatar**: emoji on a pastel circle derived from the item's colour (light:
  colour at ~22% over white; dark: ~28% over surface).
- **HatchedBar**: filled portion in the item's pastel colour, remaining portion as thin
  vertical hatch lines, a white rounded **% badge** at the fill edge; danger tint when
  over.
- **Gauge**: ~22 rounded segments on a 200° arc, filled proportional to left ÷ planned,
  coloured success / warning / danger by status; center label + big number.
- Large bold screen titles, generous 16–20px radii, white (light) / near-black (dark)
  cards, pill segmented controls, full-width bottom CTA buttons, sheets for editors.
- Floating pill tab bar (**Budget · Expenses · More**) with the **+** as a separate round
  button to its right, like DaTrack.

### Desktop impact (deliberately small)

- Schema grows (additive). Desktop repo functions keep their signatures; new optional
  fields are ignored by desktop pages.
- Desktop Goals show the correct fund balance (includes new contributions/deposits/
  withdrawals/fund-paid purchases).
- Desktop `expense_budgets` bars follow the phone's current-month plan (mirroring).
- Fresh desktop installs also start in light theme (shared seed).
- Payday check-ins create zero-allocation paychecks, which lower the desktop's "average
  savings per paycheck". Accepted.

## Delivery phases

1. **Data layer** — v13 migration, pure modules, repo functions, IPC/apiMap/preload/iOS
   api, contract + unit + migration tests. Desktop unaffected.
2. **Phone shell + visual primitives** — `PhoneApp`, `PhoneLayout`, tab bar, + button,
   primitives, theme default.
3. **Budget** — Budget screen, Spending/Saving tabs, category detail, plan editor,
   new-month review, payday check-in, bonus prompt.
4. **Funds** — fund detail, editor, add/withdraw, completion.
5. **Expenses** — Expenses tab, calendar modes, donut, day sheet, expense editor (fund /
   card), quick add, weekly report.
6. **Recurring + More** — recurring list/editor (pause, interval), More screen, Settings
   additions (pay, reminders), pay history.
7. **Onboarding + export** — new phone onboarding and "Set up your budget" for existing
   users; Markdown export + platform channel.
8. **Reminders** — iOS repeating notifications.
9. **Verification + docs** — full test suite, type-check, both builds, headless-browser
   screenshots of the phone UI at 390×844 in light and dark, CLAUDE.md update.

## Testing

- `repoContract` (both drivers): v13 shape and backfills; draft copy and confirm; fund
  balance from every source; spending excludes recurring and fund-paid; payday income
  (confirmed/different/bonus/ad hoc); debt line confirm and delta; recurring interval,
  pause/resume without back-fill, `recurring_id` set; `expense_budgets` mirroring; weekly
  report numbers; import from bills.
- Unit: `quickAdd` parser, `emoji`, `paydays`, `recurrence`, `budgetExport`.
- `test/migrationV13.test.ts`: upgrade from a v12 database with data.
- `test/apiMap.test.ts`: new `files:exportText` registered as a platform channel.
- Type-check, `vite build` for both targets.
- Visual: build the iOS bundle, serve it, drive headless Edge over the DevTools protocol at
  phone size, seed data through `window.api`, and screenshot each screen in light and dark.

## Builder's calls (settled during review, not asked)

- `budget_lines.ref_id` is polymorphic (no FK). Hard-deleting an expense category, a fund
  (`hardDeleteGoal`) or a debt also deletes the lines that reference it.
- The Budget tab always shows the **current** month. History lives in the Expenses tab
  (any month) and Reports; there is no past-month plan view.
- With no pay set (an existing user who never filled it in), income is just the paychecks
  logged that month and the Budget screen nudges to "Add your pay".
- "Not yet" on a payday card is remembered per payday as meta
  `payday_snooze:<payday>` = the date it was snoozed; the card returns the next day.
- A quick-add item with no matching category is saved uncategorised unless an "Other"
  category exists.
- A spend line of `0` is kept (it means "budgeted nothing"); deleting a line is a
  separate action that makes the category "No budget" again.

## Left to the builder

Exact copy, spacing, icon choices, animation, the emoji keyword lists, sorting defaults,
and how screens are split into components — guided by DaTrack's screenshots and the
existing design system.
