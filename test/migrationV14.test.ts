import { describe, it, expect, beforeEach } from 'vitest';
import { formatISO } from 'date-fns';
import { makeNodeSqliteDb, wrapNodeSqlite, type TestDb } from './helpers/nodeSqlite';
import { setDb, type DB } from '../core/db';
import { runMigrations } from '../core/migrations';
import * as repo from '../core/repo';
import { defaultDeadline, taxYearFor } from '../shared/registered';

/**
 * v14 rebuilds budget_lines (SQLite can't alter a CHECK) to allow the
 * 'contribution' kind, and gives registered accounts a CRA year. An existing
 * install must keep every plan line — uuid included — and its sync triggers,
 * without the rebuild leaving tombstones behind.
 */
describe('migration v14 — contributions', () => {
  let db: TestDb;
  const today = formatISO(new Date(), { representation: 'date' });
  let uuidsBefore: string[] = [];
  let deletionsBefore = 0;

  const cols = (table: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const trigger = (name: string) =>
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(name);
  const lineUuids = () =>
    (db.prepare('SELECT uuid FROM budget_lines ORDER BY id').all() as { uuid: string }[]).map((r) => r.uuid);

  beforeEach(() => {
    db = wrapNodeSqlite(makeNodeSqliteDb());
    runMigrations(db as unknown as DB, 13);
    db.prepare(
      "INSERT INTO savings_goals (name, target_amount, color) VALUES ('Emergency fund', 5000, '#10b981')"
    ).run();
    db.prepare("INSERT INTO debts (name, type, original_amount, current_balance) VALUES ('Visa', 'credit_card', 1000, 1000)").run();
    db.prepare("INSERT INTO budget_months (month, confirmed_at) VALUES ('2026-10', '2026-10-01 00:00:00')").run();
    db.prepare("INSERT INTO budget_months (month) VALUES ('2026-11')").run();
    db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-10', 'spend', 1, 300)").run();
    db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-10', 'fund', 1, 100)").run();
    db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-11', 'debt', 1, 50)").run();
    db.prepare(
      "INSERT INTO registered_accounts (kind, label, contribution_room) VALUES ('tfsa', 'TFSA', 7000)"
    ).run();
    db.prepare('INSERT INTO registered_contributions (account_id, amount, date) VALUES (1, 500, ?)').run(today);
    uuidsBefore = lineUuids();
    deletionsBefore = count('_deletions');

    runMigrations(db as unknown as DB);
    setDb(db as unknown as DB);
  });

  it('records itself as applied', () => {
    const row = db.prepare('SELECT name FROM _migrations WHERE version = 14').get() as { name: string };
    expect(row.name).toBe('contributions');
  });

  it('keeps every budget line with its uuid', () => {
    expect(uuidsBefore).toHaveLength(3);
    expect(lineUuids()).toEqual(uuidsBefore);
  });

  it('accepts the contribution kind', () => {
    expect(() =>
      db.prepare("INSERT INTO budget_lines (month, kind, ref_id, amount) VALUES ('2026-11','contribution',1,600)").run()
    ).not.toThrow();
  });

  it('restores the sync triggers and writes no tombstones', () => {
    for (const t of ['budget_lines_sync_ins', 'budget_lines_sync_upd', 'budget_lines_sync_del']) {
      expect(trigger(t), t).toBeTruthy();
    }
    expect(count('_deletions')).toBe(deletionsBefore);
  });

  it('backfills existing accounts to an open year with budgeting off', () => {
    const a = db
      .prepare('SELECT tax_year, goal, goal_deadline, budgeted, waiting, fhsa_lifetime_max FROM registered_accounts')
      .get();
    const y = taxYearFor('tfsa', today);
    expect(a).toEqual({
      tax_year: y,
      goal: null,
      goal_deadline: defaultDeadline('tfsa', y),
      budgeted: 0,
      waiting: 0,
      fhsa_lifetime_max: 0,
    });
  });

  it('creates registered_years with sync tracking', () => {
    expect(cols('registered_years')).toEqual(
      expect.arrayContaining(['account_id', 'tax_year', 'room', 'goal', 'goal_deadline', 'contributed', 'uuid', 'updated_at'])
    );
    expect(trigger('registered_years_sync_del')).toBeTruthy();
  });

  it('the desktop list still works', () => {
    expect(repo.listRegisteredAccounts()[0].contributed).toBe(500);
  });
});
