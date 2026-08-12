import { App } from '@capacitor/app';
import { REPO_API } from '../../../core/apiMap';
import { IPC } from '../../../shared/ipc';
import { setDb } from '../../../core/db';
import { runMigrations } from '../../../core/migrations';
import { openDatabase, flush } from './storage';
import { exportCsv, backupDb } from './files';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Builds window.api in-process from the same table Electron registers IPC
 * handlers from, so the 11 pages cannot tell the difference between an IPC
 * round-trip and a direct call.
 */
export async function installIosApi(): Promise<void> {
  const { db, isNew } = await openDatabase();
  setDb(db);
  runMigrations(db);
  if (isNew) await flush(); // persist the freshly migrated schema

  const byChannel = new Map<string, (...a: any[]) => unknown>();
  const mutating = new Set<string>();
  for (const { channel, fn, mutates } of REPO_API) {
    byChannel.set(channel, fn);
    if (mutates) mutating.add(channel);
  }

  const invoke = async (channel: string, ...args: any[]): Promise<any> => {
    const fn = byChannel.get(channel);
    if (!fn) throw new Error(`Unhandled channel: ${channel}`);
    const result = fn(...args);
    if (mutating.has(channel)) await flush();
    return result;
  };

  // Namespace shape must match electron/preload.ts exactly — this is the
  // renderer-facing surface. Channel constants come from shared/ipc.ts, so a
  // typo is a compile error, and test/apiMap.test.ts guarantees every channel
  // has a handler behind it.
  const api = {
    settings: {
      get: () => invoke(IPC.GET_SETTINGS),
      update: (patch: unknown) => invoke(IPC.UPDATE_SETTINGS, patch),
    },
    categories: {
      list: () => invoke(IPC.LIST_CATEGORIES),
      create: (input: unknown) => invoke(IPC.CREATE_CATEGORY, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_CATEGORY, id, input),
      remove: (id: number) => invoke(IPC.DELETE_CATEGORY, id),
    },
    bills: {
      list: () => invoke(IPC.LIST_BILLS),
      create: (input: unknown) => invoke(IPC.CREATE_BILL, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_BILL, id, input),
      remove: (id: number) => invoke(IPC.DELETE_BILL, id),
      upcoming: (from: string, to: string) => invoke(IPC.UPCOMING_BILLS, from, to),
      toPay: (windowEnd: string) => invoke(IPC.BILLS_TO_PAY, windowEnd),
      statuses: () => invoke(IPC.BILL_STATUSES),
    },
    goals: {
      list: () => invoke(IPC.LIST_GOALS),
      listArchived: () => invoke(IPC.LIST_ARCHIVED_GOALS),
      create: (input: unknown) => invoke(IPC.CREATE_GOAL, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_GOAL, id, input),
      remove: (id: number) => invoke(IPC.DELETE_GOAL, id),
      restore: (id: number) => invoke(IPC.RESTORE_GOAL, id),
      purge: (id: number) => invoke(IPC.HARD_DELETE_GOAL, id),
    },
    paychecks: {
      list: () => invoke(IPC.LIST_PAYCHECKS),
      get: (id: number) => invoke(IPC.GET_PAYCHECK, id),
      create: (input: unknown) => invoke(IPC.CREATE_PAYCHECK, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_PAYCHECK, id, input),
      remove: (id: number) => invoke(IPC.DELETE_PAYCHECK, id),
    },
    debts: {
      list: () => invoke(IPC.LIST_DEBTS),
      create: (input: unknown) => invoke(IPC.CREATE_DEBT, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_DEBT, id, input),
      remove: (id: number) => invoke(IPC.DELETE_DEBT, id),
    },
    expenseCategories: {
      list: () => invoke(IPC.LIST_EXPENSE_CATEGORIES),
      create: (input: unknown) => invoke(IPC.CREATE_EXPENSE_CATEGORY, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_EXPENSE_CATEGORY, id, input),
      remove: (id: number) => invoke(IPC.DELETE_EXPENSE_CATEGORY, id),
    },
    expenses: {
      list: () => invoke(IPC.LIST_EXPENSES),
      create: (input: unknown) => invoke(IPC.CREATE_EXPENSE, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_EXPENSE, id, input),
      remove: (id: number) => invoke(IPC.DELETE_EXPENSE, id),
    },
    recurringExpenses: {
      list: () => invoke(IPC.LIST_RECURRING),
      create: (input: unknown) => invoke(IPC.CREATE_RECURRING, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_RECURRING, id, input),
      remove: (id: number) => invoke(IPC.DELETE_RECURRING, id),
    },
    registered: {
      list: () => invoke(IPC.LIST_REGISTERED),
      create: (input: unknown) => invoke(IPC.CREATE_REGISTERED, input),
      update: (id: number, input: unknown) => invoke(IPC.UPDATE_REGISTERED, id, input),
      remove: (id: number) => invoke(IPC.DELETE_REGISTERED, id),
      addContribution: (input: unknown) => invoke(IPC.ADD_REGISTERED_CONTRIBUTION, input),
      removeContribution: (id: number) => invoke(IPC.DELETE_REGISTERED_CONTRIBUTION, id),
    },
    budgets: {
      list: () => invoke(IPC.LIST_BUDGETS),
      set: (categoryId: number, monthlyLimit: number) =>
        invoke(IPC.SET_BUDGET, categoryId, monthlyLimit),
    },
    dashboard: { get: () => invoke(IPC.DASHBOARD) },
    reports: {
      categories: (from: string, to: string) => invoke(IPC.REPORT_CATEGORIES, from, to),
      monthly: (months: number) => invoke(IPC.REPORT_MONTHLY, months),
      expenses: (from: string, to: string) => invoke(IPC.REPORT_EXPENSES, from, to),
    },
    calendar: {
      events: (from: string, to: string) => invoke(IPC.CALENDAR_EVENTS, from, to),
    },
    // Platform services — genuinely different per platform, so not in apiMap.
    db: {
      backup: () => backupDb(),
      // No first-party Capacitor document picker; restore stays desktop-only.
      // Settings hides the button on iOS.
      restore: async () => ({ ok: false }),
    },
    files: {
      exportCsv: (defaultName: string, content: string) => exportCsv(defaultName, content),
    },
  };

  (window as any).api = api;

  // Belt-and-braces durability: flush when iOS backgrounds the app.
  void App.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
      flush().catch((err) => console.error('Background flush failed', err));
    }
  });

  // Daily notification check, off the boot path.
  void import('./notify').then(({ runNotificationCheck }) => runNotificationCheck());
}
