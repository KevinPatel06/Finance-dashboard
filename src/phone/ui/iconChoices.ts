import { suggestEmoji } from '@shared/emoji';

/** Which editor the icon picker sits in — it picks the common choices. */
export type IconContext = 'category' | 'fund' | 'recurring';

/** Common picks per editor, used to fill the five suggestions. All are in PICKABLE. */
export const CONTEXT_DEFAULTS: Record<IconContext, string[]> = {
  category: ['🛒', '🍔', '🏠', '🚗', '🛍️'],
  fund: ['🆘', '✈️', '🏠', '🚗', '🎁'],
  recurring: ['📱', '🌐', '💡', '📺', '🛡️'],
};

/** Variation selectors don't change which icon an emoji draws. */
const norm = (e: string) => e.replace(/️/g, '');

/**
 * The five icons the picker shows before "See all": the current pick, the
 * one that matches the name, then the common picks for this editor.
 */
export function topIcons(value: string, name: string, context: IconContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of [value, suggestEmoji(name, ''), ...CONTEXT_DEFAULTS[context]]) {
    if (!e || seen.has(norm(e))) continue;
    seen.add(norm(e));
    out.push(e);
    if (out.length === 5) break;
  }
  return out;
}

/**
 * Keeps the row steady while picking: a pick already in the row stays where
 * it is, and one that isn't (chosen from "See all") takes the last slot.
 */
export function withPick(row: string[], pick: string): string[] {
  if (!pick || row.some((e) => norm(e) === norm(pick))) return row;
  return [...row.slice(0, 4), pick];
}
