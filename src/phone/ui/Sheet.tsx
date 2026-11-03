import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useBackHandler } from '@/lib/backStack';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Slides a closing sheet off screen. Most callers close a sheet by unmounting
 * it (`{open && <Editor/>}`), which leaves React nothing to animate, so the
 * sheet's last frame is cloned into <body> and the clone animates away. It
 * starts wherever the panel is, so a drag-to-dismiss carries straight on.
 */
function playExit(node: HTMLElement, bodyScroll: number) {
  if (reducedMotion()) return;
  const ghost = node.cloneNode(true) as HTMLElement;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.removeAttribute('role');
  ghost.style.pointerEvents = 'none';
  const panel = ghost.querySelector<HTMLElement>('[data-sheet-panel]');
  const backdrop = ghost.querySelector<HTMLElement>('[data-sheet-backdrop]');
  if (!panel || !backdrop) return;
  panel.classList.remove('ph-sheet-in');
  backdrop.classList.remove('ph-backdrop-in');
  document.body.appendChild(ghost);
  const body = ghost.querySelector<HTMLElement>('[data-sheet-body]');
  if (body) body.scrollTop = bodyScroll;

  const opts: KeyframeAnimationOptions = { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' };
  const slide = panel.animate(
    [{ transform: panel.style.transform || 'translate3d(0,0,0)' }, { transform: 'translate3d(0,100%,0)' }],
    opts
  );
  backdrop.animate([{ opacity: backdrop.style.opacity || '1' }, { opacity: '0' }], opts);
  const done = () => ghost.remove();
  slide.onfinish = done;
  window.setTimeout(done, 600);
}

/**
 * Bottom sheet: grabber, centred title, circle close button, scrollable body
 * and an optional pinned footer (for the big CTA). Escape and the backdrop
 * close it, and so does dragging the top bar down; focus moves to the first
 * field so typing can start immediately. Rendered into <body> so a moving
 * screen (PhoneLayout's transitions) can never shift it.
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
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const bodyScroll = useRef(0);
  // Callers pass inline closures; reading through a ref keeps the effects
  // below from re-running (and re-focusing) on every parent render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useBackHandler(onClose, open);

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

  // However the sheet goes away (open → false, or unmounted), slide it out.
  useLayoutEffect(() => {
    if (!open) return;
    const node = rootRef.current;
    bodyScroll.current = 0;
    return () => {
      // StrictMode's dev-only mount/unmount/mount leaves the node in place;
      // only a sheet that has really left the page gets an exit.
      queueMicrotask(() => {
        if (node && !node.isConnected) playExit(node, bodyScroll.current);
      });
    };
  }, [open]);

  // Drag the grabber / title bar down to dismiss.
  const drag = useRef<null | { y: number; t: number; dy: number; v: number }>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('button')) return;
    drag.current = { y: e.clientY, t: performance.now(), dy: 0, v: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
    const panel = panelRef.current;
    if (panel) panel.style.transition = '';
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    const raw = e.clientY - d.y;
    const dy = raw < 0 ? raw * 0.2 : raw; // resist pulling up
    const now = performance.now();
    d.v = (dy - d.dy) / Math.max(1, now - d.t);
    d.dy = dy;
    d.t = now;
    panel.style.transform = `translate3d(0,${dy}px,0)`;
    if (backdropRef.current) backdropRef.current.style.opacity = String(Math.max(0, 1 - dy / panel.offsetHeight));
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    const panel = panelRef.current;
    if (!d || !panel) return;
    if (d.dy > 110 || d.v > 0.6) {
      closeRef.current();
      return;
    }
    panel.style.transition = 'transform 452ms var(--spring-sheet, ease-out)';
    panel.style.transform = '';
    const bd = backdropRef.current;
    if (bd) {
      bd.style.transition = 'opacity 200ms ease-out';
      bd.style.opacity = '';
    }
  };

  if (!open) return null;

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-end">
      <div
        ref={backdropRef}
        data-sheet-backdrop
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] ph-backdrop-in"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        data-sheet-panel
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative w-full bg-surface rounded-t-[28px] shadow-pop flex flex-col ph-sheet-in',
          full ? 'h-[94vh]' : 'max-h-[92vh]'
        )}
      >
        <div
          className="shrink-0 touch-none cursor-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-border-strong" />
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 px-4 pt-2 pb-2">
            <span />
            <div className="text-center min-w-0">
              {title && <div className="text-[17px] font-semibold truncate">{title}</div>}
              {subtitle && <div className="text-xs text-content-subtle truncate">{subtitle}</div>}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="press [--dip:0.9] w-9 h-9 rounded-full grid place-items-center bg-surface-3 text-content-muted justify-self-end"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          data-sheet-body
          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4"
          onScroll={(e) => {
            bodyScroll.current = e.currentTarget.scrollTop;
          }}
        >
          {children}
        </div>
        {footer && (
          <div className="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-surface">
            {footer}
          </div>
        )}
        {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>,
    document.body
  );
}
