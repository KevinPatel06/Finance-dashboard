import { useState } from 'react';
import { format, parseISO, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { Copy, Share2 } from 'lucide-react';
import type {
  AppSettings,
  Debt,
  ExpenseCategory,
  ExpenseReport,
  RecurringExpense,
  SavingsGoal,
} from '@shared/types';
import { buildBudgetMarkdown } from '@shared/budgetExport';
import { useTheme } from '@/lib/theme';
import { useToast } from '@/lib/ui';
import { todayIso } from '../dates';
import { PCard } from '../ui/kit';

/** Gathers everything the AI needs and builds the Markdown file. */
export async function buildExport(userName: string): Promise<string> {
  const [settings, recurring, debts, funds, categories] = (await Promise.all([
    window.api.settings.get(),
    window.api.recurringExpenses.list(),
    window.api.debts.list(),
    window.api.goals.list(),
    window.api.expenseCategories.list(),
  ])) as [AppSettings, RecurringExpense[], Debt[], SavingsGoal[], ExpenseCategory[]];

  // Average spend per category over the last three full months.
  const today = parseISO(todayIso());
  const from = format(startOfMonth(subMonths(today, 3)), 'yyyy-MM-dd');
  const to = format(endOfMonth(subMonths(today, 1)), 'yyyy-MM-dd');
  const report = (await window.api.reports.expenses(from, to)) as ExpenseReport;
  const byName = new Map(report.byCategory.map((c) => [c.name, c.total]));

  return buildBudgetMarkdown({
    userName,
    today: todayIso(),
    pay: { amount: settings.pay_amount, frequency: settings.pay_frequency },
    recurring,
    debts,
    funds,
    categories: categories.map((c) => ({ name: c.name, kind: c.kind, avgMonthly: (byName.get(c.name) ?? 0) / 3 })),
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older WebViews: fall back to a hidden textarea + execCommand.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/**
 * "Get advice from your AI": share or copy a Markdown summary of pay,
 * recurring costs, debts and funds, with a ready-written question on top.
 */
export default function ExportPanel() {
  const { userName } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const run = async (how: 'share' | 'copy') => {
    setBusy(true);
    try {
      const md = await buildExport(userName);
      setPreview(md);
      if (how === 'copy') {
        if (await copyText(md)) toast.success('Copied — paste it into your AI chat.');
        else toast.error('Could not copy. Use Share instead.');
      } else {
        const res = (await window.api.files.exportText(`my-budget-${todayIso()}.md`, md)) as { ok: boolean };
        if (res.ok && __PLATFORM__ !== 'ios') toast.success('Saved.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PCard className="p-5">
        <div className="text-4xl mb-3">✨</div>
        <p className="text-[15px] leading-relaxed text-content-muted">
          This app doesn't use AI itself. Instead, it can hand your numbers to the AI you already use —
          <span className="text-content font-medium"> ChatGPT, Claude or Gemini</span>. You get one file with your
          pay, recurring costs, debts (with the interest they cost each month) and savings goals, plus a question
          asking how to split your money.
        </p>
        <p className="text-sm text-content-subtle mt-3">
          Then type the amounts it suggests into your plan. Nothing is sent anywhere unless you share it.
        </p>
      </PCard>

      <div className="grid grid-cols-2 gap-3">
        <button
          disabled={busy}
          onClick={() => void run('share')}
          className="rounded-[20px] bg-content text-surface py-4 flex flex-col items-center gap-1.5 font-semibold disabled:opacity-50 active:scale-[0.98]"
        >
          <Share2 size={22} />
          Share file
        </button>
        <button
          disabled={busy}
          onClick={() => void run('copy')}
          className="rounded-[20px] bg-surface-2 border border-border py-4 flex flex-col items-center gap-1.5 font-semibold disabled:opacity-50 active:scale-[0.98]"
        >
          <Copy size={22} />
          Copy text
        </button>
      </div>

      {preview && (
        <PCard className="p-4">
          <div className="text-xs font-medium text-content-subtle mb-2">Preview</div>
          <pre className="text-[11px] leading-snug whitespace-pre-wrap font-mono text-content-muted max-h-72 overflow-y-auto">
            {preview}
          </pre>
        </PCard>
      )}
    </div>
  );
}
