import type { DB } from './db';

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

const migrations: Migration[] = [
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

      for (const t of SYNC_TRACKED_TABLES) {
        const cols = (db.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map(
          (c) => c.name
        );

        // SQLite requires a constant DEFAULT in ALTER TABLE ADD COLUMN, so the
        // columns are added bare and backfilled; future inserts are covered by
        // the AFTER INSERT trigger below rather than by a column default.
        if (!cols.includes('uuid')) {
          db.exec(`ALTER TABLE ${t} ADD COLUMN uuid TEXT`);
        }
        if (!cols.includes('updated_at')) {
          db.exec(`ALTER TABLE ${t} ADD COLUMN updated_at INTEGER`);
        }
        db.exec(`UPDATE ${t} SET uuid = lower(hex(randomblob(16))) WHERE uuid IS NULL`);
        db.exec(
          `UPDATE ${t} SET updated_at = CAST(strftime('%s','now') AS INTEGER)
           WHERE updated_at IS NULL`
        );

        db.exec(`
          CREATE TRIGGER IF NOT EXISTS ${t}_sync_ins AFTER INSERT ON ${t}
          BEGIN
            UPDATE ${t}
               SET uuid = COALESCE(NEW.uuid, lower(hex(randomblob(16)))),
                   updated_at = CAST(strftime('%s','now') AS INTEGER)
             WHERE rowid = NEW.rowid;
          END;

          CREATE TRIGGER IF NOT EXISTS ${t}_sync_upd AFTER UPDATE ON ${t}
          WHEN NEW.updated_at IS OLD.updated_at
          BEGIN
            UPDATE ${t}
               SET updated_at = CAST(strftime('%s','now') AS INTEGER)
             WHERE rowid = NEW.rowid;
          END;

          CREATE TRIGGER IF NOT EXISTS ${t}_sync_del AFTER DELETE ON ${t}
          BEGIN
            INSERT INTO _deletions (table_name, uuid, deleted_at)
            VALUES ('${t}', OLD.uuid, CAST(strftime('%s','now') AS INTEGER));
          END;
        `);
      }
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

export function runMigrations(db: DB) {
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
    if (applied.has(m.version)) continue;
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
  ensureSetting.run('theme', 'dark');
  ensureSetting.run('pay_cadence', 'biweekly');
  ensureSetting.run('next_paycheck_date', '');
  ensureSetting.run('accent_color', 'emerald');
  ensureSetting.run('user_name', 'Kevin');
  ensureSetting.run('notify_enabled', 'true');
  ensureSetting.run('notify_bill_lead_days', '3');
  ensureSetting.run('notify_paycheck', 'true');
  ensureSetting.run('notify_budget', 'true');
}
