import { ipcMain, dialog, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { IPC } from '../../shared/ipc';
import { getDb, getDbPath } from '../db';
import * as repo from '../db/repo';

export function registerIpcHandlers() {
  // ---------- Settings ----------
  ipcMain.handle(IPC.GET_SETTINGS, () => repo.getSettings());
  ipcMain.handle(IPC.UPDATE_SETTINGS, (_e, patch) => repo.updateSettings(patch));

  // ---------- Categories ----------
  ipcMain.handle(IPC.LIST_CATEGORIES, () => repo.listCategories());
  ipcMain.handle(IPC.CREATE_CATEGORY, (_e, input) => repo.createCategory(input));
  ipcMain.handle(IPC.UPDATE_CATEGORY, (_e, id, input) => repo.updateCategory(id, input));
  ipcMain.handle(IPC.DELETE_CATEGORY, (_e, id) => repo.deleteCategory(id));

  // ---------- Bills ----------
  ipcMain.handle(IPC.LIST_BILLS, () => repo.listBills());
  ipcMain.handle(IPC.CREATE_BILL, (_e, input) => repo.createBill(input));
  ipcMain.handle(IPC.UPDATE_BILL, (_e, id, input) => repo.updateBill(id, input));
  ipcMain.handle(IPC.DELETE_BILL, (_e, id) => repo.deleteBill(id));
  ipcMain.handle(IPC.UPCOMING_BILLS, (_e, fromDate, toDate) =>
    repo.upcomingBills(fromDate, toDate)
  );
  ipcMain.handle(IPC.BILLS_TO_PAY, (_e, windowEnd) => repo.billsToPay(windowEnd));
  ipcMain.handle(IPC.BILL_STATUSES, () => repo.billStatuses());

  // ---------- Goals ----------
  ipcMain.handle(IPC.LIST_GOALS, () => repo.listGoals());
  ipcMain.handle(IPC.LIST_ARCHIVED_GOALS, () => repo.listArchivedGoals());
  ipcMain.handle(IPC.CREATE_GOAL, (_e, input) => repo.createGoal(input));
  ipcMain.handle(IPC.UPDATE_GOAL, (_e, id, input) => repo.updateGoal(id, input));
  ipcMain.handle(IPC.DELETE_GOAL, (_e, id) => repo.deleteGoal(id));
  ipcMain.handle(IPC.RESTORE_GOAL, (_e, id) => repo.restoreGoal(id));
  ipcMain.handle(IPC.HARD_DELETE_GOAL, (_e, id) => repo.hardDeleteGoal(id));

  // ---------- Paychecks ----------
  ipcMain.handle(IPC.LIST_PAYCHECKS, () => repo.listPaychecks());
  ipcMain.handle(IPC.GET_PAYCHECK, (_e, id) => repo.getPaycheck(id));
  ipcMain.handle(IPC.CREATE_PAYCHECK, (_e, input) => repo.createPaycheck(input));
  ipcMain.handle(IPC.UPDATE_PAYCHECK, (_e, id, input) => repo.updatePaycheck(id, input));
  ipcMain.handle(IPC.DELETE_PAYCHECK, (_e, id) => repo.deletePaycheck(id));

  // ---------- Expense categories ----------
  ipcMain.handle(IPC.LIST_EXPENSE_CATEGORIES, () => repo.listExpenseCategories());
  ipcMain.handle(IPC.CREATE_EXPENSE_CATEGORY, (_e, input) => repo.createExpenseCategory(input));
  ipcMain.handle(IPC.UPDATE_EXPENSE_CATEGORY, (_e, id, input) =>
    repo.updateExpenseCategory(id, input)
  );
  ipcMain.handle(IPC.DELETE_EXPENSE_CATEGORY, (_e, id) => repo.deleteExpenseCategory(id));

  // ---------- Expenses ----------
  ipcMain.handle(IPC.LIST_EXPENSES, () => repo.listExpenses());
  ipcMain.handle(IPC.CREATE_EXPENSE, (_e, input) => repo.createExpense(input));
  ipcMain.handle(IPC.UPDATE_EXPENSE, (_e, id, input) => repo.updateExpense(id, input));
  ipcMain.handle(IPC.DELETE_EXPENSE, (_e, id) => repo.deleteExpense(id));

  // ---------- Dashboard / Reports / Calendar ----------
  ipcMain.handle(IPC.DASHBOARD, () => repo.dashboardSnapshot());
  ipcMain.handle(IPC.REPORT_CATEGORIES, (_e, fromDate, toDate) =>
    repo.reportByCategory(fromDate, toDate)
  );
  ipcMain.handle(IPC.REPORT_MONTHLY, (_e, months) => repo.reportMonthly(months));
  ipcMain.handle(IPC.REPORT_EXPENSES, (_e, fromDate, toDate) =>
    repo.reportExpenses(fromDate, toDate)
  );
  ipcMain.handle(IPC.CALENDAR_EVENTS, (_e, fromDate, toDate) =>
    repo.calendarEvents(fromDate, toDate)
  );

  // ---------- DB backup/restore ----------
  ipcMain.handle(IPC.DB_BACKUP, async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Backup Finance Database',
      defaultPath: `finance-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite DB', extensions: ['db'] }],
    });
    if (canceled || !filePath) return { ok: false };
    const db = getDb();
    await db.backup(filePath);
    return { ok: true, path: filePath };
  });

  ipcMain.handle(IPC.DB_RESTORE, async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Restore Finance Database',
      filters: [{ name: 'SQLite DB', extensions: ['db'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return { ok: false };
    const src = filePaths[0];
    const dest = getDbPath();
    // Copy file then signal renderer to reload — the app must be restarted to re-init DB.
    fs.copyFileSync(src, dest);
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });
}
