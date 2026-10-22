import type { DB } from './db';
import { suggestEmoji, suggestKind } from '../shared/emoji';

interface Migration {
  version: number;
  name: string;
  up: (db: DB) => void;
}

/** Tables that a future device-to-device sync would need to reconcile. */
const SYNC_TRACKED_TABLES = [
  'categories',
  'bills',
  'savings_goals',
  'paychecks',
  'paycheck_allocations',
  'expense_categories',
  'expenses',
  'debts',
  'expense_budgets',
  'recurring_expenses',
  'registered_accounts',
  'registered_contributions',
];

/**
 * Gives `table` the v11 sync columns (uuid, updated_at) and the triggers that
 * keep them filled and record hard deletes in _deletions. Idempotent.
 */
function addSyncTracking(db: DB, table: string) {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
    (c) => c.name
  );

  // SQLite requires a constant DEFAULT in ALTER TABLE ADD COLUMN, so the
  // columns are added bare and backfilled; future inserts are covered by
  // the AFTER INSERT trigger below rather than by a column default.
  if (!cols.includes('uuid')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN uuid TEXT`);
  }
  if (!cols.includes('updated_at')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at INTEGER`);
  }
  db.exec(`UPDATE ${table} SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL`);
  db.exec(
    `UPDATE ${table} SET updated_at = CAST(strftime('%s','now') AS INTEGER)
     WHERE updated_at IS NULL`
  );

  db.exec(`
    CREATE TRIGGER IF NOT EXISTS ${table}_sync_ins AFTER INSERT ON ${table}
    BEGIN
      UPDATE ${table}
         SET uuid = COALESCE(NEW.uuid, lower(hex(randomblob(16)))),
             updated_at = CAST(strftime('%s','now') AS INTEGER)
       WHERE rowid = NEW.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS ${table}_sync_upd AFTER UPDATE ON ${table}
    WHEN NEW.updated_at IS OLD.updated_at
    BEGIN
      UPDATE ${table}
         SET updated_at = CAST(strftime('%s','now') AS INTEGER)
       WHERE rowid = NEW.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS ${table}_sync_del AFTER DELETE ON ${table}
    BEGIN
      INSERT INTO _deletions (table_name, uuid, deleted_at)
      VALUES ('${table}', OLD.uuid, CAST(strftime('%s','now') AS INTEGER));
    END;
  `);
}

const migrations: Migration[] = [
  {
    version: 13,
    name: 'budget_redesign',
    up: (db) => {
      // The phone's monthly zero-based budget. Additive only: every existing
      // query keeps working, and the desktop app ignores the new columns.
      const has = (table: string, col: string) =>
        (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some(
          (c) => c.name === col
        );
      const addColumn = (table: string, col: string, ddl: string) => {
        if (!has(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
      };

      addColumn('expense_categories', 'emoji', 'TEXT');
      addColumn(
        'expense_categories',
        'kind',
        "TEXT NOT NULL DEFAULT 'want' CHECK (kind IN ('need','want'))"
      );
      addColumn('expense_categories', 'sort_order', 'INTEGER');
      addColumn('savings_goals', 'emoji', 'TEXT');
      addColumn('expenses', 'fund_id', 'INTEGER REFERENCES savings_goals(id) ON DELETE SET NULL');
      addColumn(
        'expenses',
        'recurring_id',
        'INTEGER REFERENCES recurring_expenses(id) ON DELETE SET NULL'
      );
      addColumn(
        'recurring_expenses',
        'interval_count',
        'INTEGER NOT NULL DEFAULT 1 CHECK (interval_count >= 1)'
      );
      addColumn('recurring_expenses', 'emoji', 'TEXT');
      addColumn('paychecks', 'payday', 'TEXT');

      db.exec(`
        CREATE TABLE IF NOT EXISTS budget_months (
          month        TEXT PRIMARY KEY,          -- 'YYYY-MM'
          confirmed_at TEXT,                      -- NULL = draft awaiting review
          created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        -- ref_id is polymorphic: expense_categories (spend), savings_goals (fund),
        -- debts (debt). Deleting one of those rows cleans up here (repo.ts).
        CREATE TABLE IF NOT EXISTS budget_lines (
          id      INTEGER PRIMARY KEY AUTOINCREMENT,
          month   TEXT NOT NULL REFERENCES budget_months(month) ON DELETE CASCADE,
          kind    TEXT NOT NULL CHECK (kind IN ('spend','fund','debt')),
          ref_id  INTEGER NOT NULL,
          amount  REAL NOT NULL CHECK (amount >= 0),
          UNIQUE (month, kind, ref_id)
        );
        CREATE INDEX IF NOT EXISTS idx_budget_lines_month ON budget_lines(month);

        -- Money into / out of a fund from OUTSIDE the budget. Planned monthly
        -- contributions are derived from confirmed 'fund' lines instead.
        CREATE TABLE IF NOT EXISTS fund_transactions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          goal_id    INTEGER NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
          kind       TEXT NOT NULL CHECK (kind IN ('deposit','withdrawal')),
          amount     REAL NOT NULL CHECK (amount > 0),
          date       TEXT NOT NULL,
          note       TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_fund_tx_goal ON fund_transactions(goal_id);
        CREATE INDEX IF NOT EXISTS idx_expenses_fund ON expenses(fund_id);
      `);

      for (const t of ['budget_months', 'budget_lines', 'fund_transactions']) {
        addSyncTracking(db, t);
      }

      // Backfills — decided once, here, so a later rename doesn't re-guess.
      const cats = db
        .prepare('SELECT id, name FROM expense_categories WHERE emoji IS NULL')
        .all() as { id: number; name: string }[];
      const setCat = db.prepare('UPDATE expense_categories SET emoji = ?, kind = ? WHERE id = ?');
      for (const c of cats) setCat.run(suggestEmoji(c.name), suggestKind(c.name), c.id);

      const goals = db
        .prepare('SELECT id, name FROM savings_goals WHERE emoji IS NULL')
        .all() as { id: number; name: string }[];
      const setGoal = db.prepare('UPDATE savings_goals SET emoji = ? WHERE id = ?');
      for (const g of goals) setGoal.run(suggestEmoji(g.name, '💰'), g.id);

      const recs = db
        .prepare('SELECT id, description FROM recurring_expenses WHERE emoji IS NULL')
        .all() as { id: number; description: string }[];
      const setRec = db.prepare('UPDATE recurring_expenses SET emoji = ? WHERE id = ?');
      for (const r of recs) setRec.run(suggestEmoji(r.description, '🔁'), r.id);

      // Generated expenses were only tagged with note='Recurring'; link them to
      // the template they came from so the budget can take them off the top.
      db.exec(`
        UPDATE expenses
           SET recurring_id = (
                 SELECT r.id FROM recurring_expenses r
                  WHERE r.description = expenses.description AND r.amount = expenses.amount
                  ORDER BY r.id LIMIT 1)
         WHERE note = 'Recurring' AND recurring_id IS NULL
      `);
    },
  },
  {
    version: 12,
    name: 'onboarding_flag',
    up: (db) => {
      // Decide once, from the data that's already here. An install with bills,
      // goals, or paychecks is somebody mid-use who must never be dropped into
      // the welcome flow; an empty database is a genuine first run.
      //
      // This is why the flag is set here rather than in the launch-time seed
      // block — the seed runs on every start and has no way to tell the two
      // apart.
      const { n } = db
        .prepare(
          `SELECT (SELECT COUNT(*) FROM bills)
                + (SELECT COUNT(*) FROM savings_goals)
                + (SELECT COUNT(*) FROM paychecks) AS n`
        )
        .get() as { n: number };
      db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').run(
        'onboarded',
        n > 0 ? 'true' : 'false'
      );
    },
  },
  {
    version: 11,
    name: 'sync_groundwork',
    up: (db) => {
      // Groundwork only — no sync is implemented. Every table keys on INTEGER
      // PRIMARY KEY AUTOINCREMENT, so two devices both creating a bill would
      // both call it id=7. Adding stable UUIDs while there is still one device
      // and one database is cheap; retrofitting them across historical rows
      // later is not.
      //
      // Deliberately pure DDL + triggers: this changes ZERO lines of repo.ts.
      // A deleted_at column per table would have meant converting every delete
      // to a soft delete and adding `WHERE deleted_at IS NULL` to essentially
      // every SELECT — a large, risky change to query semantics for a feature
      // that does not exist yet. A trigger-fed audit table records the same
      // information and leaves all existing queries untouched.
      db.exec(`
        CREATE TABLE IF NOT EXISTS _deletions (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT    NOT NULL,
          uuid       TEXT    NOT NULL,
          deleted_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_deletions_uuid ON _deletions(uuid);
      `);

      for (const t of SYNC_TRACKED_TABLES) addSyncTracking(db, t);
    },
  },
  {
    version: 10,
    name: 'registered_accounts',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS registered_accounts (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          kind              TEXT NOT NULL CHECK (kind IN ('rrsp','tfsa','fhsa')),
          label             TEXT NOT NULL,
          contribution_room REAL NOT NULL DEFAULT 0 CHECK (contribution_room >= 0),
          notes             TEXT,
          archived          INTEGER NOT NULL DEFAULT 0,
          created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS registered_contributions (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id  INTEGER NOT NULL REFERENCES registered_accounts(id) ON DELETE CASCADE,
          amount      REAL NOT NULL CHECK (amount >= 0),
          date        TEXT NOT NULL,
          note        TEXT,
          created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reg_contrib_account ON registered_contributions(account_id);
      `);
    },
  },
  {
    version: 9,
    name: 'recurring_expenses',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS recurring_expenses (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          description    TEXT NOT NULL,
          amount         REAL NOT NULL CHECK (amount >= 0),
          category_id    INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
          debt_id        INTEGER REFERENCES debts(id) ON DELETE SET NULL,
          frequency      TEXT NOT NULL CHECK (frequency IN ('weekly','biweekly','monthly','yearly')),
          anchor_date    TEXT NOT NULL,
          last_generated TEXT,
          archived       INTEGER NOT NULL DEFAULT 0,
          created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    version: 8,
    name: 'expense_budgets',
    up: (db) => {
      // Optional monthly spending cap per expense category.
      db.exec(`
        CREATE TABLE IF NOT EXISTS expense_budgets (
          category_id   INTEGER PRIMARY KEY REFERENCES expense_categories(id) ON DELETE CASCADE,
          monthly_limit REAL NOT NULL CHECK (monthly_limit >= 0)
        );
      `);
    },
  },
  {
    version: 7,
    name: 'debt_compounding',
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(debts)`).all() as { name: string }[];
      if (!cols.find((c) => c.name === 'compounding')) {
        db.exec(
          `ALTER TABLE debts ADD COLUMN compounding TEXT NOT NULL DEFAULT 'monthly'
             CHECK (compounding IN ('monthly','semi_annual'))`
        );
        // Canadian convention: fixed mortgages compound semi-annually.
        db.exec(`UPDATE debts SET compounding = 'semi_annual' WHERE type = 'mortgage'`);
      }
    },
  },
  {
    version: 6,
    name: 'debt_interest_day',
    up: (db) => {
      const cols = db.prepare(`PRAGMA table_info(debts)`).all() as { name: string }[];
      if (!cols.find((c) => c.name === 'interest_day')) {
        db.exec(`ALTER TABLE debts ADD COLUMN interest_day INTEGER`);
      }
      if (!cols.find((c) => c.name === 'last_interest_applied')) {
        db.exec(`ALTER TABLE debts ADD COLUMN last_interest_applied TEXT`);
      }
    },
  },
  {
    version: 5,
    name: 'expense_debt_link_and_debt_allocations',
    up: (db) => {
      // Expenses can be charged to a credit card (revolving debt).
      const cols = db.prepare(`PRAGMA table_info(expenses)`).all() as { name: string }[];
      if (!cols.find((c) => c.name === 'debt_id')) {
        db.exec(
          `ALTER TABLE expenses ADD COLUMN debt_id INTEGER REFERENCES debts(id) ON DELETE SET NULL`
        );
      }
      // Paychecks can pay down revolving debts: extend the allocation kind
      // CHECK with 'debt'. SQLite can't alter a CHECK, so rebuild the table.
      db.exec(`
        CREATE TABLE paycheck_allocations_new (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          paycheck_id  INTEGER NOT NULL REFERENCES paychecks(id) ON DELETE CASCADE,
          kind         TEXT NOT NULL CHECK (kind IN ('bill','goal','fun','other','debt')),
          ref_id       INTEGER,
          amount       REAL NOT NULL CHECK (amount >= 0),
          note         TEXT
        );
        INSERT INTO paycheck_allocations_new (id, paycheck_id, kind, ref_id, amount, note)
          SELECT id, paycheck_id, kind, ref_id, amount, note FROM paycheck_allocations;
        DROP TABLE paycheck_allocations;
        ALTER TABLE paycheck_allocations_new RENAME TO paycheck_allocations;
        CREATE INDEX IF NOT EXISTS idx_alloc_paycheck ON paycheck_allocations(paycheck_id);
        CREATE INDEX IF NOT EXISTS idx_alloc_kind_ref ON paycheck_allocations(kind, ref_id);
      `);
    },
  },
  {
    version: 4,
    name: 'debts',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS debts (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          name            TEXT NOT NULL,
          type            TEXT NOT NULL CHECK (type IN ('credit_card','mortgage','car_loan','line_of_credit','loan')),
          original_amount REAL NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
          current_balance REAL NOT NULL CHECK (current_balance >= 0),
          interest_rate   REAL NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
          payment_amount  REAL NOT NULL DEFAULT 0 CHECK (payment_amount >= 0),
          payment_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (payment_frequency IN ('weekly','biweekly','semi_monthly','monthly')),
          split_count     INTEGER NOT NULL DEFAULT 1 CHECK (split_count >= 1),
          notes           TEXT,
          archived        INTEGER NOT NULL DEFAULT 0,
          created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    },
  },
  {
    version: 3,
    name: 'expenses',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS expense_categories (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL DEFAULT '#64748b'
        );

        CREATE TABLE IF NOT EXISTS expenses (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          description TEXT NOT NULL,
          amount      REAL NOT NULL CHECK (amount >= 0),
          date        TEXT NOT NULL,
          category_id INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
          note        TEXT,
          created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
      `);

      // Seed common expense categories ONCE (inside the migration, so deleting
      // one doesn't make it reappear on next launch). Colors drawn from the
      // shared palette used in Bills.tsx.
      const seed = db.prepare(
        'INSERT OR IGNORE INTO expense_categories (name, color) VALUES (?, ?)'
      );
      const defaults: [string, string][] = [
        ['Food', '#ef4444'],
        ['Groceries', '#10b981'],
        ['Gas', '#f59e0b'],
        ['Dining', '#ec4899'],
        ['Shopping', '#8b5cf6'],
        ['Entertainment', '#06b6d4'],
        ['Transport', '#3b82f6'],
        ['Health', '#14b8a6'],
        ['Other', '#64748b'],
      ];
      for (const [name, color] of defaults) seed.run(name, color);
    },
  },
  {
    version: 2,
    name: 'goals_archived_at',
    up: (db) => {
      // Add archived_at column so we can show when a goal was completed.
      const cols = db.prepare(`PRAGMA table_info(savings_goals)`).all() as { name: string }[];
      if (!cols.find((c) => c.name === 'archived_at')) {
        db.exec(`ALTER TABLE savings_goals ADD COLUMN archived_at TEXT`);
      }
    },
  },
  {
    version: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS categories (
          id    INTEGER PRIMARY KEY AUTOINCREMENT,
          name  TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL DEFAULT '#64748b'
        );

        CREATE TABLE IF NOT EXISTS bills (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT NOT NULL,
          amount       REAL NOT NULL CHECK (amount >= 0),
          frequency    TEXT NOT NULL CHECK (frequency IN ('biweekly','monthly','semi_annual','yearly','custom_days')),
          custom_days  INTEGER,
          anchor_date  TEXT NOT NULL,
          category_id  INTEGER REFERENCES categories(id) ON DELETE SET NULL,
          autopay      INTEGER NOT NULL DEFAULT 0,
          notes        TEXT,
          archived     INTEGER NOT NULL DEFAULT 0,
          created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_bills_category ON bills(category_id);
        CREATE INDEX IF NOT EXISTS idx_bills_archived ON bills(archived);

        CREATE TABLE IF NOT EXISTS savings_goals (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT NOT NULL,
          target_amount REAL NOT NULL CHECK (target_amount > 0),
          target_date   TEXT,
          color         TEXT NOT NULL DEFAULT '#10b981',
          archived      INTEGER NOT NULL DEFAULT 0,
          created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS paychecks (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          date       TEXT NOT NULL,
          amount     REAL NOT NULL CHECK (amount >= 0),
          notes      TEXT,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_paychecks_date ON paychecks(date);

        CREATE TABLE IF NOT EXISTS paycheck_allocations (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          paycheck_id  INTEGER NOT NULL REFERENCES paychecks(id) ON DELETE CASCADE,
          kind         TEXT NOT NULL CHECK (kind IN ('bill','goal','fun','other')),
          ref_id       INTEGER,
          amount       REAL NOT NULL CHECK (amount >= 0),
          note         TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_alloc_paycheck ON paycheck_allocations(paycheck_id);
        CREATE INDEX IF NOT EXISTS idx_alloc_kind_ref ON paycheck_allocations(kind, ref_id);
      `);
    },
  },
];

/**
 * Applies pending migrations in ascending order. `maxVersion` exists so tests
 * can build a genuine older database to upgrade from.
 */
export function runMigrations(db: DB, maxVersion = Infinity) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name    TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );`);

  const applied = new Set(
    db.prepare('SELECT version FROM _migrations').all().map((r: any) => r.version)
  );

  const insertMigration = db.prepare('INSERT INTO _migrations (version, name) VALUES (?, ?)');

  // Apply in ascending version order so v1 schema exists before v2 patches it.
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of ordered) {
    if (applied.has(m.version) || m.version > maxVersion) continue;
    const tx = db.transaction(() => {
      m.up(db);
      insertMigration.run(m.version, m.name);
    });
    tx();
  }

  // Seed default settings if missing
  const ensureSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  ensureSetting.run('theme', 'light');
  ensureSetting.run('pay_cadence', 'biweekly');
  ensureSetting.run('next_paycheck_date', '');
  ensureSetting.run('accent_color', 'emerald');
  ensureSetting.run('user_name', 'Kevin');
  ensureSetting.run('mobile_home_layout', 'hero_actions');
  ensureSetting.run('notify_enabled', 'true');
  ensureSetting.run('notify_bill_lead_days', '3');
  ensureSetting.run('notify_paycheck', 'true');
  ensureSetting.run('notify_budget', 'true');
  ensureSetting.run('pay_amount', '');
  ensureSetting.run('pay_frequency', 'biweekly');
  ensureSetting.run('notify_daily_log', 'true');
  ensureSetting.run('notify_daily_time', '19:00');
  ensureSetting.run('notify_new_month', 'true');
  ensureSetting.run('notify_weekly_report', 'true');
}
