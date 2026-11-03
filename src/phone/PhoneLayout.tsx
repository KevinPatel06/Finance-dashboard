import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { NavigationType, useLocation, useNavigate, useNavigationType, useOutlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import TabBar, { TAB_PATHS } from './TabBar';
import QuickAddSheet, { type QuickAddOptions } from './expenses/QuickAddSheet';

interface QuickAddCtx {
  /** Open the + sheet, optionally pre-filled (e.g. from a category page). */
  openQuickAdd: (opts?: QuickAddOptions) => void;
}

const Ctx = createContext<QuickAddCtx>({ openQuickAdd: () => {} });
export const useQuickAdd = () => useContext(Ctx);

// ---------------------------------------------------------------- screen stack

/**
 * How a screen is moving. Class names live in index.css (`.ph-*`).
 * - tab-in / fade-out: switching tabs (or replacing a screen) fades up.
 * - push-in / push-under: a pushed screen slides in from the right over the
 *   one it came from, which slides a little left, dims, and stays mounted.
 * - back-under / back-out: going back reveals that screen again (scroll
 *   position and all) while the top one slides off to the right.
 */
type Motion = 'none' | 'tab-in' | 'fade-out' | 'push-in' | 'push-under' | 'back-under' | 'back-out';

const MOTION_CLASS: Record<Motion, string> = {
  none: '',
  'tab-in': 'ph-tab-in',
  'fade-out': 'ph-leaving ph-fade-out',
  'push-in': 'ph-push-in',
  'push-under': 'ph-under ph-push-under',
  'back-under': 'ph-back-under',
  'back-out': 'ph-leaving ph-back-out',
};

interface Layer {
  id: number;
  path: string;
  /** The route element as it was when this screen stopped being on top. */
  el: ReactElement | null;
  motion: Motion;
}
interface Stack {
  path: string;
  /** Bottom → top; only the last is live, the rest are hidden underneath. */
  layers: Layer[];
  /** Screens animating out; removed when their animation ends. */
  leaving: Layer[];
}

/** Screens kept mounted underneath, at most. */
const MAX_DEPTH = 5;
let nextId = 1;
const isTab = (p: string) => TAB_PATHS.includes(p);

function advance(s: Stack, path: string, nav: NavigationType, topEl: ReactElement | null): Stack {
  const top = s.layers[s.layers.length - 1];
  const frozen: Layer = { ...top, el: topEl };
  const below = s.layers.slice(0, -1);
  const fresh = (motion: Motion): Layer => ({ id: nextId++, path, el: null, motion });

  // Back to a screen that's still underneath: reveal it.
  if (nav === NavigationType.Pop) {
    for (let i = below.length - 1; i >= 0; i--) {
      if (below[i].path === path) {
        return {
          path,
          layers: [...below.slice(0, i), { ...below[i], motion: 'back-under' }],
          leaving: [...s.leaving, { ...frozen, motion: 'back-out' }],
        };
      }
    }
  }
  // A tab starts a fresh stack; a replace swaps the top screen in place.
  if (isTab(path) || nav === NavigationType.Replace) {
    const keep = !isTab(path) ? below : [];
    return { path, layers: [...keep, fresh('tab-in')], leaving: [...s.leaving, { ...frozen, motion: 'fade-out' }] };
  }
  const covered: Layer = { ...frozen, motion: 'push-under' };
  return {
    path,
    layers: [...below, covered, fresh('push-in')].slice(-MAX_DEPTH),
    leaving: s.leaving,
  };
}

/** Swipe from the left edge of a pushed screen to go back, like iOS. */
function useEdgeSwipe(
  main: React.RefObject<HTMLElement>,
  nodes: React.MutableRefObject<Map<number, HTMLElement>>,
  stack: React.MutableRefObject<Stack>
) {
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;

  useEffect(() => {
    const root = main.current;
    if (!root) return;
    const EDGE = 24;
    let g: null | {
      x: number; y: number; t: number; dx: number; v: number;
      decided: boolean; top: HTMLElement; under: HTMLElement; dim: number;
    } = null;

    const place = (dx: number) => {
      if (!g) return;
      const W = root.clientWidth;
      g.top.style.transform = `translate3d(${dx}px,0,0)`;
      g.under.style.visibility = 'visible';
      g.under.style.transform = `translate3d(${-0.28 * W + 0.28 * dx}px,0,0)`;
      g.under.style.setProperty('--live-dim', String(g.dim * (1 - dx / W)));
    };
    const clear = (el: HTMLElement) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.visibility = '';
      el.style.removeProperty('--live-dim');
    };

    const onStart = (e: TouchEvent) => {
      const s = stack.current;
      const t = e.touches[0];
      if (e.touches.length !== 1 || s.layers.length < 2 || t.clientX - root.getBoundingClientRect().left > EDGE) return;
      const top = nodes.current.get(s.layers[s.layers.length - 1].id);
      const under = nodes.current.get(s.layers[s.layers.length - 2].id);
      if (!top || !under) return;
      const dim = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--page-dim')) || 0.1;
      g = { x: t.clientX, y: t.clientY, t: performance.now(), dx: 0, v: 0, decided: false, top, under, dim };
    };
    const onMove = (e: TouchEvent) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x;
      const dy = t.clientY - g.y;
      if (!g.decided) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (dx <= Math.abs(dy)) { g = null; return; } // a vertical scroll, not a swipe
        g.decided = true;
      }
      e.preventDefault();
      const now = performance.now();
      const x = Math.max(0, dx);
      g.v = (x - g.dx) / Math.max(1, now - g.t);
      g.dx = x;
      g.t = now;
      place(x);
    };
    const onEnd = () => {
      if (!g) return;
      const { dx, v, top, under, dim, decided } = g;
      g = null;
      if (!decided) return;
      const W = root.clientWidth;
      if (dx > W * 0.35 || v > 0.5) {
        // Hand the current positions to the back animation so it carries on
        // from here; PhoneLayout clears the inline styles once it starts.
        top.style.setProperty('--from-x', `${dx}px`);
        under.style.setProperty('--from-under', `${-0.28 * W + 0.28 * dx}px`);
        under.style.setProperty('--from-dim', String(dim * (1 - dx / W)));
        navRef.current(-1);
        return;
      }
      for (const el of [top, under]) el.style.transition = 'transform 360ms var(--spring-slide, ease-out)';
      top.style.transform = 'translate3d(0,0,0)';
      under.style.transform = `translate3d(${-0.28 * W}px,0,0)`;
      under.style.setProperty('--live-dim', String(dim));
      window.setTimeout(() => { clear(top); clear(under); }, 380);
    };

    root.addEventListener('touchstart', onStart, { passive: true });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
    return () => {
      root.removeEventListener('touchstart', onStart);
      root.removeEventListener('touchmove', onMove);
      root.removeEventListener('touchend', onEnd);
      root.removeEventListener('touchcancel', onEnd);
    };
  }, [main, nodes, stack]);
}

/**
 * The phone shell: a stack of screens with iOS-style transitions, the
 * floating tab bar on the three top-level tabs, and the quick-add sheet that
 * the + button opens from anywhere.
 */
export default function PhoneLayout() {
  const { pathname } = useLocation();
  const nav = useNavigationType();
  const outlet = useOutlet();
  const [quickAdd, setQuickAdd] = useState<QuickAddOptions | null>(null);

  const lastOutlet = useRef(outlet);
  const [stack, setStack] = useState<Stack>(() => ({
    path: pathname,
    layers: [{ id: nextId++, path: pathname, el: null, motion: 'none' }],
    leaving: [],
  }));

  // Derive the next stack during render (React's "adjust state on prop
  // change" pattern) so the old screen is never re-rendered with the new route.
  let s = stack;
  if (stack.path !== pathname) {
    s = advance(stack, pathname, nav, lastOutlet.current);
    setStack(s);
  }
  useEffect(() => {
    lastOutlet.current = outlet;
  });

  const stackRef = useRef(s);
  stackRef.current = s;
  const nodes = useRef(new Map<number, HTMLElement>());
  const main = useRef<HTMLElement>(null);
  useEdgeSwipe(main, nodes, stackRef);

  // A swipe-back leaves inline transforms on the two screens it moved; the
  // back animation has now taken over (from --from-x etc.), so drop them.
  useLayoutEffect(() => {
    nodes.current.forEach((el) => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.visibility = '';
      el.style.removeProperty('--live-dim');
    });
  }, [s.path]);

  // Safety net: if an animationend never arrives, leaving screens still go.
  useEffect(() => {
    if (s.leaving.length === 0) return;
    const ids = new Set(s.leaving.map((l) => l.id));
    const t = window.setTimeout(() => {
      setStack((cur) => ({ ...cur, leaving: cur.leaving.filter((l) => !ids.has(l.id)) }));
    }, 800);
    return () => window.clearTimeout(t);
  }, [s.leaving]);

  const top = s.layers[s.layers.length - 1];
  const leavingIds = new Set(s.leaving.map((l) => l.id));
  // DOM order = creation order, so newer screens paint on top and a revealed
  // screen sits under the one sliding away, without any z-index juggling.
  const all = [...s.layers, ...s.leaving].sort((a, b) => a.id - b.id);

  return (
    <Ctx.Provider value={{ openQuickAdd: (opts) => setQuickAdd(opts ?? {}) }}>
      <div className="app-shell h-full flex flex-col bg-surface text-content">
        <main ref={main} className="relative flex-1 overflow-hidden">
          {all.map((layer) => {
            const live = layer.id === top.id;
            const leaving = leavingIds.has(layer.id);
            return (
              <div
                key={layer.id}
                ref={(el) => {
                  if (el) nodes.current.set(layer.id, el);
                  else nodes.current.delete(layer.id);
                }}
                className={cn('ph-layer', MOTION_CLASS[layer.motion])}
                aria-hidden={live ? undefined : true}
                onAnimationEnd={(e) => {
                  // Only the layer's own animation, not a child's or its ::after dimmer.
                  if (e.target !== e.currentTarget || e.nativeEvent.pseudoElement) return;
                  const el = e.currentTarget;
                  el.style.removeProperty('--from-x');
                  el.style.removeProperty('--from-under');
                  el.style.removeProperty('--from-dim');
                  if (leaving) setStack((cur) => ({ ...cur, leaving: cur.leaving.filter((l) => l.id !== layer.id) }));
                }}
              >
                <div className="ph-scroll app-scroll">
                  <div className={cn('max-w-xl mx-auto px-4 pt-2', isTab(layer.path) ? 'pb-32' : 'pb-12')}>
                    {live ? outlet : layer.el}
                  </div>
                </div>
              </div>
            );
          })}
        </main>
        <TabBar onPlus={() => setQuickAdd({})} />
        {quickAdd && <QuickAddSheet options={quickAdd} onClose={() => setQuickAdd(null)} />}
      </div>
    </Ctx.Provider>
  );
}
