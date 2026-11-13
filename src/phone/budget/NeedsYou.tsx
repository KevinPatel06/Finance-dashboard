import { Children, useRef, useState, type ReactNode } from 'react';

/**
 * The Budget home's to-do cards (payday check-ins, deposits due, plan gaps)
 * as one swipeable row instead of a stack that pushes the gauge off screen.
 * The next card peeks in from the right so it's clear there's more.
 */
export default function NeedsYou({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(Boolean);
  const row = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  if (items.length === 0) return null;

  const onScroll = () => {
    const el = row.current;
    if (!el || !el.firstElementChild) return;
    const step = (el.firstElementChild as HTMLElement).offsetWidth + 10;
    setIndex(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollLeft / step))));
  };

  return (
    <section aria-label="Needs you">
      <div className="flex items-center justify-between px-1 mb-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[17px] font-display font-semibold">Needs you</h2>
          <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-content text-surface text-[13px] font-semibold grid place-items-center num">
            {items.length}
          </span>
        </div>
        {items.length > 1 && (
          <span className="text-sm text-content-muted num" aria-live="polite">
            {index + 1} of {items.length}
          </span>
        )}
      </div>
      <div
        ref={row}
        onScroll={onScroll}
        className="-mx-4 px-4 flex gap-2.5 overflow-x-auto snap-x snap-mandatory scroll-px-4 items-start [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={i}
            className={items.length > 1 ? 'snap-start shrink-0 w-[calc(100%-1.75rem)]' : 'snap-start shrink-0 w-full'}
          >
            {item}
          </div>
        ))}
      </div>
    </section>
  );
}
