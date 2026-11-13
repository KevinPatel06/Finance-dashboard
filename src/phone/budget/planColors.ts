/**
 * One colour per kind of plan line, shared by the Budget breakdown, the Edit
 * plan bar and the Saving split so a colour means the same thing everywhere.
 * Hues differ in lightness too, so they stay apart for colour-blind eyes, and
 * all sit on light cards (Ivory, or Sage in dark mode).
 */
export const PLAN_COLOR = {
  recurring: '#4F7FAF',
  debt: '#C46A4C',
  fund: '#3F7A55',
  contribution: '#8C86D6',
  spend: '#D9A441',
} as const;

export type PlanColorKey = keyof typeof PLAN_COLOR;
