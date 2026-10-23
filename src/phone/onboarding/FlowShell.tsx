import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Full-screen step layout for onboarding and budget setup: back arrow,
 * "2 / 7" + title, a segmented progress bar, scrolling content and a pinned
 * full-width CTA at the bottom.
 */
export default function FlowShell({
  step,
  total,
  title,
  onBack,
  children,
  footer,
}: {
  step?: number; // 1-based; omit to hide the progress header
  total?: number;
  title?: string;
  onBack?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="app-shell h-full flex flex-col bg-surface text-content">
      {step != null && total != null && (
        <div className="shrink-0 px-4 pt-4 max-w-xl w-full mx-auto">
          <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center">
            {onBack ? (
              <button onClick={onBack} aria-label="Back" className="w-10 h-10 -ml-2 grid place-items-center">
                <ArrowLeft size={24} />
              </button>
            ) : (
              <span />
            )}
            <div className="text-center leading-tight">
              <div className="text-sm text-content-subtle num">
                {step} / {total}
              </div>
              {title && <div className="text-[17px] font-semibold">{title}</div>}
            </div>
            <span />
          </div>
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: total }, (_, i) => (
              <div
                key={i}
                className={cn('h-1.5 flex-1 rounded-full transition-colors', i < step ? 'bg-brand' : 'bg-surface-3')}
              />
            ))}
          </div>
        </div>
      )}
      {/* Keyed by step so each step fades in and starts scrolled to the top. */}
      <main key={`${step}-${title}`} className="app-scroll flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-6 animate-page-in">{children}</div>
      </main>
      {footer && (
        <div className="shrink-0 px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] max-w-xl w-full mx-auto">
          {footer}
        </div>
      )}
    </div>
  );
}
