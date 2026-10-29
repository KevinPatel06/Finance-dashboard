// Shared types between main (Electron) and renderer processes.

export type BillFrequency =
  | 'biweekly'
  | 'monthly'
  | 'semi_annual'
  | 'yearly'
  | 'custom_days';

export type AllocationKind = 'bill' | 'goal' | 'fun' | 'other' | 'debt';

/** How often the user is paid. Drives payday enumeration and monthly income. */
export type PayFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';

/** Whether a spending category is an essential (need) or discretionary (want). */
export type CategoryKind = 'need' | 'want';

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
  /** 1 = completed, 2 = deleted (kept so its history stands; never listed). */
  archived: 0 | 1 | 2;
  archived_at: string | null;
  created_at: string;
  emoji: string | null;
  // computed
  current_amount: number;
}

export interface SavingsGoalInput {
  name: string;
  target_amount: number;
  target_date?: string | null;
  color: string;
  emoji?: string | null;
}

export interface Paycheck {
  id: number;
  date: string; // ISO YYYY-MM-DD
  amount: number;
  notes: string | null;
  created_at: string;
  /** The scheduled payday a check-in fulfils; null for legacy / ad-hoc paychecks. */
  payday: string | null;
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
    debt: number;
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

/** Which composition the phone home screen uses. Desktop ignores this. */
export type MobileHomeLayout = 'hero_actions' | 'hero_stats' | 'hero_tabs';

export const MOBILE_HOME_LAYOUTS: readonly MobileHomeLayout[] = [
  'hero_actions',
  'hero_stats',
  'hero_tabs',
];

export interface AppSettings {
  theme: 'light' | 'dark';
  pay_cadence: 'biweekly';
  next_paycheck_date: string | null; // ISO YYYY-MM-DD
  accent_color: AccentColor;
  user_name: string;
  mobile_home_layout: MobileHomeLayout;
  /** False only on a genuinely fresh install — gates the welcome flow. */
  onboarded: boolean;
  // Desktop notification preferences (Phase 2 reminders).
  notify_enabled: boolean;
  notify_bill_lead_days: number; // warn this many days before a bill is due
  notify_paycheck: boolean;
  notify_budget: boolean;
  // Monthly budget (phone).
  pay_amount: number | null; // take-home per paycheck; null until set
  pay_frequency: PayFrequency;
  notify_daily_log: boolean; // daily "log today's expenses" reminder
  notify_daily_time: string; // 'HH:mm', local
  notify_new_month: boolean;
  notify_weekly_report: boolean;
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

// ---------- Debts / Payoff (self-contained; does not affect other sections) ----------
export type DebtType = 'credit_card' | 'mortgage' | 'car_loan' | 'line_of_credit' | 'loan';
export type DebtFrequency = 'weekly' | 'biweekly' | 'semi_monthly' | 'monthly';
/** 'semi_annual' = Canadian mortgage convention (compounded twice yearly, not in advance). */
export type DebtCompounding = 'monthly' | 'semi_annual';

export interface Debt {
  id: number;
  name: string;
  type: DebtType;
  original_amount: number; // what was borrowed/financed (0 = unknown/not applicable)
  current_balance: number;
  interest_rate: number; // annual %, e.g. 19.99
  payment_amount: number; // full payment per cycle (before splitting)
  payment_frequency: DebtFrequency;
  split_count: number; // people splitting the payment (>=1)
  interest_day: number | null; // day of month interest is charged (revolving debts)
  last_interest_applied: string | null; // ISO date of the last auto-applied charge
  compounding: DebtCompounding;
  notes: string | null;
  archived: 0 | 1;
  created_at: string;
}

export interface DebtInput {
  name: string;
  type: DebtType;
  original_amount: number;
  current_balance: number;
  interest_rate: number;
  payment_amount: number;
  payment_frequency: DebtFrequency;
  split_count: number;
  interest_day?: number | null;
  compounding?: DebtCompounding;
  notes?: string | null;
}

// ---------- Expenses (self-contained; does not affect other sections) ----------
export interface ExpenseCategory {
  id: number;
  name: string;
  color: string;
  emoji: string | null;
  kind: CategoryKind;
  sort_order: number | null;
}

export interface ExpenseCategoryInput {
  name: string;
  color: string;
  emoji?: string | null;
  kind?: CategoryKind;
  sort_order?: number | null;
}

export interface BudgetStatus {
  category_id: number;
  name: string;
  color: string;
  monthly_limit: number;
  spent: number; // current calendar month
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  date: string; // ISO YYYY-MM-DD
  category_id: number | null;
  note: string | null;
  debt_id: number | null; // credit card this purchase was charged to
  fund_id: number | null; // "paid from fund" — comes out of the fund, not the budget
  recurring_id: number | null; // set when generated from a recurring template
  created_at: string;
}

export interface ExpenseInput {
  description: string;
  amount: number;
  date: string;
  category_id: number | null;
  note?: string | null;
  debt_id?: number | null;
  fund_id?: number | null;
}

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

export interface RecurringExpense {
  id: number;
  description: string;
  amount: number;
  category_id: number | null;
  debt_id: number | null;
  frequency: RecurringFrequency;
  anchor_date: string; // ISO YYYY-MM-DD — first occurrence
  last_generated: string | null;
  archived: number; // 1 = paused
  created_at: string;
  interval_count: number; // every N weeks / months / years
  emoji: string | null;
}

export interface RecurringExpenseInput {
  description: string;
  amount: number;
  category_id: number | null;
  debt_id?: number | null;
  frequency: RecurringFrequency;
  anchor_date: string;
  interval_count?: number;
  emoji?: string | null;
  /** true pauses the template; false resumes it without back-filling. */
  archived?: boolean;
}

export type RegisteredKind = 'rrsp' | 'tfsa' | 'fhsa';

export interface RegisteredContribution {
  id: number;
  account_id: number;
  amount: number;
  date: string; // ISO YYYY-MM-DD
  note: string | null;
  created_at: string;
}

export interface RegisteredAccount {
  id: number;
  kind: RegisteredKind;
  label: string;
  contribution_room: number;
  notes: string | null;
  archived: number;
  created_at: string;
  // Computed
  contributed: number;
  remaining: number;
  contributions: RegisteredContribution[];
}

export interface RegisteredAccountInput {
  kind: RegisteredKind;
  label: string;
  contribution_room: number;
  notes?: string | null;
}

export interface RegisteredContributionInput {
  account_id: number;
  amount: number;
  date: string;
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

// ---------- Monthly budget (phone) ----------
export type BudgetLineKind = 'spend' | 'fund' | 'debt';

/** Money moved into or out of a fund from outside the budget. */
export interface FundTransaction {
  id: number;
  goal_id: number;
  kind: 'deposit' | 'withdrawal';
  amount: number; // always positive; kind gives the direction
  date: string;
  note: string | null;
  created_at: string;
}

/** One line of a fund's history, newest first. `amount` is signed. */
export interface FundActivityItem {
  id: string; // unique across sources, e.g. 'tx:4', 'line:12', 'exp:30', 'pay:7'
  date: string;
  kind: 'contribution' | 'deposit' | 'withdrawal' | 'spend' | 'paycheck';
  amount: number;
  label: string;
  /** The fund_transactions id for deposits/withdrawals (deletable); otherwise null. */
  ref_id: number | null;
}

export type MonthStatus = 'none' | 'draft' | 'confirmed';
export type PaceStatus = 'on_track' | 'fast' | 'over';

/** A scheduled payday and what (if anything) was confirmed for it. */
export interface Payday {
  date: string;
  kind: 'regular' | 'bonus';
  expected: number;
  paycheck: { id: number; amount: number } | null;
  /** The user tapped "Not yet" today. */
  snoozed: boolean;
}

/** One occurrence of a recurring template inside a month. */
export interface RecurringOccurrence {
  recurring_id: number | null; // null for a logged charge whose template was deleted
  description: string;
  emoji: string | null;
  amount: number;
  date: string;
  category_id: number | null;
  logged: boolean;
}

export interface SpendLineView {
  category_id: number;
  name: string;
  emoji: string | null;
  color: string;
  kind: CategoryKind;
  amount: number;
  spent: number;
  left: number;
}

export interface FundLineView {
  goal_id: number;
  name: string;
  emoji: string | null;
  color: string;
  amount: number;
  balance: number;
  target: number;
}

export interface DebtLineView {
  debt_id: number;
  name: string;
  type: DebtType;
  amount: number;
  balance: number;
}

/** Everything the phone's Budget screen needs for one month. */
export interface BudgetMonthView {
  month: string; // 'YYYY-MM'
  status: MonthStatus;
  today: string;
  daysInMonth: number;
  /** Days remaining including today (0 for a past month, all for a future one). */
  daysLeft: number;
  paydays: Payday[];
  /** Unconfirmed, unsnoozed paydays from the last 14 days (any month). */
  pendingPaydays: Payday[];
  income: number;
  recurring: { items: RecurringOccurrence[]; total: number };
  lines: { spend: SpendLineView[]; fund: FundLineView[]; debt: DebtLineView[] };
  planned: { spend: number; fund: number; debt: number; needs: number; wants: number };
  leftToAllocate: number;
  spent: { total: number; needs: number; wants: number };
  leftToSpend: number;
  needsLeft: number;
  wantsLeft: number;
  safePerDay: number;
  pace: PaceStatus;
  wantsEatingNeeds: boolean;
  unbudgeted: Array<{
    category_id: number | null;
    name: string;
    emoji: string | null;
    color: string;
    kind: CategoryKind;
    spent: number;
  }>;
}

export interface PlanLineInput {
  kind: BudgetLineKind;
  ref_id: number;
  amount: number;
}

/** A Monday–Sunday recap of everyday spending (no recurring, no fund purchases). */
export interface WeeklyReport {
  weekStart: string; // Monday
  weekEnd: string; // Sunday
  total: number;
  previousTotal: number;
  changePct: number | null; // null when last week had no spending
  dailyAverage: number;
  weeks: Array<{ weekStart: string; total: number }>; // last 4, oldest first
  biggestDay: { date: string; total: number } | null;
  byCategory: Array<{
    category_id: number | null;
    name: string;
    emoji: string | null;
    color: string;
    total: number;
    previous: number;
  }>;
  fundsAdded: number;
  insights: string[];
}
