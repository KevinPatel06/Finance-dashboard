# Contributions (RRSP / TFSA / FHSA), the Saving gauge, and two phone fixes: design

Date: 2026-11-08 · Platforms: the phone app (iOS + Android, `src/phone/`) · Mockups:
[`2026-11-08-contributions-mockups/`](2026-11-08-contributions-mockups/). Open the HTML files in
a browser. Where they disagree, the later file wins: **3 overrides 2, and 2 overrides 1**. Each
section below says which screen it means.

This covers three pieces of work. Only the first is large:

1. **Contributions**: a second kind of savings next to funds. RRSP, TFSA and FHSA accounts with
   a yearly room, a goal and a deadline, optionally split into monthly budget lines, and real
   deposits logged by hand.
2. **Icon picker**: show five suggestions and a "See all", not the whole grid.
3. **Log expense sheet**: open at the top with the keyboard down.

---

## 1. Why

The Saving tab only knows *funds*. Money planned for a fund counts as saved the moment the month
is confirmed. That's fine for "Vacation", but wrong for a registered account. An RRSP deposit
only counts once it has actually reached the account at the bank. A registered account also runs
on a CRA year with a hard deadline and a room limit that funds don't have.

Kevin wants the app to:

- hold the **contribution room** for each registered account the user has, for the current year;
- let the user set **how much they want to put in by the deadline** and, if they choose, **split
  it across the months left**, taking it off the top of the budget like a fund;
- **not count it as contributed until the user logs the deposit**. The app is the nudge: the user
  sees a deposit is due, makes it at their bank, then confirms it in the app;
- show **what was deposited, and in which months**, so an extra deposit visibly lowers the
  months ahead;
- **prompt for the new year** when the account's year ends.

Success means someone with a TFSA can set it up in a minute, see each month what to move, and hit
their goal by Dec 31 without doing any division themselves.

## 2. Goals, non-goals, anti-goals

**Goals**
- **Everything about contributions is optional.** *(Kevin: "ensure that users still have the
  choice whether to contribute to an account or not, if they dont want to use any of the 3
  accounts then they dont need to set it up.")*
  - **Someone with no RRSP, TFSA or FHSA never has to touch this.** The setup step can be
    skipped. With no accounts:
    - the Saving gauge and button work on funds alone (the "Funds only" state in §4.5);
    - the deposit banner never shows;
    - nothing in the budget changes.
  - **Each account is opt-in.** "Budget it monthly" is a per-account choice; an account without
    it is only a place to track room and log deposits.
  - **The empty Contributions prompt doesn't nag** (§4.5): it can be dismissed for good.
- Contributions live in the Budget screen's Saving tab, above funds, with their own gauge, cards,
  account screen and deposit logging.
- Planned monthly contributions come off the top of the budget (like funds and debt payments) and
  appear in every place the budget adds up: the plan editor, "not assigned yet", the breakdown
  sheet, the AI export.
- The monthly amount recalculates from what has actually been deposited.
- First-time setup has a "Registered accounts" step, and the AI export includes the accounts.

**Non-goals**
- No tax maths. The app never works out RRSP room from income, never computes refunds, and never
  checks room against CRA. The user types their room in. The app suggests the next year's room
  only for TFSA and FHSA, where the rule is simple, and the user can always edit it.
- No investment tracking: no market value, holdings or growth. "Contributed" means deposits
  logged for this year, nothing else.
- No TFSA withdrawal tracking. The new-year prompt reminds the user to add withdrawals back by
  hand (§4.8).
- No new push notifications. The nudge is in-app (Budget banner, card states). This could be
  added later.
- No desktop redesign. The desktop Registered page keeps working on the same data (§7.5), but
  gets no new features.

**Anti-goals: these would make it a failure even if it technically works**
- A deposit that counts before the user logs it, or a confirmed month that counts as
  contributed. That breaks the core "go deposit it, then tell me" loop.
- A monthly amount the user has to calculate, or one that ignores an extra deposit.
- Text that crowds or wraps awkwardly on a phone. Kevin pushed back on exactly this twice ("goal$13,100"
  and the long gauge sub-line), so every new line of copy must fit on one line at 375pt width.
- Deleting an account and silently changing past months' budgets (§7.4).
- Showing emoji on the phone (see CLAUDE.md, "Icons, not emoji").

## 3. How the accounts work (CRA rules, as researched 2026-11-08)

| | RRSP | TFSA | FHSA |
|---|---|---|---|
| Yearly room | 18% of last year's earned income, max **$33,810 (2026)** / **$35,390 (2027)**, minus pension adjustment, plus unused room. Only CRA knows it; it's on the Notice of Assessment (NOA). | **$7,000 (2026)**. The 2027 limit isn't announced yet, so use the latest known ($7,000) and label it "expected". | **$8,000** a year, **$40,000** lifetime. Not indexed. |
| Unused room | Carries forward forever (already in the NOA number) | Carries forward forever. Withdrawals are added back the next Jan 1. | Only up to **$8,000** carries forward, so at most $16,000 in one year |
| Deadline | **60th day of the next year** (2026 tax year → **Mar 1, 2027**). If it falls on a weekend, the next Monday. Jan 1 to the deadline can count for either year. | None as such. The year is the calendar year (Dec 31). | **Dec 31**, no grace period |
| Over-contributing | 1%/month on the excess beyond a **$2,000** lifetime buffer | 1%/month on the excess | 1%/month on the excess |

These numbers live in one dependency-free module (e.g. `shared/registered.ts`): the limit per
year, the FHSA caps, and a `defaultDeadline(kind, taxYear)` function. Everything else reads from
it, so a new year's limits are a one-line change.

## 4. Behaviour

### 4.1 Accounts and years

- **One account per kind** (RRSP, TFSA, FHSA), because room is per person, not per bank. The phone
  only offers to add kinds the user doesn't have yet. *(My call.)* If the desktop has already
  created several of one kind, the phone shows them all; it just won't create a second.
- Each account has a **current year** with:
  - **room**, entered by the user;
  - **goal**: how much they want in by the deadline; it can be less than the room;
  - **deadline**: the date the **goal** is due. It defaults to the year's CRA end (§3). The user
    can move it earlier but never later. *(Kevin: "changing the deadline only changes when the
    goal is due.")*
  - **budget it monthly**: on or off.
- **The year itself is fixed by CRA, never by the deadline.** A year is identified by its tax
  year (2026), and its start and end come from `shared/registered.ts`:
  - **TFSA and FHSA:** Jan 1 – Dec 31.
  - **RRSP, tax year Y:** from the day after the previous RRSP year ended, up to the 60th day of
    Y+1. Both ends are moved to the following Monday when they fall on a weekend. 2026 runs from
    Mar 3, 2026 to Mar 1, 2027.
- **Contributed this year** = the sum of deposits dated inside the year. Deposits are assigned to
  a year by their date and nothing else. Changing the deadline never moves a deposit between
  years.
- When an account is added mid-year, the form has an **"Already put in for <year>"** field. It is
  saved as one opening deposit dated the year's start (mockup 1, screen 6; history shows it as
  "Already in when you set it up").

### 4.2 The monthly split

For a budget month *M* and an account that is budgeted monthly:

- **Months left from M** = the number of months from *M* onward whose **1st day falls before the
  deadline**. A deadline of Mar 1 means November to February (four months, not March). A deadline
  of Dec 31 means up to and including December.
- **Line for M** = max(0, goal − deposits dated before M's 1st) ÷ months left from M, rounded to
  the cent.
- **Extra and short deposits carry forward automatically.** In mockup 1, screen 4, August's $143
  shortfall raised September's line, and September's $333 extra lowered October's.
- **The budget line is stored like any other plan line** (new `budget_lines` kind, §6.1), so a
  month's plan stays fixed once confirmed:
  - **Draft months:** a contribution line follows the formula above. It refreshes whenever a
    deposit, the goal, the deadline or the switch changes. This stops once the user sets the
    amount themselves in the plan editor: a hand-set amount is left alone. The mechanism is the
    builder's choice.
  - **Confirmed months never change on their own.** The user can still edit the line in the plan
    editor (e.g. "I can only do $300 this month"), and the shortfall spreads over later months.
- **When budgeting starts:** if the current month is a draft, or there's no budget yet (setup),
  the first line goes in the current month. If the current month is already confirmed, it starts
  next month, and the months-left count starts there too. *(Agreed in conversation.)*
- **Goal reached** → the line is $0 and drops out of new drafts.
- **Deadline earlier than the year's end** (e.g. a TFSA goal due Jun 30): months after the
  deadline get no line. Deposits still count toward the year until its CRA end, and the card
  shows the goal as met or short, plus the room left. The new-year prompt still comes at the CRA
  end.
- **Draft copy** (`ensureBudgetMonth`): contribution lines are not copied from the previous
  month like other lines. They are computed fresh for each account that is budgeted and has an
  open year, and they skip archived accounts and accounts waiting for a new year.
- **Projection for future months** (account screen, "By month"): assume the current month's line
  gets deposited in full, or use what's already been deposited if that's more. Then spread the
  rest over the remaining months with the same formula.

### 4.3 Deposits

- **Logging a deposit is the only thing that changes "contributed".** Confirming a month does
  not. *(Kevin: "it should wait until the deposit is logged".)*
- **"I deposited it" sheet** (mockup 1, screen 5):
  - The amount is pre-filled with what's left of this month's line, and it can be changed.
  - Date defaults to today and can be changed. The deposit is assigned to a year by its date.
  - Optional note.
  - A line underneath previews the effect: "After this: $4,200 of $6,000. Dec–Feb stay at $600 a
    month."
- **The budget is untouched by a deposit.** The planned amount already came off the top.
- **Deposits can be logged at any time,** including for an account that isn't budgeted or is
  waiting for its new year.
- **Deposits can be deleted** from the account's history, the same way fund activity is.
- **Room warnings:**
  - If contributed > room, the card and the account screen say so, e.g. "You're $X over your
    room. CRA charges 1% a month on the excess". For an RRSP, mention the $2,000 buffer.
  - The add/edit form warns when the goal is above the room. It doesn't block saving.

### 4.4 Budget arithmetic

- Contribution lines come **off the top, like funds**:
  - `leftToAllocate` = income − recurring − debt − funds − **contributions** − spend.
  - `BudgetMonthView.planned` gets a `contribution` total, and `lines` gets `contribution`.
- **Spending breakdown sheet** ("How we got $X", mockup 1, screen 3): add a "− Contributions" row
  after "− Savings funds", and add RRSP/TFSA/FHSA contributions to the footnote of things that
  don't count as spending.
- **Plan editor / review** (`PlanEditor`, `PlanForm`): a "Contributions" section next to Funds
  and Debts, with each budgeted account's line editable. The "not assigned yet" banner's
  suggestion copy may mention contributions.
- **Contributions never touch** `fundBalance`, debts, `expense_budgets`, paycheck maths or the
  desktop dashboard. This matches the isolation note in CLAUDE.md.

### 4.5 The Saving tab (Budget screen)

**The gauge swaps with the tab.** The Budget screen's gauge sits above the Spending/Saving
control. Spending keeps today's "Left to spend" gauge and "safe to spend" button. **Saving shows
a savings gauge and button in the same spot**, using the same `Gauge` component (21 segments,
success tone). The banners above it stay as they are.

- **Saving gauge** (option **B**, mockup 2):
  - label "Put away in {Month}";
  - value = **put away** (`CountUp`);
  - sub "of {planned} savings plan".
  - *Planned* = this month's fund lines + contribution lines.
  - *Put away* = fund lines, counted only if the month is confirmed, plus deposits dated this
    month into any registered account.
  - Fraction = put away ÷ planned, capped at 1.
- **The button under it** (option **2**, "Who's still due", mockup 3) has two short lines and a
  chevron. It always fits on one line each:

  | State | Line 1 | Line 2 |
  |---|---|---|
  | Deposits still due | "$1,250 left to deposit" | the accounts still due: "RRSP and FHSA" / "RRSP, TFSA and FHSA" |
  | All deposited (all contribution lines met) | ✓ "All deposited" | "$2,950 put away in November" |
  | Funds only (no contribution lines) | "$750 into funds" | the fund names if two or fewer ("Emergency fund and Vacation"), else "3 funds" |
  | Draft month | "$2,950 planned" | "Counts once you confirm" |
  | Nothing planned for saving *(my call)* | "Nothing planned yet" | "Add a fund or an account" |

  "Left to deposit" = the sum over contribution lines of max(0, line − deposits to that account
  dated this month).
- **Tapping the button** opens the **"Saving in {Month}" sheet** (mockup 2, screen 3):
  - Funds rows, then a subtotal headed "Added when you confirmed".
  - Contribution rows ("$350 of $600", "✓ $600", "Due $0 of $1,000"), then a subtotal headed
    "Counted once deposited".
  - Total "Put away $1,700 of $2,950".
  - A footnote saying the planned amount already came off the top.
  - Colour dots are fine; emoji are not.
- **Below the control, Contributions come first**, then Funds:
  - **Contributions** section: title, plus "Add account" while a kind is missing.
    - **With no accounts**, show a small prompt card: "Have an RRSP, TFSA or FHSA? Add it to
      plan this year's contributions." It has **Add account** and **Not for me**.
      - "Not for me" hides the whole Contributions section (stored as a setting/meta key), and
        the Saving tab is then just funds.
      - A quiet "Add an RRSP, TFSA or FHSA" link stays at the very bottom of the Saving tab, so
        the user can opt in later. Adding an account clears the hidden flag.
      *(My call, made to honour "they dont need to set it up".)*
    - One **card per account, layout C** (mockup 2): avatar + kind + "2026 · by Dec 31, 2026" +
      chevron; then a **this-month panel**; then the year's bar (with % badge); then **three
      labelled columns: Contributed · Goal · Room left**.
    - This-month panel states:
      - **partial**: neutral, "$350 of $600 deposited", small bar and a "Log deposit" chip;
      - **nothing yet**: amber, "Deposit due · $0 of $1,000 deposited" and a "Log deposit" chip;
      - **met**: green, "✓ $600 deposited · November done";
      - **not budgeted**: no panel, the chip moves below the bar *(my call)*;
      - **waiting for a new year**: hourglass panel, mockup 1, screen 8.
  - **Funds** section: its title with "Add fund", then today's Active / In this budget / Completed
    filter and fund cards, unchanged. Today's "Total saved: $X" line moves next to the Funds title
    *(my call)*.
- **The More screen's "Registered accounts" entry is removed.** The Saving tab is their home now.
  The `/registered` route can go too, since the phone gets its own account screen.

### 4.6 The account screen (mockup 1, screen 4)

A pushed screen (e.g. `/account/:id`), in the style of `FundDetail`:

- **Hero card:**
  - large avatar;
  - "$3,950 of $6,000" and "2026 goal · by March 1, 2027";
  - bar, "$2,050 to go · 4 months left";
  - "Room for 2026" and "Room left" tiles;
  - "Log deposit" and "Edit" chips.
- **By month**: one row per month of the year, from the year's start (or the account's first
  deposit, if later) to the month the year ends. Months after an early deadline show deposits
  only.
  - **Past months:** what was deposited against that month's line, tagged "$X short" or "+$X
    extra". A month with no line shows just the deposits.
  - **This month:** highlighted, with progress.
  - **Future months:** the projection from §4.2, "$600 planned", greyed.
  - Caption: "Put in extra and the months ahead go down. Miss one and what's left spreads over
    the rest."
- **Contribution history**: every deposit, newest first, with delete.
- **Past years** *(my call)*: one row per closed year, e.g. "2026 · $6,000 of $6,000 goal".
- **⋯ menu**: Edit · Stop/Start budgeting monthly · Delete account (§7.4).

### 4.7 The add / edit form (mockup 1, screen 6)

A sheet with:

- **Kind:** RRSP / TFSA / FHSA. Only when adding, and only kinds not yet added.
- **Contribution room for {year}:** money. The hint changes by kind. RRSP: "Your 'RRSP deduction
  limit' on your Notice of Assessment or CRA My Account."
- **Already put in for {year}:** money, optional. Only when adding.
- **Goal by the deadline:** money, with a "Use all my room" shortcut.
- **Deadline:** a date. It defaults to the year's CRA end (§3), with a hint explaining it. It
  can't be later than the year's end, and the picker caps it there.
- **FHSA only, "I've reached the $40,000 lifetime limit":** a checkbox. *(Kevin: "it can be a
  checkbox the user clicks to say whether it is at the 40k cap or not".)* It starts ticked
  automatically once deposits logged in the app reach $40,000.
- **Budget it monthly:** a switch, with a live preview such as "$600 a month · Nov – Feb (4
  months)".

The account's colour and icon come from its kind, so there's no icon picker here:

| Kind | Colour | Icon |
|---|---|---|
| RRSP | `#6366f1` | 🏦 → Landmark |
| TFSA | `#10b981` | 🌱 → Sprout (**add to `icons.ts`**) |
| FHSA | `#f59e0b` | 🏠 → House |

The colours are the desktop's existing `KIND_META` colours. The stored `label` defaults to the
kind's short name.

### 4.8 When the year ends (mockup 1, screens 7–8)

A year **closes** on the first read after its **CRA end**, not the goal deadline. Do this
lazily, like
`applyPendingInterest`. Keep a record of the closed year (year label, room, goal, contributed,
deadline), then the account is **waiting for a new year**:

- no plan lines;
- deposits still log, and count toward the next year by date.

**TFSA and FHSA** prompt to start the next year straight away:

- **Budget banner:** "Start your 2027 TFSA year". It opens the **new-year sheet** (screen 7): a
  summary of the year just closed ("2026 done: you put in $7,000 of your $7,000 goal"), then the
  same fields as the add form, pre-filled:
  - **Room, TFSA** = max(0, last room − last contributed) + the new year's limit. Hint: "Took
    money out in 2026? Add it here, since CRA gives it back on Jan 1."
  - **Room, FHSA** = min($8,000, max(0, last room − last contributed)) + $8,000, also capped at
    $40,000 minus the lifetime deposits logged in the app. If "I've reached the $40,000 lifetime
    limit" is ticked, it suggests $0, says why, and offers the checkbox to untick. The checkbox
    also appears on the new-year sheet.
  - **Goal** = last year's goal, capped at the new room. **Deadline** = the default for the new
    year. **Budget it monthly** = last year's setting.
  - Buttons "Start 2027" and "Not now". "Not now" hides the banner until tomorrow, the same way
    a payday snooze works.
- If the new year is started after the current month is confirmed, its first line goes in **next**
  month (§4.2).

**RRSP** waits for the user's numbers. *(Kevin: "the rrsp will have to be set by the user so
whenever they get their numbers is when they can start, but they can still contribute to it
before receiving their numbers".)*

- A one-time Budget banner gives the summary: "Your 2026 RRSP year is done. You put in $6,000 of
  your $6,000 goal. Add your 2027 room when your Notice of Assessment arrives."
- The card then sits in **waiting** (screen 8):
  - "2027 · waiting for your room";
  - an hourglass panel;
  - "$500 in since Mar 2";
  - "Log deposit" and "Enter room" chips.
- **"Enter room"** opens the form for the new year. Deposits already made count as already put
  in automatically (shown as info, not a field). The monthly split then takes them off.

**Applies to all kinds:**

- **Edit:** the user can change the room, goal or deadline of the current year at any time.
- **Deadline moved to a date already passed:** no more lines this year. The year still closes at
  its CRA end.
- **An account left waiting through a whole year** (RRSP room never entered, TFSA left on "Not
  now"):
  - "Enter room" and "Start" always open the year that contains today.
  - The skipped year still gets a Past years row, holding whatever deposits fell inside it, with
    no goal.
  - The TFSA suggestion adds each skipped year's limit.
  - The FHSA suggestion carries forward at most $8,000, as CRA does.
  *(My call.)*

### 4.9 Budget home banner (mockup 1, screen 2)

- **When it shows:** the current month is confirmed and at least one contribution line isn't
  fully deposited yet.
- **Content:** a brand banner, "Deposit $1,250 this month", listing each account still due:
  "RRSP $250 · FHSA $1,000. It's already set aside in your plan. Log each one once it's in the
  account."
- **The "Log deposits" chip** switches the Budget screen to the Saving tab.
- **It goes away** once every line is met.
- **Order:** it sits alongside the existing banners (draft, payday, unassigned and so on), after
  the payday cards.

### 4.10 First-time setup and the AI export

- `SetupFlow` gets a **"registered" step between `funds` and `export`**: pay → recurring → debts
  → funds → **registered accounts** → export → plan → done (mockup 1, screen 9).
  - Title "Registered accounts", with the body copy from the mockup.
  - Added accounts are listed as tappable rows to edit or delete. A delete also drops the account
    from the plan draft, as in the other steps.
  - "Add an RRSP / TFSA / FHSA" rows appear for kinds not yet added.
  - The footer says "Skip for now" while there are none, else "Continue".
- **The plan step** includes the contribution lines (computed, editable) in the first month's
  plan.
- **AI export** (`shared/budgetExport.ts`): add a `## Registered accounts` table. Columns:
  account, year, room, goal, deadline, contributed so far, monthly plan (or "not budgeted").
  Planned contributions also come off the top in the `## Summary` maths, between debt payments
  and "Left for savings and spending" (renamed if needed). The function stays pure: the caller
  passes the accounts in.

## 5. Icon picker: five suggestions and "See all" (mockup 1, screen 10)

`EmojiField` is used by `CategoryEditor`, `FundEditor` and `RecurringEditor`, including inside
setup. It shows **six cells in one row: five suggestions plus a dashed "See all" cell**.

- **The suggestions** are, de-duplicated in this order: the current value; `suggestEmoji(name)`
  if the name matches a rule; then common picks for the context, until there are five.
  - Category: 🛒 🍔 🏠 🚗 🛍️
  - Fund: 🆘 ✈️ 🏠 🚗 🎁
  - Recurring: 📱 🌐 💡 📺 🛡️

  The field gains `name` and a `context` prop to do this. All of the context defaults are already
  in `PICKABLE`.
- **"See all"** expands today's full `PICKABLE` grid **in place**, with a "Show less" link.
- **No emoji are shown** (icons only, as now).
- The suggestions may change as the user types the name. A picked icon stays picked.

## 6. Log expense sheet: open at the top with the keyboard down (mockup 1, screen 11)

`ExpenseEditor` currently passes `autoFocus={!expense}` to the big `MoneyInput`, and `Sheet`
autofocuses the first input by default. Opening "Add manually instead", or editing a quick-add
draft, raises the keyboard and leaves the full-height sheet scrolled to the bottom.

**Wanted:**

- The sheet opens **scrolled to the top**, with **no field focused**.
- The amount shows the "$0.00" placeholder and a small "Tap to enter the amount" hint.
- Tapping any field brings the keyboard up as normal.
- Check this on iOS and Android: the scroll position is the real bug, not just the focus.

**Quick-add** (the "+" sheet's "coffee 5, gas 50" box) **keeps** autofocusing its text box,
because typing is its whole purpose. *(My call; Kevin's complaint was about the add-expense
form.)*

## 7. Data and code constraints

### 7.1 `budget_lines` needs a new kind

The current table has `CHECK (kind IN ('spend','fund','debt'))`, and SQLite can't alter a CHECK
constraint. So **migration v14 rebuilds `budget_lines`** with `'contribution'` added. The rebuild
must:

- keep every row, **including the v11 `uuid` and `updated_at` values**;
- recreate the index;
- re-run `addSyncTracking('budget_lines')`, because the triggers are lost with the old table;
- not record the rebuild's own rows as `_deletions` tombstones.

Add an upgrade test with `runMigrations(db, 13)` → seed → `runMigrations(db)` that proves the
rows, uuids and triggers survive.

`BudgetLineKind`, `PlanLineInput` and `BudgetMonthView` (`lines.contribution`,
`planned.contribution`) grow to match.

### 7.2 Storage

The builder decides the exact columns. It must hold:

- per account:
  - the current year's **tax year** (the start and end are derived from it, never stored as the
    deadline);
  - its room, goal, goal deadline and budgeting switch;
  - whether it's waiting for a new year;
  - for an FHSA, the "reached the $40,000 lifetime limit" flag;
- per closed year: tax year, room, goal, contributed and deadline;
- per draft contribution line: whether the user set it by hand (§4.2).

Requirements:

- **Existing `registered_accounts` rows keep working.** `contribution_room` stays the *current
  year's* room.
- Existing rows migrate to an open year with today's defaults and **budgeting off, no goal**.
- New tables get `addSyncTracking`.
- Positional `?` binding only.
- `core/db.ts` stays as it is.

### 7.3 IPC

New and changed channels follow the 4-file pattern: `shared/ipc.ts` → `core/repo.ts` →
`core/apiMap.ts` (with the correct `mutates` flag, so the phone flushes) → `electron/preload.ts`
and `src/platform/mobile/api.ts`. `test/apiMap.test.ts` enforces this.

### 7.4 Deleting

**Deleting an account (either app) archives it**: `archived = 1`, hidden everywhere.

- Its lines in **unconfirmed months from the current month on** are dropped.
- **Confirmed months keep theirs**, so past budgets don't change.

This mirrors how deleted funds are kept as `archived = 2` (CLAUDE.md). It changes the desktop's
current hard `DELETE` (§7.5). The deposits stay attached to the archived row.

### 7.5 Desktop

*(Kevin: "we can ignore the desktop app part.")* There's no desktop feature work and no
desktop-specific behaviour to design. The only requirements:

- `src/pages/Registered.tsx` still compiles and doesn't crash on the new data, including a
  waiting account;
- its Delete goes through the same repo function, so it archives as in §7.4;
- the desktop layout stays pixel-identical (CLAUDE.md responsive rule).

If the desktop's numbers look odd for a waiting account, that's acceptable.

### 7.6 Tests

Add these to `test/shared/repoContract.ts`, so both drivers run them:

- the split formula and the "1st before the deadline" month rule (Mar 1 and Dec 31 cases);
- recalculation after an extra or a short month;
- draft lines refresh, but hand-set and confirmed lines don't;
- start-month rules (confirmed vs draft current month);
- contributions in `leftToAllocate` and the gauge numbers (put away, left to deposit, who's due);
- deposit assignment by date, including deposits made while waiting;
- an early deadline: no lines after it, deposits still counting, and the year closing at its CRA
  end rather than the deadline;
- year close plus TFSA and FHSA suggestions, including the FHSA $8,000 carry-forward, the $40,000
  cap and the checkbox;
- a skipped year;
- RRSP waiting with no lines;
- archive keeps past months intact;
- the v14 upgrade.

Also add a test that `defaultDeadline` handles weekends and leap years: 2027 is Mar 1 (a Monday),
and 2028 is Feb 29.

### 7.7 Docs

Update `CLAUDE.md`: the data model v14, the Phone app section (the Saving tab, contributions,
setup steps), the icon picker, and the removed More entry.

## 8. What was decided, and by whom

**Kevin decided:**

- **Savings structure:** savings splits into Funds and Contributions, and contributions hold
  RRSP/TFSA/FHSA room for the year.
- **Monthly split:** opt-in, spread across the months until a deadline the user can change, with
  the user setting how much they want in by that deadline.
- **The deadline:** changing it only changes when the goal is due. The CRA year stays fixed.
- **FHSA lifetime cap:** a checkbox for "I've reached the $40,000 limit".
- **Desktop:** ignore it beyond keeping it working.
- **History and recalculation:** each account shows what was contributed and when, and extra
  deposits lower the months ahead.
- **Deposits:** contributions count **only when the deposit is logged**, and still come off the
  top like funds.
- **New year:** a prompt when the year ends. The RRSP waits for the user's own numbers, and
  deposits still count while it waits.
- **Saving tab:** shows the month's savings clearly, with gauge **B** ("Put away in {Month}"),
  button wording **2** ("who's still due") and contribution card **C** (three columns).
- **Setup:** a setup step for registered accounts, included in the AI export.
- **Icon picker:** five suggestions plus "See all".
- **Log expense:** opens at the top with the keyboard down.

**My calls (check these while reading):**

- One account per kind on the phone.
- Months count if their 1st is before the deadline.
- The "Already put in" field when adding.
- Budgeting started mid-month lands next month if the current month is confirmed.
- Delete = archive (so past months never change), on both apps, because it lives in the repo.
- A deadline can be moved earlier than the CRA year's end, but not later.
- An account left waiting through a whole year starts in the current year, and each skipped year
  gets a Past years row.
- The "Nothing planned yet" and not-budgeted card states.
- "Total saved" moves next to the Funds title.
- Past years list on the account screen.
- The context defaults for the icon picker.
- Quick-add keeps its autofocus.
- No push notifications.
- No TFSA withdrawal tracking.

**Left to the builder:**

- the exact schema for years and hand-set lines (within §7.2);
- how draft lines are refreshed;
- the route name for the account screen;
- the exact banner ordering;
- component structure (e.g. sharing the gauge-plus-button pattern between the tabs);
- animation details, following the existing motion rules in `index.css`.
