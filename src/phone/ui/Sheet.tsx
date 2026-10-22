import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bottom sheet: grabber, centred title, circle close button, scrollable body
 * and an optional pinned footer (for the big CTA). Escape and the backdrop
 * close it; focus moves to the first field so typing can start immediately.
 */
export default function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  full,
  autoFocus = true,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Take (nearly) the whole screen — for multi-section editors. */
  full?: boolean;
  /** Focus the first field on open (off for big editors, so the keyboard stays down). */
  autoFocus?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Callers pass inline closures; reading through a ref keeps the effects
  // below from re-running (and re-focusing) on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open || !autoFocus) return;
    const id = window.requestAnimationFrame(() => {
      panelRef.current
        ?.querySelector<HTMLElement>('input:not([disabled]):not([data-no-autofocus]), textarea:not([disabled])')
        ?.focus();
    });
    return () => window.cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end animate-fade-in">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative w-full bg-surface rounded-t-[28px] shadow-pop flex flex-col animate-sheet-up',
          full ? 'h-[94vh]' : 'max-h-[92vh]'
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong shrink-0" />
        <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-4 pt-2 pb-2 shrink-0">
          <span />
          <div className="text-center min-w-0">
            {title && <div className="text-[17px] font-semibold truncate">{title}</div>}
            {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full grid place-items-center bg-surface-3 text-content-muted justify-self-end active:scale-95"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && (
          <div className="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface">
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  );
}
