import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Imperative confirm + toast.
//
// Replaces the native window.confirm()/alert() calls that were sprinkled
// through the pages (which break the app's polished look and theming). Pages
// call `const confirm = useConfirm()` then `await confirm({ ... })`, and
// `const toast = useToast()` then `toast.success('Saved')`.
// ---------------------------------------------------------------------------

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

type ToastTone = 'success' | 'info' | 'error';
interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}
interface ToastApi {
  success: (message: string) => void;
  info: (message: string) => void;
  error: (message: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  // ---- Confirm ----
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ ...opts, open: true });
    });
  }, []);

  const settle = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  };

  // ---- Toast ----
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4000);
  }, []);

  const toastApi = useRef<ToastApi>({
    success: (m) => push('success', m),
    info: (m) => push('info', m),
    error: (m) => push('error', m),
  }).current;

  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={toastApi}>
        {children}

        {state && (
          <ConfirmDialog
            open={state.open}
            title={state.title}
            description={state.description}
            confirmLabel={state.confirmLabel}
            cancelLabel={state.cancelLabel}
            destructive={state.destructive}
            onConfirm={() => settle(true)}
            onCancel={() => settle(false)}
          />
        )}

        <div
          className="fixed bottom-5 right-5 z-[80] flex flex-col gap-2 pointer-events-none"
          role="status"
          aria-live="polite"
          aria-atomic="false"
        >
          {toasts.map((t) => (
            <ToastCard
              key={t.id}
              toast={t}
              onDismiss={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
            />
          ))}
        </div>
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon =
    toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertTriangle : Info;
  const accent =
    toast.tone === 'success'
      ? 'text-success'
      : toast.tone === 'error'
        ? 'text-danger'
        : 'text-info';
  return (
    <div className="pointer-events-auto card shadow-pop px-4 py-3 flex items-center gap-3 min-w-[260px] max-w-sm animate-toast-in">
      <Icon size={18} className={cn('shrink-0', accent)} />
      <div className="text-sm flex-1 leading-snug">{toast.message}</div>
      <button onClick={onDismiss} className="btn-ghost p-1 -mr-1.5" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

export function useConfirm(): ConfirmFn {
  const v = useContext(ConfirmCtx);
  if (!v) throw new Error('useConfirm must be used inside UIProvider');
  return v;
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside UIProvider');
  return v;
}
