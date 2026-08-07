import { IPC } from '../shared/ipc';
import * as repo from './repo';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RepoApiEntry {
  channel: string;
  fn: (...args: any[]) => unknown;
  /** True if the call can write to the database — drives the iOS flush-to-disk. */
  mutates: boolean;
}

const r = (channel: string, fn: (...args: any[]) => unknown): RepoApiEntry => ({
  channel,
  fn,
  mutates: false,
});
const w = (channel: string, fn: (...args: any[]) => unknown): RepoApiEntry => ({
  channel,
  fn,
  mutates: true,
});

/**
 * Every repo-backed IPC channel, in one place. Electron loops over this to
 * register ipcMain handlers; iOS loops over it to build window.api in-process.
 *
 * Platform services (db backup/restore, CSV export) are NOT here — they have
 * genuinely different implementations per platform.
 *
 * test/apiMap.test.ts asserts this covers every non-platform channel, so a new
 * feature cannot ship with iOS support silently missing.
 */
export const REPO_API: RepoApiEntry[] = [
  // Settings
  r(IPC.GET_SETTINGS, () => repo.getSettings()),
  w(IPC.UPDATE_SETTINGS, (patch) => repo.updateSettings(patch)),

  // Categories
  r(IPC.LIST_CATEGORIES, () => repo.listCategories()),
  w(IPC.CREATE_CATEGORY, (input) => repo.createCategory(input)),
  w(IPC.UPDATE_CATEGORY, (id, input) => repo.updateCategory(id, input)),
  w(IPC.DELETE_CATEGORY, (id) => repo.deleteCategory(id)),

  // Bills
  r(IPC.LIST_BILLS, () => repo.listBills()),
  w(IPC.CREATE_BILL, (input) => repo.createBill(input)),
  w(IPC.UPDATE_BILL, (id, input) => repo.updateBill(id, input)),
  w(IPC.DELETE_BILL, (id) => repo.deleteBill(id)),
  r(IPC.UPCOMING_BILLS, (from, to) => repo.upcomingBills(from, to)),
  r(IPC.BILLS_TO_PAY, (windowEnd) => repo.billsToPay(windowEnd)),
  r(IPC.BILL_STATUSES, () => repo.billStatuses()),

  // Goals
  r(IPC.LIST_GOALS, () => repo.listGoals()),
  r(IPC.LIST_ARCHIVED_GOALS, () => repo.listArchivedGoals()),
  w(IPC.CREATE_GOAL, (input) => repo.createGoal(input)),
  w(IPC.UPDATE_GOAL, (id, input) => repo.updateGoal(id, input)),
  w(IPC.DELETE_GOAL, (id) => repo.deleteGoal(id)),
  w(IPC.RESTORE_GOAL, (id) => repo.restoreGoal(id)),
  w(IPC.HARD_DELETE_GOAL, (id) => repo.hardDeleteGoal(id)),

  // Paychecks
  r(IPC.LIST_PAYCHECKS, () => repo.listPaychecks()),
  r(IPC.GET_PAYCHECK, (id) => repo.getPaycheck(id)),
  w(IPC.CREATE_PAYCHECK, (input) => repo.createPaycheck(input)),
  w(IPC.UPDATE_PAYCHECK, (id, input) => repo.updatePaycheck(id, input)),
  w(IPC.DELETE_PAYCHECK, (id) => repo.deletePaycheck(id)),

  // Debts — listDebts() applies pending interest, so it writes.
  w(IPC.LIST_DEBTS, () => repo.listDebts()),
  w(IPC.CREATE_DEBT, (input) => repo.createDebt(input)),
  w(IPC.UPDATE_DEBT, (id, input) => repo.updateDebt(id, input)),
  w(IPC.DELETE_DEBT, (id) => repo.deleteDebt(id)),

  // Expense categories
  r(IPC.LIST_EXPENSE_CATEGORIES, () => repo.listExpenseCategories()),
  w(IPC.CREATE_EXPENSE_CATEGORY, (input) => repo.createExpenseCategory(input)),
  w(IPC.UPDATE_EXPENSE_CATEGORY, (id, input) => repo.updateExpenseCategory(id, input)),
  w(IPC.DELETE_EXPENSE_CATEGORY, (id) => repo.deleteExpenseCategory(id)),

  // Expenses — listExpenses() materializes recurring templates, so it writes.
  w(IPC.LIST_EXPENSES, () => repo.listExpenses()),
  w(IPC.CREATE_EXPENSE, (input) => repo.createExpense(input)),
  w(IPC.UPDATE_EXPENSE, (id, input) => repo.updateExpense(id, input)),
  w(IPC.DELETE_EXPENSE, (id) => repo.deleteExpense(id)),

  // Recurring expenses
  r(IPC.LIST_RECURRING, () => repo.listRecurringExpenses()),
  w(IPC.CREATE_RECURRING, (input) => repo.createRecurringExpense(input)),
  w(IPC.UPDATE_RECURRING, (id, input) => repo.updateRecurringExpense(id, input)),
  w(IPC.DELETE_RECURRING, (id) => repo.deleteRecurringExpense(id)),

  // Registered accounts
  r(IPC.LIST_REGISTERED, () => repo.listRegisteredAccounts()),
  w(IPC.CREATE_REGISTERED, (input) => repo.createRegisteredAccount(input)),
  w(IPC.UPDATE_REGISTERED, (id, input) => repo.updateRegisteredAccount(id, input)),
  w(IPC.DELETE_REGISTERED, (id) => repo.deleteRegisteredAccount(id)),
  w(IPC.ADD_REGISTERED_CONTRIBUTION, (input) => repo.addRegisteredContribution(input)),
  w(IPC.DELETE_REGISTERED_CONTRIBUTION, (id) => repo.deleteRegisteredContribution(id)),

  // Budgets
  r(IPC.LIST_BUDGETS, () => repo.listExpenseBudgets()),
  w(IPC.SET_BUDGET, (categoryId, limit) => repo.setExpenseBudget(categoryId, limit)),

  // Dashboard / Reports / Calendar
  r(IPC.DASHBOARD, () => repo.dashboardSnapshot()),
  r(IPC.REPORT_CATEGORIES, (from, to) => repo.reportByCategory(from, to)),
  r(IPC.REPORT_MONTHLY, (months) => repo.reportMonthly(months)),
  r(IPC.REPORT_EXPENSES, (from, to) => repo.reportExpenses(from, to)),
  r(IPC.CALENDAR_EVENTS, (from, to) => repo.calendarEvents(from, to)),
];
