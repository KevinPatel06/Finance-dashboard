# Changelog

Changes to the phone apps (iOS `.ipa` and Android `.apk`), newest first. Each build is tagged
`build-<N>` and published as a GitHub release with the same notes. `N` is the Android
versionCode (the commit count), so it always goes up.

## Build 82 — November 20, 2026

Version 1.0.0

### Fixed
- **Pay history** now lets you fix a paycheck: tap it to change the amount, or remove it.
- A removed or missed payday no longer disappears for good. Pay history lists it as
  "Not confirmed" (with the amount you expected); tap it to enter what you got. Before, only
  paydays from the last two weeks asked again on the Budget screen.

## Build 80 — November 16, 2026

Version 1.0.0 · first build tracked in this changelog. Covers the Nov 12–16 changes.

### New
- **Leftover spending money.** When last month ends with money left to spend, a "Needs you"
  card offers to put it in a fund, or leave it in the bank.
- **Leftovers screen** (from More and the Saving tab): every finished month of the year, what was
  left and where it went, with a yearly total and a 12-month bar row. Undecided months can be
  settled there.
- **Revamped Budget home.** A Spending/Saving switch at the top, the gauge in its own card with a
  Breakdown link, and every to-do in one swipeable "Needs you" row.
- **Breakdown sheet** lists your income, then everything planned, biggest first.
- **Saving tab** shows one "put away" number with a bar split by fund and account, plus a
  "To deposit this month" list with Log buttons.
- **Log expense** has its own number pad (the keyboard stays down), Today / Yesterday / Pick a
  day chips, and suggested categories.

### Improved
- Edit plan opens on a "Left to assign" card with one stacked bar; each section folds to a
  single row.
- Category screen: one big "left" number, Spent / Per day / Resets, and expenses grouped by day.
- Expenses calendar uses steady green shades, shortens $1,000+ to `$1.5k`, and shows the picked
  day's expenses (with notes) under the calendar. Upcoming is now a third tab.
- Easier to read: stronger text contrast and bigger tap targets.

### Fixed
- The pace chip no longer wraps beside Edit plan.
- In Edit plan, the minus sign stays on the same line as the amount.
- Category names fit in Log expense's suggestions.
- Saving shows deposit amounts in whole dollars.
- The Leftovers subtitle for an undecided month no longer gets cut off.
