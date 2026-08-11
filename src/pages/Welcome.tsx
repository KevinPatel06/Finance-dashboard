import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Moon, Plus, Sparkles, Sun, Target, Trash2 } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { ACCENT_LABELS, ACCENT_SWATCH } from '@/lib/accents';
import { GOAL_PALETTE } from '@/lib/palette';
import { cn } from '@/lib/utils';
import { fmtMoney } from '@/lib/format';
import type { AccentColor } from '@shared/types';

/**
 * First-run setup. Shown only when `onboarded` is false, which migration v12
 * decides once from whether the database already holds any data — so an
 * existing install never sees this.
 *
 * Theme and accent are applied live as they're picked, so the choice is
 * previewed on the real UI rather than a swatch.
 */

type DraftGoal = { name: string; target: number; color: string };

const STEPS = ['You', 'Appearance', 'Paycheck', 'Goals'] as const;

export default function Welcome() {
  const { theme, setTheme, accent, setAccent, setUserName, completeOnboarding } = useTheme();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [goals, setGoals] = useState<DraftGoal[]>([]);
  const [saving, setSaving] = useState(false);

  const accents = Object.keys(ACCENT_LABELS) as AccentColor[];
  const trimmedName = name.trim();
  const canAdvance = step !== 0 || trimmedName.length > 0;

  const finish = async () => {
    setSaving(true);
    try {
      if (trimmedName) setUserName(trimmedName);
      await window.api.settings.update({ next_paycheck_date: payDate || null });
      // Sequential on purpose: these are tiny inserts and ordering keeps the
      // goal list in the order they were entered.
      for (const g of goals) {
        await window.api.goals.create({
          name: g.name,
          target_amount: g.target,
          target_date: null,
          color: g.color,
        });
      }
    } finally {
      // Even if a write failed, don't trap the user on this screen — everything
      // here is editable later in Settings and Goals.
      completeOnboarding();
    }
  };

  return (
    <div className="app-shell h-full overflow-y-auto bg-surface text-content">
      <div className="min-h-full flex flex-col max-w-md mx-auto px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-brand to-brand-hover grid place-items-center text-white dark:text-slate-950 shadow-soft shrink-0">
            <Sparkles size={20} />
          </div>
          <div className="leading-tight">
            <div className="font-display font-semibold">Finance Dashboard</div>
            <div className="text-xs text-content-subtle">Let's get you set up — takes a minute.</div>
          </div>
        </div>

        {/* Progress */}
        <div className="flex gap-1.5 mb-7">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={cn(
                  'h-1 rounded-full transition-colors',
                  i <= step ? 'bg-brand' : 'bg-surface-3'
                )}
              />
              <div
                className={cn(
                  'mt-1.5 text-[10px] font-medium',
                  i === step ? 'text-content' : 'text-content-subtle'
                )}
              >
                {label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1">
          {step === 0 && (
            <Step
              title="What should we call you?"
              hint="Used on your dashboard and the window title. You can change it later."
            >
              <input
                className="input text-base"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && trimmedName) setStep(1);
                }}
              />
            </Step>
          )}

          {step === 1 && (
            <Step title="Pick your look" hint="Applies instantly — try a few.">
              <div className="grid grid-cols-2 gap-2 mb-5">
                <ThemeCard
                  active={theme === 'light'}
                  onClick={() => setTheme('light')}
                  icon={<Sun size={18} />}
                  label="Light"
                />
                <ThemeCard
                  active={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                  icon={<Moon size={18} />}
                  label="Dark"
                />
              </div>
              <div className="label">Accent color</div>
              <div className="grid grid-cols-4 gap-2">
                {accents.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAccent(a)}
                    className={cn(
                      'rounded-xl border p-2 flex flex-col items-center gap-1.5 transition',
                      accent === a ? 'border-content/30 bg-surface-3' : 'border-border bg-surface-2'
                    )}
                  >
                    <span
                      className="w-7 h-7 rounded-lg shadow-soft grid place-items-center text-white"
                      style={{ backgroundColor: ACCENT_SWATCH[a] }}
                    >
                      {accent === a && <Check size={14} />}
                    </span>
                    <span className="text-[10px] text-content-muted">{ACCENT_LABELS[a]}</span>
                  </button>
                ))}
              </div>
            </Step>
          )}

          {step === 2 && (
            <Step
              title="When's your next paycheck?"
              hint="Everything here runs on a biweekly cycle. This sets the starting point — it rolls forward automatically each time you log one."
            >
              <input
                type="date"
                className="input text-base"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </Step>
          )}

          {step === 3 && (
            <Step
              title="Saving toward anything?"
              hint="Optional — add as many as you like, or skip and do it later."
            >
              <GoalDraftEditor goals={goals} onChange={setGoals} />
            </Step>
          )}
        </div>

        {/* Nav */}
        <div className="flex gap-2 mt-8">
          {step > 0 && (
            <button className="btn-outline" onClick={() => setStep(step - 1)} disabled={saving}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              className="btn-primary flex-1"
              onClick={() => setStep(step + 1)}
              disabled={!canAdvance}
            >
              Continue <ArrowRight size={16} />
            </button>
          ) : (
            <button className="btn-primary flex-1" onClick={finish} disabled={saving}>
              {saving ? 'Setting up…' : goals.length > 0 ? 'Finish' : 'Skip & finish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Step({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="animate-fade-in">
      <h1 className="text-xl font-display font-semibold tracking-tight">{title}</h1>
      {hint && <p className="text-sm text-content-muted mt-1.5 mb-5">{hint}</p>}
      {children}
    </div>
  );
}

function ThemeCard({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-xl border p-4 flex flex-col items-center gap-2 transition',
        active ? 'border-brand bg-brand-soft/40 text-brand' : 'border-border bg-surface-2'
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}

/** Collects goals in local state; nothing is written until Finish. */
function GoalDraftEditor({
  goals,
  onChange,
}: {
  goals: DraftGoal[];
  onChange: (next: DraftGoal[]) => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const amount = Number(target);
  const canAdd = name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  const add = () => {
    if (!canAdd) return;
    onChange([
      ...goals,
      {
        name: name.trim(),
        target: amount,
        // Cycle the palette so consecutive goals don't come out the same colour.
        color: GOAL_PALETTE[goals.length % GOAL_PALETTE.length],
      },
    ]);
    setName('');
    setTarget('');
  };

  return (
    <div className="space-y-3">
      {goals.length > 0 && (
        <div className="card divide-y divide-border overflow-hidden">
          {goals.map((g, i) => (
            <div key={`${g.name}-${i}`} className="flex items-center gap-3 px-4 py-3">
              <span
                className="w-9 h-9 rounded-full grid place-items-center text-white shrink-0"
                style={{ backgroundColor: g.color }}
              >
                <Target size={16} />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-sm font-medium truncate">{g.name}</div>
                <div className="text-xs text-content-subtle num">{fmtMoney(g.target)}</div>
              </div>
              <button
                className="btn-ghost p-2 hover:text-danger shrink-0"
                onClick={() => onChange(goals.filter((_, j) => j !== i))}
                aria-label={`Remove ${g.name}`}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 space-y-2">
        <input
          className="input text-base"
          placeholder="Goal name — e.g. Emergency fund"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input text-base"
            inputMode="decimal"
            placeholder="Target amount"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add();
            }}
          />
          <button className="btn-outline shrink-0" onClick={add} disabled={!canAdd}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>
    </div>
  );
}
