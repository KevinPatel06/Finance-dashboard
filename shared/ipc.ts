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

  // Debts
  LIST_DEBTS: 'debts:list',
  CREATE_DEBT: 'debts:create',
  UPDATE_DEBT: 'debts:update',
  DELETE_DEBT: 'debts:delete',

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

  // Recurring expenses
  LIST_RECURRING: 'recurring:list',
  CREATE_RECURRING: 'recurring:create',
  UPDATE_RECURRING: 'recurring:update',
  DELETE_RECURRING: 'recurring:delete',

  // Registered accounts (RRSP / TFSA / FHSA)
  LIST_REGISTERED: 'registered:list',
  CREATE_REGISTERED: 'registered:create',
  UPDATE_REGISTERED: 'registered:update',
  DELETE_REGISTERED: 'registered:delete',
  ADD_REGISTERED_CONTRIBUTION: 'registered:addContribution',
  DELETE_REGISTERED_CONTRIBUTION: 'registered:deleteContribution',

  // Budgets (legacy per-category monthly caps)
  LIST_BUDGETS: 'budgets:list',
  SET_BUDGET: 'budgets:set',

  // Monthly budget (phone)
  BUDGET_MONTH: 'budget:month',
  BUDGET_SET_LINE: 'budget:setLine',
  BUDGET_REMOVE_LINE: 'budget:removeLine',
  BUDGET_SAVE_PLAN: 'budget:savePlan',
  BUDGET_CONFIRM: 'budget:confirm',

  // Payday check-ins
  PAYDAY_CONFIRM: 'paydays:confirm',
  PAYDAY_SNOOZE: 'paydays:snooze',

  // Funds (money in/out from outside the budget)
  FUND_ADD_TX: 'funds:addTransaction',
  FUND_DELETE_TX: 'funds:deleteTransaction',
  FUND_ACTIVITY: 'funds:activity',

  IMPORT_BILLS_RECURRING: 'recurring:importBills',

  // Reports
  REPORT_CATEGORIES: 'reports:categories',
  REPORT_MONTHLY: 'reports:monthly',
  REPORT_EXPENSES: 'reports:expenses',
  REPORT_WEEKLY: 'reports:weekly',

  // Calendar
  CALENDAR_EVENTS: 'calendar:events',

  // DB management
  DB_BACKUP: 'db:backup',
  DB_RESTORE: 'db:restore',

  // File export
  EXPORT_CSV: 'files:exportCsv',
  EXPORT_TEXT: 'files:exportText',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
