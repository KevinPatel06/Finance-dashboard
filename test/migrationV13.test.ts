import { describe, it, expect, beforeEach } from 'vitest';
import { makeNodeSqliteDb, wrapNodeSqlite, type TestDb } from './helpers/nodeSqlite';
import { setDb, type DB } from '../core/db';
import { runMigrations } from '../core/migrations';
import * as repo from '../core/repo';

/**
 * v13 adds the monthly budget. The risky direction is an EXISTING install:
 * Kevin's real database is at v12 with goals, custom categories and
 * materialised recurring expenses, and upgrading must not change any balance.
 * So this builds a genuine v12 database, seeds it with raw SQL (repo functions
 * already expect v13 columns), then upgrades it.
 */
describe('migration v13 — budget redesign', () => {
  let db: TestDb;

  const cols = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

  beforeEach(() => {
    db = wrapNodeSqlite(makeNodeSqliteDb());
    runMigrations(db as unknown as DB, 12);
    db.prepare("UPDATE settings SET value = 'dark' WHERE key = 'theme'").run();
    db.prepare(
      "INSERT INTO savings_goals (name, target_amount, color) VALUES ('Emergency fund', 5000, '#10b981')"
    ).run();
    db.prepare("INSERT INTO paychecks (date, amount) VALUES ('2026-09-04', 1200)").run();
    db.prepare(
      "INSERT INTO paycheck_allocations (paycheck_id, kind, ref_id, amount) VALUES (1, 'goal', 1, 300)"
    ).run();
    db.prepare("INSERT INTO expense_categories (name, color) VALUES ('Gaming', '#000000')").run();
    db.prepare(
      `INSERT INTO recurring_expenses (description, amount, frequency, anchor_date, last_generated)
       VALUES ('Spotify', 11.99, 'monthly', '2026-06-01', '2026-10-01')`
    ).run();
    db.prepare(
      "INSERT INTO expenses (description, amount, date, note) VALUES ('Spotify', 11.99, '2026-10-01', 'Recurring')"
    ).run();
    db.prepare(
      "INSERT INTO expenses (description, amount, date, note) VALUES ('Spotify', 11.99, '2026-09-15', NULL)"
    ).run();

    runMigrations(db as unknown as DB);
    setDb(db as unknown as DB);
  });

  it('records itself as applied', () => {
    const row = db.prepare('SELECT name FROM _migrations WHERE version = 13').get() as { name: string };
    expect(row.name).toBe('budget_redesign');
  });

  it('adds the new columns', () => {
    expect(cols('expense_categories')).toEqual(expect.arrayContaining(['emoji', 'kind', 'sort_order']));
    expect(cols('savings_goals')).toContain('emoji');
    expect(cols('expenses')).toEqual(expect.arrayContaining(['fund_id', 'recurring_id']));
    expect(cols('recurring_expenses')).toEqual(expect.arrayContaining(['interval_count', 'emoji']));
    expect(cols('paychecks')).toContain('payday');
  });

  it('backfills emoji and need/want on existing categories', () => {
    const cat = (name: string) =>
      db.prepare('SELECT emoji, kind FROM expense_categories WHERE name = ?').get(name) as {
        emoji: string;
        kind: string;
      };
    expect(cat('Groceries')).toEqual({ emoji: '🛒', kind: 'need' });
    expect(cat('Gaming')).toEqual({ emoji: '🎬', kind: 'want' });
  });

  it('backfills emoji on goals and recurring templates', () => {
    const goal = db.prepare('SELECT emoji FROM savings_goals').get() as { emoji: string };
    expect(goal.emoji).toBe('🆘');
    const rec = db.prepare('SELECT emoji, interval_count FROM recurring_expenses').get() as {
      emoji: string;
      interval_count: number;
    };
    expect(rec).toEqual({ emoji: '📺', interval_count: 1 });
  });

  it('links only generated expenses back to their recurring template', () => {
    const rows = db.prepare('SELECT note, recurring_id FROM expenses ORDER BY date DESC').all() as {
      note: string | null;
      recurring_id: number | null;
    }[];
    expect(rows).toEqual([
      { note: 'Recurring', recurring_id: 1 },
      { note: null, recurring_id: null },
    ]);
  });

  it('creates the budget tables with sync tracking', () => {
    for (const t of ['budget_months', 'budget_lines', 'fund_transactions']) {
      expect(cols(t)).toEqual(expect.arrayContaining(['uuid', 'updated_at']));
      const trig = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?")
        .get(`${t}_sync_del`);
      expect(trig, t).toBeTruthy();
    }
  });

  it('leaves balances and the stored theme unchanged', () => {
    expect(repo.listGoals()[0].current_amount).toBe(300);
    expect(repo.getSettings().theme).toBe('dark');
  });
});
