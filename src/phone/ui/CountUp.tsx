import { useEffect, useRef, useState } from 'react';

/**
 * A number that counts up from 0 when it first appears, then glides from the
 * old value to the new one when it changes. Instant under Reduce Motion.
 */
export default function CountUp({
  value,
  format,
  duration = 850,
}: {
  value: number;
  format: (n: number) => string;
  duration?: number;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const next = start + (value - start) * (1 - Math.pow(1 - p, 3));
      from.current = next;
      setShown(next);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
