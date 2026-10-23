import { useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import AppIcon from '../ui/AppIcon';
import { BigButton } from '../ui/kit';
import FlowShell from './FlowShell';
import SetupFlow from './SetupFlow';

const POINTS: Array<{ emoji: string; title: string; text: string }> = [
  { emoji: '🧾', title: 'Bills come off the top', text: 'Recurring, debts and savings get their share first.' },
  { emoji: '💸', title: 'Know what’s safe to spend', text: 'What’s left, and how much that is per day.' },
  { emoji: '⚡', title: 'Log in seconds', text: 'Type “coffee 5, gas 50” and you’re done.' },
];

const rise = (i: number) => ({ animation: `fade-in-up 600ms cubic-bezier(0.16,1,0.3,1) ${100 + i * 120}ms both` });

/**
 * First run on the phone: one welcome screen that also asks your name, then
 * budget setup. No age or experience questions — the app is for a handful of
 * people who just want their monthly plan.
 */
export default function PhoneOnboarding() {
  const { userName, setUserName } = useTheme();
  const [screen, setScreen] = useState<'welcome' | 'setup'>('welcome');
  const [name, setName] = useState(userName === 'Kevin' ? '' : userName);

  if (screen === 'setup') {
    return <SetupFlow fresh onDone={() => {}} onExit={() => setScreen('welcome')} />;
  }

  const start = () => {
    if (!name.trim()) return;
    setUserName(name.trim());
    setScreen('setup');
  };

  return (
    <FlowShell
      footer={
        <BigButton icon={ArrowRight} disabled={!name.trim()} onClick={start}>
          Get started
        </BigButton>
      }
    >
      <div className="pt-[6vh] text-center">
        <div style={rise(0)}>
          <AppIcon size={88} className="mx-auto drop-shadow-xl" />
        </div>
        <h1 className="text-[30px] font-display font-bold mt-6 leading-tight" style={rise(1)}>
          Give every dollar a job
        </h1>
        <p className="text-content-muted mt-2 text-[17px]" style={rise(2)}>
          A monthly budget that tells you what’s safe to spend.
        </p>
      </div>
      <div className="mt-8 space-y-4">
        {POINTS.map((p, i) => (
          <div key={p.title} className="flex items-start gap-4" style={rise(3 + i)}>
            <span className="w-12 h-12 rounded-2xl bg-surface-2 border border-border grid place-items-center text-2xl shrink-0">
              {p.emoji}
            </span>
            <div className="pt-0.5">
              <div className="text-[17px] font-semibold">{p.title}</div>
              <div className="text-content-muted text-[15px] leading-snug">{p.text}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8" style={rise(6)}>
        <label htmlFor="welcome-name" className="text-[17px] font-semibold">
          What should we call you?
        </label>
        {/* No autofocus: the keyboard would cover the welcome on open. */}
        <input
          id="welcome-name"
          className="input text-lg mt-2 py-3.5 rounded-2xl"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          maxLength={40}
          autoComplete="given-name"
          enterKeyHint="go"
          onKeyDown={(e) => e.key === 'Enter' && start()}
        />
      </div>
    </FlowShell>
  );
}
