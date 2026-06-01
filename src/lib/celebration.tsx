import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import confetti from 'canvas-confetti';
import { useNavigate } from 'react-router-dom';
import { PartyPopper } from 'lucide-react';
import type { SavingsGoal } from '@shared/types';

const STORAGE_KEY = 'kfa.celebratedGoalIds';

function readCelebrated(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v) => typeof v === 'number'));
  } catch {
    return new Set();
  }
}

function writeCelebrated(s: Set<number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s)));
}

interface CelebrationCtx {
  /** Check all goals; if any newly hit 100%, queue a celebration. */
  checkForCompletions: () => Promise<void>;
}

const Ctx = createContext<CelebrationCtx | null>(null);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<{ id: number; name: string }[]>([]);
  const [active, setActive] = useState<{ id: number; name: string } | null>(null);
  const fireRef = useRef<number | null>(null);

  const checkForCompletions = useCallback(async () => {
    try {
      const goals = (await window.api.goals.list()) as SavingsGoal[];
      const celebrated = readCelebrated();
      const newly: { id: number; name: string }[] = [];
      for (const g of goals) {
        if (g.archived) continue;
        if (g.target_amount <= 0) continue;
        if (g.current_amount < g.target_amount) continue;
        if (celebrated.has(g.id)) continue;
        celebrated.add(g.id);
        newly.push({ id: g.id, name: g.name });
      }
      if (newly.length) {
        writeCelebrated(celebrated);
        setQueue((prev) => [...prev, ...newly]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Promote next queued item to active
  useEffect(() => {
    if (!active && queue.length > 0) {
      setActive(queue[0]);
      setQueue((prev) => prev.slice(1));
    }
  }, [active, queue]);

  // Fire confetti while a celebration is active
  useEffect(() => {
    if (!active) return;
    const duration = 2500;
    const end = Date.now() + duration;
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#a855f7', '#22d3ee'];

    const tick = () => {
      confetti({
        particleCount: 5,
        angle: 60,
        spread: 70,
        startVelocity: 55,
        origin: { x: 0, y: 0.7 },
        colors,
      });
      confetti({
        particleCount: 5,
        angle: 120,
        spread: 70,
        startVelocity: 55,
        origin: { x: 1, y: 0.7 },
        colors,
      });
      if (Date.now() < end) {
        fireRef.current = requestAnimationFrame(tick);
      }
    };
    fireRef.current = requestAnimationFrame(tick);

    // One big burst from the center on entry
    confetti({
      particleCount: 120,
      spread: 90,
      startVelocity: 45,
      origin: { x: 0.5, y: 0.4 },
      colors,
    });

    return () => {
      if (fireRef.current) cancelAnimationFrame(fireRef.current);
    };
  }, [active]);

  return (
    <Ctx.Provider value={{ checkForCompletions }}>
      {children}
      {active && <CelebrationModal goal={active} onClose={() => setActive(null)} />}
    </Ctx.Provider>
  );
}

export function useCelebration() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCelebration must be used inside CelebrationProvider');
  return v;
}

function CelebrationModal({
  goal,
  onClose,
}: {
  goal: { id: number; name: string };
  onClose: () => void;
}) {
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card max-w-md w-full p-8 text-center shadow-pop">
        <div className="mx-auto w-20 h-20 rounded-2xl bg-brand-soft text-brand grid place-items-center mb-4 shadow-soft">
          <PartyPopper size={36} />
        </div>
        <div className="text-5xl mb-3" aria-hidden>
          😄
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Goal reached!</h2>
        <p className="text-content-muted mt-2 mb-6">
          You hit <span className="text-content font-semibold">100%</span> on{' '}
          <span className="text-content font-semibold">{goal.name}</span>. Nicely done.
        </p>
        <div className="flex gap-2 justify-center">
          <button onClick={onClose} className="btn-outline">
            Keep going
          </button>
          <button
            onClick={() => {
              onClose();
              navigate('/goals');
            }}
            className="btn-primary"
          >
            Go to goals
          </button>
        </div>
      </div>
    </div>
  );
}
