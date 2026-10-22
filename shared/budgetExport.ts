import { differenceInMonths, parseISO } from 'date-fns';
import { PERIODS_PER_YEAR, periodRate } from './debtMath';
import { guaranteedPerMonth } from './paydays';
import type { CategoryKind, Debt, PayFrequency, RecurringFrequency, SavingsGoal } from './types';

/**
 * Builds the Markdown file the user hands to an AI of their choice (ChatGPT,
 * Claude, Gemini…) to get advice on splitting their monthly income. The app
 * itself has no AI; this is the bridge. One file, because a CSV can only hold
 * one table and the advice needs several plus the question itself.
 */

export interface ExportRecurring {
  description: string;
  amount: number;
  frequency: RecurringFrequency;
  interval_count: number;
}

export interface BudgetExportInput {
  userName: string;
  today: string;
  pay: { amount: number | null; frequency: PayFrequency };
  recurring: ExportRecurring[];
  debts: Debt[];
  funds: SavingsGoal[];
  categories: Array<{ name: string; kind: CategoryKind; avgMonthly: number }>;
}

const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const $ = (n: number) => money.format(n || 0);

const PAY_LABEL: Record<PayFrequency, string> = {
  weekly: 'every week',
  biweekly: 'every 2 weeks',
  semi_monthly: 'twice a month',
  monthly: 'once a month',
};

/** A recurring amount expressed per month. */
export function monthlyEquivalent(r: Pick<ExportRecurring, 'amount' | 'frequency' | 'interval_count'>): number {
  const n = Math.max(1, r.interval_count || 1);
  switch (r.frequency) {
    case 'weekly':
      return (r.amount * 52) / 12 / n;
    case 'biweekly':
      return (r.amount * 26) / 12 / n;
    case 'monthly':
      return r.amount / n;
    case 'yearly':
      return r.amount / 12 / n;
  }
}

function scheduleLabel(r: ExportRecurring): string {
  const n = Math.max(1, r.interval_count || 1);
  switch (r.frequency) {
    case 'weekly':
      return n === 1 ? 'every week' : `every ${n} weeks`;
    case 'biweekly':
      return `every ${2 * n} weeks`;
    case 'monthly':
      return n === 1 ? 'every month' : `every ${n} months`;
    case 'yearly':
      return n === 1 ? 'every year' : `every ${n} years`;
  }
}

/** The user's own share of a debt payment, per month. */
function debtPaymentPerMonth(d: Debt): number {
  const share = d.payment_amount / Math.max(1, d.split_count);
  return (share * PERIODS_PER_YEAR[d.payment_frequency]) / 12;
}

const DEBT_TYPE: Record<Debt['type'], string> = {
  credit_card: 'Credit card',
  mortgage: 'Mortgage',
  car_loan: 'Car loan',
  line_of_credit: 'Line of credit',
  loan: 'Loan',
};

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '_None_';
  const line = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, '/')).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function buildBudgetMarkdown(input: BudgetExportInput): string {
  const { pay } = input;
  const perMonth = guaranteedPerMonth(pay.frequency);
  const income = (pay.amount ?? 0) * perMonth;
  const fixed = input.recurring.reduce((s, r) => s + monthlyEquivalent(r), 0);
  const minDebt = input.debts.reduce((s, d) => s + debtPaymentPerMonth(d), 0);
  const available = income - fixed - minDebt;

  const payLine =
    pay.amount != null
      ? `My take-home pay is ${$(pay.amount)} ${PAY_LABEL[pay.frequency]}. I plan each month on the ` +
        `${perMonth} paycheck${perMonth > 1 ? 's' : ''} every month is guaranteed to get, so I budget ` +
        `${$(income)} a month (any extra paycheck is a bonus).`
      : `I haven't entered my pay yet — please ask me for it before suggesting amounts.`;

  const prompt = [
    `I use a monthly zero-based budget (1st to the end of the month). I live in Canada and amounts are in CAD.`,
    payLine,
    `My recurring expenses below are already taken off the top.`,
    `Please suggest how to split the rest: an amount for each debt (at least its current payment), an amount ` +
      `for each savings goal, and a monthly budget for each spending category marked Need or Want. Assign every ` +
      `dollar so the total equals what's available.`,
    `Explain your reasoning briefly, then give the plan as a table I can copy:`,
    '`Category | Need/Want | Monthly amount`',
  ].join('\n\n');

  const sections = [
    `# Budget plan for ${input.userName.trim() || 'me'}`,
    `_Exported ${input.today} from Finance Dashboard._`,
    prompt,
    `## Income`,
    table(
      ['Paycheck', 'How often', 'Paychecks planned per month', 'Monthly income planned'],
      pay.amount != null ? [[$(pay.amount), PAY_LABEL[pay.frequency], String(perMonth), $(income)]] : []
    ),
    `## Recurring expenses`,
    table(
      ['Name', 'Amount', 'How often', 'Per month'],
      input.recurring.map((r) => [r.description, $(r.amount), scheduleLabel(r), $(monthlyEquivalent(r))])
    ),
    `## Debts`,
    table(
      ['Name', 'Type', 'Balance', 'Interest rate', 'Current payment / month', 'Est. interest / month'],
      input.debts.map((d) => [
        d.name,
        DEBT_TYPE[d.type],
        $(d.current_balance),
        `${d.interest_rate}%${d.compounding === 'semi_annual' ? ' (compounded semi-annually)' : ''}`,
        $(debtPaymentPerMonth(d)),
        $(d.current_balance * periodRate(d.interest_rate, 'monthly', d.compounding)),
      ])
    ),
    `## Savings goals`,
    table(
      ['Goal', 'Target', 'Saved so far', 'Deadline', 'Needed per month'],
      input.funds.map((f) => {
        const left = Math.max(0, f.target_amount - f.current_amount);
        const months = f.target_date
          ? Math.max(1, differenceInMonths(parseISO(f.target_date), parseISO(input.today)))
          : null;
        return [
          f.name,
          $(f.target_amount),
          $(f.current_amount),
          f.target_date ?? 'No deadline',
          months ? $(left / months) : '—',
        ];
      })
    ),
    `## Spending categories`,
    table(
      ['Category', 'Need/Want', 'Average spent per month (last 3 months)'],
      input.categories.map((c) => [c.name, c.kind === 'need' ? 'Need' : 'Want', $(c.avgMonthly)])
    ),
    `## Summary`,
    table(
      ['', 'Per month'],
      [
        ['Income planned', $(income)],
        ['Recurring expenses', $(fixed)],
        ['Current debt payments', $(minDebt)],
        ['Left for savings and spending', $(available)],
      ]
    ),
  ];
  return sections.join('\n\n') + '\n';
}
