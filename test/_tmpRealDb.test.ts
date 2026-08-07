import { describe, it, expect } from 'vitest';
import { runMigrations } from '../core/migrations';
import { setDb, type DB } from '../core/db';
import * as repo from '../core/repo';
import { wrapNodeSqlite } from './helpers/nodeSqlite';

const COPY =
  'C:/Users/KEVINP~1/AppData/Local/Temp/claude/E--Documents-Projects-2026-Finance-dashboard/267af8a4-f219-4258-91ca-0f658cab4c15/scratchpad/finance-copy.db';

describe('v11 against a copy of the real database', () => {
  it('migrates v10 -> v11 and keeps all data intact', () => {
    const s = process.getBuiltinModule('node:sqlite') as {
      DatabaseSync: new (p: string) => never;
    };
    const raw = new s.DatabaseSync(COPY);
    const db = wrapNodeSqlite(raw);
    setDb(db as unknown as DB);

    const before = {
      bills: db.prepare('SELECT COUNT(*) c FROM bills').get<{ c: number }>()!.c,
      expenses: db.prepare('SELECT COUNT(*) c FROM expenses').get<{ c: number }>()!.c,
      paychecks: db.prepare('SELECT COUNT(*) c FROM paychecks').get<{ c: number }>()!.c,
      goals: db.prepare('SELECT COUNT(*) c FROM savings_goals').get<{ c: number }>()!.c,
    };

    runMigrations(db as unknown as DB);

    const versions = db
      .prepare('SELECT version FROM _migrations ORDER BY version')
      .all<{ version: number }>()
      .map((r) => r.version);
    expect(versions).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

    // Nothing lost.
    expect(db.prepare('SELECT COUNT(*) c FROM bills').get<{ c: number }>()!.c).toBe(before.bills);
    expect(db.prepare('SELECT COUNT(*) c FROM expenses').get<{ c: number }>()!.c).toBe(
      before.expenses
    );
    expect(db.prepare('SELECT COUNT(*) c FROM paychecks').get<{ c: number }>()!.c).toBe(
      before.paychecks
    );

    // Every pre-existing row backfilled with a distinct uuid.
    const uuids = db.prepare('SELECT uuid FROM bills').all<{ uuid: string }>();
    expect(uuids).toHaveLength(before.bills);
    expect(new Set(uuids.map((u) => u.uuid)).size).toBe(before.bills);
    for (const u of uuids) expect(u.uuid).toMatch(/^[0-9a-f]{32}$/);

    // The real app's read paths still work post-migration.
    expect(repo.listBills()).toHaveLength(before.bills);
    expect(repo.listGoals().length + repo.listArchivedGoals().length).toBe(before.goals);
    expect(() => repo.dashboardSnapshot()).not.toThrow();
    expect(() => repo.billStatuses()).not.toThrow();
    expect(() => repo.reportMonthly(6)).not.toThrow();
    expect(() => repo.calendarEvents('2026-08-01', '2026-08-31')).not.toThrow();

    // Idempotent: running again is a no-op.
    runMigrations(db as unknown as DB);
    expect(
      db.prepare('SELECT COUNT(*) c FROM _migrations').get<{ c: number }>()!.c
    ).toBe(11);

    (raw as unknown as { close(): void }).close();
  });
});
