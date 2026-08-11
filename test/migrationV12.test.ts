import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers/makeDb';
import { setDb, type DB } from '../core/db';
import { runMigrations } from '../core/migrations';
import * as repo from '../core/repo';
import type { TestDb } from './helpers/nodeSqlite';

/**
 * v12 decides `onboarded` ONCE, from whether the database already holds data.
 * Getting this wrong in the "existing install" direction would drop somebody
 * mid-use into first-run setup, so both directions are pinned here.
 */
describe('migration v12 — onboarding flag', () => {
  let db: TestDb;

  beforeEach(() => {
    db = makeTestDb();
    setDb(db as unknown as DB);
  });

  /** Re-run v12 the way an existing install would on first launch after upgrading. */
  const rerunV12 = () => {
    db.prepare('DELETE FROM _migrations WHERE version = 12').run();
    db.prepare("DELETE FROM settings WHERE key = 'onboarded'").run();
    runMigrations(db as unknown as DB);
  };

  it('marks an empty database as not yet onboarded', () => {
    expect(repo.getSettings().onboarded).toBe(false);
  });

  it('marks an install that already has bills as onboarded', () => {
    repo.createBill({
      name: 'Hydro',
      amount: 100,
      frequency: 'monthly',
      anchor_date: '2026-01-15',
      category_id: null,
      autopay: false,
    });
    rerunV12();
    expect(repo.getSettings().onboarded).toBe(true);
  });

  it('marks an install that already has goals as onboarded', () => {
    repo.createGoal({ name: 'Emergency fund', target_amount: 5000, color: '#10b981' });
    rerunV12();
    expect(repo.getSettings().onboarded).toBe(true);
  });

  it('marks an install that already has paychecks as onboarded', () => {
    repo.createPaycheck({ date: '2026-08-01', amount: 2000, allocations: [] });
    rerunV12();
    expect(repo.getSettings().onboarded).toBe(true);
  });

  it('never clobbers an explicit choice already stored', () => {
    repo.updateSettings({ onboarded: true });
    // Re-running the migration alone (row intact) must leave the value alone.
    db.prepare('DELETE FROM _migrations WHERE version = 12').run();
    runMigrations(db as unknown as DB);
    expect(repo.getSettings().onboarded).toBe(true);
  });
});
