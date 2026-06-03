// Shared types between main (Electron) and renderer processes.

export type BillFrequency =
  | 'biweekly'
  | 'monthly'
  | 'semi_annual'
  | 'yearly'
  | 'custom_days';

export type AllocationKind = 'bill' | 'goal' | 'fun' | 'other';

export interface Category {
  id: number;
  name: string;
  color: string;
}

export interface Bill {
  id: number;
  name: string;
  amount: number;
  frequency: BillFrequency;
  custom_days?: number | null;
  anchor_date: string; // ISO YYYY-MM-DD
  category_id: number | null;
  autopay: 0 | 1;
  notes: string | null;
  archived: 0 | 1;
  created_at: string;
}

export interface BillInput {
  name: string;
  amount: number;
  frequency: BillFrequency;
  custom_days?: number | null;
  anchor_date: string;
  category_id: number | null;
  autopay: boolean;
  notes?: string | null;
}

export interface SavingsGoal {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  color: string;
  archived: 0 | 1;
  archived_at: string | null;
  created_at: string;
  // computed
  current_amount: number;
}

export interface SavingsGoalInput {
  name: string;
  target_amount: number;
  target_date?: string | null;
  color: string;
}

export interface Paycheck {
  id: number;
  date: string; // ISO YYYY-MM-DD
  amount: number;
  notes: string | null;
  created_at: string;
}

export interface PaycheckAllocation {
  id: number;
  paycheck_id: number;
  kind: AllocationKind;
  ref_id: number | null;
  amount: number;
  note: string | null;
}

export interface PaycheckAllocationInput {
  kind: AllocationKind;
  ref_id: number | null;
  amount: number;
  note?: string | null;
}

export interface PaycheckWithAllocations extends Paycheck {
  allocations: PaycheckAllocation[];
  totals: {
    bills: number;
    goals: number;
    fun: number;
    other: number;
    allocated: number;
    remainder: number;
  };
}

export type AccentColor =
  | 'emerald'
  | 'cyan'
  | 'orange'
  | 'pink'
  | 'red'
  | 'yellow'
  | 'purple';

export interface AppSettings {
  theme: 'light' | 'dark';
  pay_cadence: 'biweekly';
  next_paycheck_date: string | null; // ISO YYYY-MM-DD
  accent_color: AccentColor;
  user_name: string;
}

export interface BillToPay {
  bill: Bill;
  dueDate: string;
  category: Category | null;
  overdue: boolean;
}

/** A bill occurrence falling in the current calendar month, paid or not. */
export interface BillMonthItem {
  bill: Bill;
  dueDate: string;
  category: Category | null;
  overdue: boolean;
  paid: boolean;
}

export interface BillStatus {
  bill: Bill;
  category: Category | null;
  status: 'overdue' | 'due_soon' | 'ok';
  nextDueDate: string | null;
  overdueCount: number;
  overdueAmount: number;
}

export interface DashboardSnapshot {
  nextPaycheckDate: string | null;
  daysUntilNextPaycheck: number | null;
  billsThisMonth: BillMonthItem[];
  goalProgress: Array<{
    goal: SavingsGoal;
    pctComplete: number;
  }>;
  thisMonth: {
    income: number;
    billsPaid: number;
    savings: number;
    fun: number;
  };
  smoothedPerPaycheck: number; // sum of all bills normalized to a biweekly equivalent
  averageSavingsPerPaycheck: number; // historical avg: total goal allocations / number of logged paychecks
  paycheckCount: number;
}

// ---------- Expenses (self-contained; does not affect other sections) ----------
export interface ExpenseCategory {
  id: number;
  name: string;
  color: string;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  date: string; // ISO YYYY-MM-DD
  category_id: number | null;
  note: string | null;
  created_at: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  date: string;
  category_id: number | null;
  note?: string | null;
}

export interface ExpenseReport {
  totalSpent: number;
  count: number;
  byCategory: Array<{
    id: number | null;
    name: string;
    color: string;
    total: number;
  }>;
  overTime: Array<{ month: string; total: number }>;
  topPurchases: Array<{
    id: number;
    description: string;
    amount: number;
    date: string;
    categoryName: string;
    categoryColor: string;
  }>;
}
