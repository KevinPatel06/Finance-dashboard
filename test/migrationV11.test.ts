import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/makeDb';
import { setDb, type DB } from '../core/db';
import * as repo from '../core/repo';
import type { TestDb } from './helpers/nodeSqlite';

const TRACKED = [
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

const newBill = () =>
  repo.createBill({
    name: 'Hydro',
    amount: 100,
    frequency: 'monthly',
    anchor_date: '2026-01-15',
    category_id: null,
    autopay: false,
  });

describe('migration v11 — sync groundwork', () => {
  let db: TestDb;

  beforeEach(() => {
    db = makeTestDb();
    setDb(db as unknown as DB);
  });

  it('adds uuid and updated_at to every tracked table', () => {
    for (const table of TRACKED) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
      const names = cols.map((c) => c.name);
      expect(names, `${table}.uuid`).toContain('uuid');
      expect(names, `${table}.updated_at`).toContain('updated_at');
    }
  });

  it('creates the _deletions audit table', () => {
    const cols = db.prepare(`PRAGMA table_info(_deletions)`).all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(
      expect.arrayContaining(['table_name', 'uuid', 'deleted_at'])
    );
  });

  it('auto-populates uuid and updated_at on insert without application code', () => {
    const bill = newBill();
    const row = db.prepare('SELECT uuid, updated_at FROM bills WHERE id = ?').get(bill.id) as {
      uuid: string;
      updated_at: number;
    };
    expect(row.uuid).toMatch(/^[0-9a-f]{32}$/);
    expect(row.updated_at).toBeGreaterThan(0);
  });

  it('gives every row a distinct uuid', () => {
    newBill();
    newBill();
    newBill();
    const rows = db.prepare('SELECT uuid FROM bills').all() as { uuid: string }[];
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((r) => r.uuid)).size).toBe(3);
  });

  it('records a tombstone when a row is hard-deleted', () => {
    const cat = repo.createCategory({ name: 'Utilities', color: '#3b82f6' });
    const { uuid } = db.prepare('SELECT uuid FROM categories WHERE id = ?').get(cat.id) as {
      uuid: string;
    };
    repo.deleteCategory(cat.id);
    const tomb = db.prepare('SELECT * FROM _deletions WHERE uuid = ?').get(uuid) as
      | { table_name: string }
      | undefined;
    expect(tomb).toBeTruthy();
    expect(tomb!.table_name).toBe('categories');
  });

  it('leaves no tombstone for soft deletes, which sync via updated_at instead', () => {
    // deleteBill sets archived = 1 rather than removing the row, so the DELETE
    // trigger never fires — correctly. The archive is an UPDATE, so updated_at
    // moves and a future sync sees it as an ordinary change.
    const bill = newBill();
    db.prepare('UPDATE bills SET updated_at = 0 WHERE id = ?').run(bill.id);
    repo.deleteBill(bill.id);

    expect(db.prepare('SELECT COUNT(*) AS n FROM _deletions').get()).toEqual({ n: 0 });
    const row = db.prepare('SELECT archived, updated_at FROM bills WHERE id = ?').get(bill.id) as {
      archived: number;
      updated_at: number;
    };
    expect(row.archived).toBe(1);
    expect(row.updated_at).toBeGreaterThan(0);
  });

  it('bumps updated_at on update', () => {
    const bill = newBill();
    const read = () =>
      (
        db.prepare('SELECT updated_at FROM bills WHERE id = ?').get(bill.id) as {
          updated_at: number;
        }
      ).updated_at;
    const before = read();
    db.prepare('UPDATE bills SET updated_at = 0 WHERE id = ?').run(bill.id);
    db.prepare('UPDATE bills SET amount = 200 WHERE id = ?').run(bill.id);
    expect(read()).toBeGreaterThanOrEqual(before);
  });

  it('backfills uuid and updated_at for rows that predate v11', () => {
    // Simulate a pre-v11 row by nulling the columns, then re-running migrations
    // the way an existing install would on first launch after upgrading.
    const bill = newBill();
    db.prepare('UPDATE bills SET uuid = NULL, updated_at = NULL WHERE id = ?').run(bill.id);
    db.prepare('DELETE FROM _migrations WHERE version = 11').run();
    db.exec('DROP TRIGGER IF EXISTS bills_sync_ins');
    db.exec('DROP TRIGGER IF EXISTS bills_sync_upd');
    db.exec('DROP TRIGGER IF EXISTS bills_sync_del');

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return import('../core/migrations').then(({ runMigrations }) => {
      runMigrations(db as unknown as DB);
      const row = db.prepare('SELECT uuid, updated_at FROM bills WHERE id = ?').get(bill.id) as {
        uuid: string | null;
        updated_at: number | null;
      };
      expect(row.uuid).toMatch(/^[0-9a-f]{32}$/);
      expect(row.updated_at).toBeGreaterThan(0);
    });
  });
});
