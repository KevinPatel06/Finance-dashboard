import { useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { BigButton } from '../ui/kit';
import FlowShell from './FlowShell';
import SetupFlow from './SetupFlow';

/** Highlighted words in the intro copy. */
const Hi = ({ children }: { children: ReactNode }) => <span className="text-brand font-bold">{children}</span>;

/**
 * First run on the phone: two intro screens, your name, then budget setup.
 * No age or experience questions — the app is for a handful of people who
 * just want their monthly plan.
 */
export default function PhoneOnboarding() {
  const { userName, setUserName } = useTheme();
  const [screen, setScreen] = useState<'intro1' | 'intro2' | 'name' | 'setup'>('intro1');
  const [name, setName] = useState(userName === 'Kevin' ? '' : userName);

  if (screen === 'setup') {
    return <SetupFlow fresh onDone={() => {}} onExit={() => setScreen('name')} />;
  }

  if (screen === 'name') {
    return (
      <FlowShell
        footer={
          <BigButton
            icon={ArrowRight}
            disabled={!name.trim()}
            onClick={() => {
              setUserName(name.trim());
              setScreen('setup');
            }}
          >
            Continue
          </BigButton>
        }
      >
        <div className="pt-[18vh]">
          <div className="text-content-muted">first things first</div>
          <h1 className="text-[30px] font-display font-bold mt-1">What should we call you?</h1>
          <input
            className="input text-lg mt-6 py-3.5 rounded-2xl"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoFocus
            maxLength={40}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                setUserName(name.trim());
                setScreen('setup');
              }
            }}
          />
        </div>
      </FlowShell>
    );
  }

  const lines =
    screen === 'intro1'
      ? [
          <>
            ever wonder where all your <Hi>money</Hi> goes?
          </>,
          <>
            payday comes, payday goes —
            <br />
            <Hi>almost gone</Hi> by the end of the month
          </>,
          <>
            coffee, takeout, subscriptions
            <br />
            things you <Hi>can't even recall</Hi>
          </>,
          <>
            what you can <Hi>see</Hi>, you can <Hi>plan</Hi>
          </>,
        ]
      : [
          <>
            give every dollar <Hi>a job</Hi>
          </>,
          <>
            recurring bills come <Hi>off the top</Hi>
            <br />
            savings and debts get <Hi>their share</Hi>
          </>,
          <>
            what's left is <Hi>safe to spend</Hi>
            <br />
            and we'll tell you how much, per day
          </>,
        ];

  return (
    <button
      className="app-shell h-full w-full flex flex-col bg-surface text-content text-left"
      onClick={() => setScreen(screen === 'intro1' ? 'intro2' : 'name')}
    >
      <div className="flex-1 flex flex-col justify-center max-w-xl w-full mx-auto px-6 space-y-9">
        {lines.map((l, i) => (
          <p
            key={i}
            className={i === 0 ? 'text-[30px] leading-tight font-display' : 'text-[22px] leading-snug'}
            style={{ animation: `fade-in-up 600ms cubic-bezier(0.16,1,0.3,1) ${150 + i * 350}ms both` }}
          >
            {l}
          </p>
        ))}
      </div>
      <div className="max-w-xl w-full mx-auto px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] flex justify-end items-center gap-2 text-[17px] font-medium">
        Tap to continue <ArrowRight size={20} />
      </div>
    </button>
  );
}
