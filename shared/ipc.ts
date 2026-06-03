// IPC channel names — kept centralized so main + preload + renderer stay in sync.

export const IPC = {
  // Settings
  GET_SETTINGS: 'settings:get',
  UPDATE_SETTINGS: 'settings:update',

  // Categories
  LIST_CATEGORIES: 'categories:list',
  CREATE_CATEGORY: 'categories:create',
  UPDATE_CATEGORY: 'categories:update',
  DELETE_CATEGORY: 'categories:delete',

  // Bills
  LIST_BILLS: 'bills:list',
  CREATE_BILL: 'bills:create',
  UPDATE_BILL: 'bills:update',
  DELETE_BILL: 'bills:delete',
  UPCOMING_BILLS: 'bills:upcoming',
  BILLS_TO_PAY: 'bills:toPay',
  BILL_STATUSES: 'bills:statuses',

  // Goals
  LIST_GOALS: 'goals:list',
  LIST_ARCHIVED_GOALS: 'goals:listArchived',
  CREATE_GOAL: 'goals:create',
  UPDATE_GOAL: 'goals:update',
  DELETE_GOAL: 'goals:delete',
  RESTORE_GOAL: 'goals:restore',
  HARD_DELETE_GOAL: 'goals:hardDelete',

  // Paychecks
  LIST_PAYCHECKS: 'paychecks:list',
  GET_PAYCHECK: 'paychecks:get',
  CREATE_PAYCHECK: 'paychecks:create',
  UPDATE_PAYCHECK: 'paychecks:update',
  DELETE_PAYCHECK: 'paychecks:delete',

  // Dashboard
  DASHBOARD: 'dashboard:get',

  // Expense categories
  LIST_EXPENSE_CATEGORIES: 'expenseCategories:list',
  CREATE_EXPENSE_CATEGORY: 'expenseCategories:create',
  UPDATE_EXPENSE_CATEGORY: 'expenseCategories:update',
  DELETE_EXPENSE_CATEGORY: 'expenseCategories:delete',

  // Expenses
  LIST_EXPENSES: 'expenses:list',
  CREATE_EXPENSE: 'expenses:create',
  UPDATE_EXPENSE: 'expenses:update',
  DELETE_EXPENSE: 'expenses:delete',

  // Reports
  REPORT_CATEGORIES: 'reports:categories',
  REPORT_MONTHLY: 'reports:monthly',
  REPORT_EXPENSES: 'reports:expenses',

  // Calendar
  CALENDAR_EVENTS: 'calendar:events',

  // DB management
  DB_BACKUP: 'db:backup',
  DB_RESTORE: 'db:restore',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
