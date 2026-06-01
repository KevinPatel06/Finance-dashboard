import type Database from 'better-sqlite3';

interface Migration {
  version: number;
  name: string;
  up: (db: Database.Database) => void;
}

const migrations: Migration[] = [
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

export function runMigrations(db: Database.Database) {
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
}
