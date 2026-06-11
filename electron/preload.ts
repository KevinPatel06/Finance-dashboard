import { contextBridge, ipcRenderer } from 'electron';
import { IPC } from '../shared/ipc';

const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api = {
  settings: {
    get: () => invoke(IPC.GET_SETTINGS),
    update: (patch: Record<string, unknown>) => invoke(IPC.UPDATE_SETTINGS, patch),
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
    upcoming: (fromDate: string, toDate: string) =>
      invoke(IPC.UPCOMING_BILLS, fromDate, toDate),
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
  dashboard: {
    get: () => invoke(IPC.DASHBOARD),
  },
  reports: {
    categories: (fromDate: string, toDate: string) =>
      invoke(IPC.REPORT_CATEGORIES, fromDate, toDate),
    monthly: (months: number) => invoke(IPC.REPORT_MONTHLY, months),
    expenses: (fromDate: string, toDate: string) =>
      invoke(IPC.REPORT_EXPENSES, fromDate, toDate),
  },
  calendar: {
    events: (fromDate: string, toDate: string) =>
      invoke(IPC.CALENDAR_EVENTS, fromDate, toDate),
  },
  db: {
    backup: () => invoke(IPC.DB_BACKUP),
    restore: () => invoke(IPC.DB_RESTORE),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
