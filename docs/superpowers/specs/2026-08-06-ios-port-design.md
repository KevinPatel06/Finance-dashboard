# iOS Port — Design

**Date:** 2026-08-06
**Status:** Approved for planning
**Author:** Kevin + Claude

## Goal

Ship an iOS build of Finance Dashboard with **full feature parity** to the Windows
desktop app, living on the **same branch** as the desktop app, such that a change to
business logic or UI is written **once** and lands in both.

Secondarily: leave the door open for automatic device-to-device data sync without
building it now.

## Constraints

- **No Mac, no paid Apple Developer account.** All building happens on GitHub Actions
  macOS runners (free for public repos — the repo has been made public for this).
- **Distribution is LiveContainer.** Unsigned `.ipa` is fine. No App Store review, so no
  compliance constraints on design. No 3-app sideload limit, no per-app re-signing.
- **No JIT for the guest app.** Irrelevant here: `WKWebView` gets its JavaScript JIT from
  the system WebContent process regardless of the host app's entitlements, so a
  WebView-based app runs at full speed under LiveContainer.
- Single developer, single user, single device pair (one Windows PC, one iPhone).

## Codebase audit (the facts this design rests on)

Measured 2026-08-06 at commit `9123c45`.

| Area | LOC | Note |
|---|---|---|
| `src/` (React UI, 11 page files / 10 nav destinations) | ~6,800 | Reusable as-is under a WebView |
| `electron/db/repo.ts` | 1,390 | All business logic |
| `electron/` (rest: main, preload, handlers, migrations, notifications) | ~810 | Platform shell |
| `shared/` (types, ipc, debtMath) | 445 | Already platform-neutral |
| **Total** | **9,461** | |

Two findings drive the whole design:

**1. `repo.ts` is already platform-agnostic.** Its only imports are `getDb` from
`./index`, types from `shared/types`, and `periodRate` from `shared/debtMath`. It never
touches Electron. Only `electron/db/index.ts` calls `app.getPath()`.

**2. The database driver surface actually used is tiny.** Across `repo.ts` and
`migrations.ts`, the complete set is:

```
db.prepare(sql).all(...args)   // 27 call sites
db.prepare(sql).get(...args)   // 40 call sites
db.prepare(sql).run(...args)   // 44 call sites → { changes, lastInsertRowid }
db.exec(sql)
db.transaction(fn)             // 6 call sites
```

All binding is **positional `?`**. No named parameters (`@name` / `:name`), no
object-form binding. `db.pragma()` appears only in `electron/db/index.ts`, which stays
platform-specific regardless.

## Approach

### Chosen: Capacitor

Capacitor hosts the existing React app in a `WKWebView` inside a real `.ipa`, with
native plugins for filesystem, local notifications, and app lifecycle.

**Why:** it is the only option where "fix the logic once" is literally true rather than
aspirational. `src/` is shared verbatim. Everything the app already uses survives the
move: Recharts is SVG, Tailwind is CSS, `HashRouter` is exactly what a WebView wants,
and `date-fns` / `lucide-react` / `canvas-confetti` are pure JS.

### Rejected: React Native / Expo

Better native scroll and gesture feel, but full parity means rewriting ~6,800 LOC across
11 pages. Recharts has no RN equivalent (`victory-native` instead), Tailwind becomes
NativeWind with different semantics, the CSS-variable theming and runtime accent system
get rebuilt, and `Modal` / focus-trap / confetti all get replaced. Afterward there are
**two** UIs to maintain and every future feature is built twice — directly contrary to
the stated goal.

### Rejected: PWA / Add to Home Screen

Least work, but iOS can evict a PWA's storage under memory pressure. Silently losing a
finance database is not an acceptable failure mode. Also does not produce an `.ipa`.

## Decision: sql.js (WASM, synchronous) for iOS storage

Given the driver surface above, `better-sqlite3` satisfies the target interface
**structurally, with no runtime adapter code** — so the desktop code path is literally
untouched and cannot regress. (At the type level, one narrow assertion may be needed at
the `setDb()` boundary, because better-sqlite3's `Statement` is generic over its bind
parameters and `transaction()` returns a `Transaction<F>` rather than a bare `F`. That is
a compile-time detail; no values are wrapped or converted at runtime.) The iOS side gets
a ~100-line synchronous shim over sql.js.

**Alternative considered:** `@capacitor-community/sqlite` (native, on-disk, WAL, proper
durability). Rejected because its API is async, which would force all 111 statement call
sites and 6 transactions in `repo.ts` to convert to `async`/`await`. That conversion is
invisible to the UI (`window.api.*` already returns Promises) and to `ipcMain.handle`,
so it is *contained* — but it is a large mechanical diff on the most business-critical
file in the project, and `better-sqlite3`'s synchronous `db.transaction()` has no async
equivalent, so transaction handling would be rewritten too. The durability benefit does
not justify that risk at this data size.

**Escape hatch:** because everything goes through the `DB` interface, switching to the
native async driver later means replacing the adapter and making `repo.ts` async. The
interface is what makes that a contained change instead of a rewrite.

### sql.js shim specifics

- `initSqlJs()` is async, but only once at app boot — not per query. Queries stay sync.
- `run()` returns `{ changes: db.getRowsModified(), lastInsertRowid: <SELECT last_insert_rowid()> }`.
  sql.js has no direct `lastInsertRowid` accessor; the extra query per insert is negligible.
- `transaction(fn)` wraps `BEGIN` / `COMMIT` / `ROLLBACK`. Synchronous, matching
  `better-sqlite3` semantics including nested-transaction behaviour relied on by
  `materializeRecurringExpenses()`.
- `journal_mode = WAL` is meaningless for an in-memory DB and is skipped on iOS.
  `foreign_keys = ON` is issued as `db.run('PRAGMA foreign_keys = ON')`.

### Durability

The DB lives in memory and is flushed via `db.export()` to Capacitor Filesystem:

- after every mutating call,
- on Capacitor `appStateChange` (backgrounding),
- with one rotated `finance.db.bak`.

"Mutating" is not inferred at runtime — each entry in `core/apiMap.ts` carries a
`mutates: boolean` flag, and the iOS shim flushes after any call whose entry is marked.
This reuses the table that already exists for API dispatch rather than adding a second
source of truth.

Writes are user-initiated and infrequent, and the file is well under a megabyte even
after years of use.

## Architecture

```
core/                    NEW — platform-neutral
  db.ts                  DB/Stmt interface + setDb()/getDb()      (~40 lines)
  repo.ts                MOVED from electron/db/ — 1 import line changes
  migrations.ts          MOVED from electron/db/ — typed against DB
  apiMap.ts              NEW — channel → repo function table
  notifications.ts       NEW — buildNotes(), extracted from electron/notifications.ts

shared/                  unchanged — types.ts, ipc.ts, debtMath.ts

src/                     React UI — SHARED BY BOTH TARGETS
  platform/ios/db.ts     sql.js adapter + persistence
  platform/ios/api.ts    in-process window.api shim
  platform/ios/notify.ts @capacitor/local-notifications delivery

electron/                desktop shell
  db/index.ts            keeps initDatabase(); adds setDb(new Database(path))
  ipc/handlers.ts        becomes a loop over core/apiMap.ts
  notifications.ts       delivery only; scheduling logic moved to core/

ios/                     Capacitor Xcode project (generated by `npx cap add ios`)
.github/workflows/ios.yml
```

### The DB seam

```ts
// core/db.ts
export interface Stmt {
  all<T = unknown>(...params: unknown[]): T[];
  get<T = unknown>(...params: unknown[]): T | undefined;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
}
export interface DB {
  prepare(sql: string): Stmt;
  exec(sql: string): void;
  transaction<F extends (...args: any[]) => any>(fn: F): F;
}
```

Signatures deliberately mirror `better-sqlite3`'s so it satisfies the interface without
an adapter.

`core/repo.ts` is a **pure move**: the only diff is
`import { getDb } from './index'` → `import { getDb } from './db'`.

### Eliminating the third API enumeration

Today a new feature touches four files: `shared/ipc.ts` → `repo.ts` → `handlers.ts` →
`preload.ts`. iOS needs `window.api` too, and naively that means a **fifth** file listing
every channel — three separate places to forget.

Instead, `core/apiMap.ts` holds one channel → repo-function table. Then:

- `electron/ipc/handlers.ts` becomes a loop registering `ipcMain.handle` over it.
- `src/platform/ios/api.ts` becomes a loop building `window.api` in-process from the same
  table, wrapping returns in `Promise.resolve()`.

The 4-file rhythm stays 4 files, and **iOS support comes free with every future feature**.
No page changes: they keep calling `window.api.bills.list()` and cannot tell the
difference between an IPC round-trip and a direct call.

## UI shell

Charts are already fluid — `ResponsiveContainer` is used throughout `Payoff.tsx` (3
instances) and `Reports.tsx` (11). Only **two** files use `<table>`: `Bills.tsx` and
`Expenses.tsx`. So the responsive work is contained.

- **Navigation.** 10 destinations won't fit a tab bar. Below `md`, `Sidebar.tsx` renders
  as a bottom tab bar with Dashboard, Paychecks, Expenses, Bills, plus a **More** sheet
  holding Goals, Registered, Payoff, Calendar, Reports, Settings. At `md` and above the
  sidebar renders exactly as today — **the desktop app is visually unchanged.**
- **Tables → cards.** `Bills` and `Expenses` get a card-list rendering under `md`. Same
  data, same handlers, different layout only.
- **`Modal.tsx`** becomes a bottom sheet on narrow screens. Its existing focus trap and
  autofocus carry over unchanged.
- **`PaycheckWizard`** needs the least work of any page — already a step-at-a-time flow,
  which is the correct phone pattern.
- **iOS hygiene:** `viewport-fit=cover` plus `env(safe-area-inset-*)` padding; inputs at
  `font-size: 16px` (below that, iOS zooms on focus); 44px minimum tap targets; disabled
  body overscroll bounce and text selection on chrome.

## Notifications

`electron/notifications.ts` already splits cleanly: `buildNotes()` computes *what should
fire today* (portable), `fire()` delivers (platform-specific).

- `buildNotes()` → `core/notifications.ts`.
- Delivery adapters: Electron `Notification` on desktop, `@capacitor/local-notifications`
  on iOS.
- The four `notify_*` settings and the `last_notified_date` once-per-day dedup key work
  unchanged on both platforms.

## Backup / restore — and interim sync

The `db` and `files` preload namespaces map to Capacitor Filesystem plus the iOS Share
sheet. Export writes `finance.db` out; import replaces it.

Because both platforms use an identical schema and the same migration chain, **a file
exported on Windows restores on the phone and vice versa.** That is a working manual sync
from day one — AirDrop or iCloud Drive the file. Not automatic, but real, zero
infrastructure, and it falls out of work being done anyway.

## Build pipeline

`.github/workflows/ios.yml`, on `macos-latest`:

```yaml
npm ci
npm run build:web          # tsc -b && vite build → dist/
npx cap sync ios
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -sdk iphoneos \
  -archivePath build/App.xcarchive archive \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
mkdir -p Payload
cp -R build/App.xcarchive/Products/Applications/App.app Payload/
zip -qry FinanceDashboard.ipa Payload
```

Uploaded as a workflow artifact and attached to a GitHub Release, so the `.ipa` can be
pulled to the phone and dropped into LiveContainer.

Note: `npm run build` currently ends in `electron-builder`. A new `build:web` script
(`tsc -b && vite build`) is added to `package.json` so the iOS job does not attempt a
Windows installer build. The existing `build` script is refactored to
`npm run build:web && electron-builder`, keeping desktop behaviour identical.

## Sync groundwork (migration v11) — in scope

Sync itself is **not** being built. The one thing done now to keep it plausible:

**v11 is pure DDL plus triggers. It changes zero lines of `repo.ts`.** This constraint is
what keeps it cheap, and the design is shaped around it:

- `uuid TEXT NOT NULL DEFAULT (lower(hex(randomblob(16))))` on every data table. SQLite
  has no `uuid()` builtin, but a column `DEFAULT` expression covers all future inserts
  with no application-code change; existing rows are backfilled by a one-time `UPDATE`
  inside the migration.
- `updated_at INTEGER` on every data table, maintained by `AFTER INSERT` and
  `AFTER UPDATE` triggers rather than by application code.
- A single `_deletions(table_name, uuid, deleted_at)` table populated by `AFTER DELETE`
  triggers. **Deletes stay hard.** This is deliberate: adding a `deleted_at` tombstone
  column to each table would mean converting every delete to a soft delete and adding
  `WHERE deleted_at IS NULL` to essentially every `SELECT` in `repo.ts` — a large,
  risky change to query semantics for a feature that does not exist yet. A trigger-fed
  audit table records exactly the same information for a future sync while leaving all
  existing queries untouched.

**Why now:** every table keys on `INTEGER PRIMARY KEY AUTOINCREMENT`. Two devices each
creating a bill will both call it `id=7`. Any future sync must reconcile that across
*existing historical rows*, which is painful retrofit work. Adding UUIDs while there is
still one device and one database is roughly an hour. Deletion records matter for the
same reason: without them, a deleted bill resurrects on the next sync.

That is the entire investment — no backend, no network code, no conflict resolution, no
`_sync_state` table until there is something to track. When sync is wanted later, the
realistic options are a Cloudflare Worker + D1, or Supabase, with last-write-wins per
row. Both require exactly these columns.

## Phasing

**Phase 0 — LiveContainer spike (de-risking, do first).**
Capacitor serves the app over a `capacitor://localhost` custom scheme handler. This
design does not assume that behaves under LiveContainer's guest-app model. Build a
hello-world Capacitor app, run it through Actions, load it in LiveContainer, and confirm
it renders and can write a file via Capacitor Filesystem. Roughly a day, and it validates
the entire approach before any refactoring.

**Phase 1 — Extract `core/` + the DB seam.** Desktop stays green throughout. Committed as
its own atomic, trivially revertible step.

**Phase 2 — sql.js adapter + iOS `window.api` shim.** App boots on device with real data.

**Phase 3 — Responsive shell.** Tab bar, card lists, bottom-sheet modals, safe areas.

**Phase 4 — Notifications + backup/restore.**

**Phase 5 — Migration v11 (sync groundwork).**

## Risks

**Phase 0 could fail.** If Capacitor's custom scheme handler does not work under
LiveContainer, the fallback is serving from `file://` (a documented Capacitor option,
with some CORS friction) or reconsidering the approach. Learning this on day one is the
point of Phase 0.

**`core/` extraction touches the working app.** It is a file move plus one import line,
and the desktop path keeps `better-sqlite3` exactly as-is — but it is still surgery on
`repo.ts`. Mitigated by committing it atomically and by the fact that the desktop's
runtime behaviour is provably unchanged (same driver, same sync semantics).

**In-memory DB durability.** Mitigated by flush-on-every-mutation, flush-on-background,
and a rotated backup. Accepted given data size and write frequency.

## Success criteria

1. An unsigned `.ipa` builds on GitHub Actions and runs in LiveContainer.
2. All 10 nav destinations are reachable and functional on iPhone, including logging a
   paycheck through the full wizard.
3. `finance.db` exported from Windows restores on iOS with correct data, and vice versa.
4. The Windows app's behaviour and appearance are unchanged.
5. Adding a hypothetical new feature touches the same four files as before — no
   iOS-specific API enumeration.
