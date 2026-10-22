import { formatISO, getDay, parseISO, subDays } from 'date-fns';

/**
 * The "smart text box": turns "coffee 5, gas 50 yesterday" into expense drafts.
 * Rules only — no AI. Pure, so it's unit-tested and runs identically on both
 * platforms; the caller supplies today's LOCAL date, the user's categories and
 * their recent expenses (for learning which category a description belongs to).
 */

export interface QuickAddDraft {
  /** The text this draft came from, for display/debugging. */
  raw: string;
  description: string;
  /** Null when no amount was found — the UI must ask for one before saving. */
  amount: number | null;
  date: string;
  category_id: number | null;
}

export interface QuickAddContext {
  today: string;
  categories: Array<{ id: number; name: string }>;
  /** Recent expenses, most recent first. */
  history: Array<{ description: string; category_id: number | null }>;
}

const iso = (d: Date) => formatISO(d, { representation: 'date' });

// ---------------------------------------------------------------- splitting

/** Items split on ; newline " and " and commas — but not thousands commas. */
function splitItems(text: string): string[] {
  return text
    .split(/;|\n|,(?!\d{3}\b)|\s+and\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- dates

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tues: 2, tue: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thurs: 4, thur: 4, thu: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sept|sep|oct|nov|dec)[a-z]*\\.?';
const DAY_RE = '(\\d{1,2})(?:st|nd|rd|th)?';

/** A calendar date in the current year, or last year if that would be in the future. */
function monthDay(today: string, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const year = Number(today.slice(0, 4));
  const pad = (n: number) => String(n).padStart(2, '0');
  let candidate = `${year}-${pad(month)}-${pad(day)}`;
  if (candidate > today) candidate = `${year - 1}-${pad(month)}-${pad(day)}`;
  // Reject impossible dates like Feb 31 (parseISO rolls them over).
  return iso(parseISO(candidate)) === candidate ? candidate : null;
}

/**
 * Finds the first date phrase in `text`. Returns the date and the text with
 * the phrase removed (so its digits are never mistaken for the amount).
 */
function extractDate(text: string, today: string): { date: string | null; rest: string } {
  const t = parseISO(today);
  const patterns: Array<{ re: RegExp; toDate: (m: RegExpMatchArray) => string | null }> = [
    { re: /\b(\d+)\s+days?\s+ago\b/i, toDate: (m) => iso(subDays(t, Number(m[1]))) },
    { re: /\btoday\b/i, toDate: () => today },
    { re: /\byesterday\b/i, toDate: () => iso(subDays(t, 1)) },
    {
      re: new RegExp(`\\b(?:on\\s+)?${MONTH_RE}\\s+${DAY_RE}\\b`, 'i'),
      toDate: (m) => monthDay(today, MONTHS[m[1].toLowerCase()], Number(m[2])),
    },
    {
      re: new RegExp(`\\b(?:on\\s+)?${DAY_RE}\\s+${MONTH_RE}\\b`, 'i'),
      toDate: (m) => monthDay(today, MONTHS[m[2].toLowerCase()], Number(m[1])),
    },
    { re: /\b(?:on\s+)?(\d{1,2})\/(\d{1,2})\b/, toDate: (m) => monthDay(today, Number(m[1]), Number(m[2])) },
    {
      re: /\b(?:on\s+|last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i,
      toDate: (m) => {
        const target = WEEKDAYS[m[1].toLowerCase()];
        return iso(subDays(t, (getDay(t) - target + 7) % 7));
      },
    },
  ];
  for (const { re, toDate } of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const date = toDate(m);
    if (!date) continue;
    return { date, rest: text.replace(m[0], ' ') };
  }
  return { date: null, rest: text };
}

// ---------------------------------------------------------------- amounts

const MONEY = /^\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)\$?$/;

/** A `$` token wins; otherwise the LAST standalone number ("7-eleven 12"). */
function extractAmount(tokens: string[]): { amount: number | null; rest: string[] } {
  const isMoney = (tok: string) => MONEY.test(tok);
  let idx = tokens.findIndex((tok) => tok.includes('$') && isMoney(tok));
  if (idx < 0) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (isMoney(tokens[i])) {
        idx = i;
        break;
      }
    }
  }
  if (idx < 0) return { amount: null, rest: tokens };
  const amount = Number(tokens[idx].match(MONEY)![1].replace(/,/g, ''));
  return { amount, rest: tokens.filter((_, i) => i !== idx) };
}

// ---------------------------------------------------------------- categories

/** Keyword groups → category names to look for among the user's categories. */
const KEYWORDS: Array<{ re: RegExp; names: string[] }> = [
  { re: /\b(uber eats|doordash|skip the dishes)\b/i, names: ['delivery', 'eating out', 'dining', 'restaurant', 'food'] },
  {
    re: /\b(grocer\w*|no frills|loblaws|metro|sobeys|walmart|costco|farm boy|food basics|freshco|fortinos|superstore)\b/i,
    names: ['groceries', 'grocery', 'food'],
  },
  {
    re: /\b(coffee|cafe|starbucks|tim hortons|tims|lunch|dinner|breakfast|brunch|restaurant|sushi|pizza|burgers?|mcdonald\w*|takeout|pho|ramen|bar)\b/i,
    names: ['dining', 'eating out', 'restaurant', 'food', 'coffee'],
  },
  { re: /\b(gas|fuel|esso|petro\w*|shell|pioneer|ultramar)\b/i, names: ['gas', 'fuel', 'transport', 'car'] },
  { re: /\b(uber|lyft|taxi|ttc|presto|go train|transit|bus|parking|via rail)\b/i, names: ['transport', 'transit', 'travel'] },
  { re: /\b(amazon|clothes|clothing|shoes|winners|zara|uniqlo|best buy)\b/i, names: ['shopping'] },
  { re: /\b(pharmacy|shoppers|meds|medicine|doctor|dentist|dental|physio)\b/i, names: ['health', 'meds', 'medical'] },
  { re: /\b(gym|yoga|classpass)\b/i, names: ['fitness', 'gym', 'health'] },
  { re: /\b(haircut|hair|barber|nails|salon|wax\w*|spa)\b/i, names: ['personal care', 'beauty'] },
  { re: /\b(movies?|cinema|netflix|spotify|concert|tickets?|steam|games?)\b/i, names: ['entertainment', 'subscriptions', 'fun'] },
  { re: /\b(hotel|airbnb|flights?|airline)\b/i, names: ['travel'] },
  { re: /\b(gifts?|present)\b/i, names: ['gifts', 'gift'] },
  { re: /\b(rent)\b/i, names: ['rent', 'housing'] },
  { re: /\b(hydro|internet|phone bill|rogers|bell|telus)\b/i, names: ['bills', 'utilities'] },
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function guessCategory(description: string, ctx: QuickAddContext): number | null {
  const d = norm(description);
  if (!d) return null;

  // 1. The user's own history: same description, then same first word.
  const exact = ctx.history.find((h) => h.category_id != null && norm(h.description) === d);
  if (exact) return exact.category_id;
  const first = d.split(' ')[0];
  if (first.length >= 3) {
    const byWord = ctx.history.find(
      (h) => h.category_id != null && norm(h.description).split(' ')[0] === first
    );
    if (byWord) return byWord.category_id;
  }

  // 2. A category whose name appears in the description ("groceries 40").
  const named = ctx.categories.find((c) => new RegExp(`\\b${escapeRe(norm(c.name))}\\b`).test(d));
  if (named) return named.id;

  // 3. Keyword groups mapped onto whatever the user called the category.
  for (const { re, names } of KEYWORDS) {
    if (!re.test(d)) continue;
    for (const name of names) {
      const hit = ctx.categories.find((c) => norm(c.name).includes(name));
      if (hit) return hit.id;
    }
  }

  // 4. "Other", if the user has one.
  return ctx.categories.find((c) => /^(other|misc\w*)$/.test(norm(c.name)))?.id ?? null;
}

// ---------------------------------------------------------------- main

function tidyDescription(tokens: string[]): string {
  const s = tokens
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-:@]+|[\s\-:@]+$/g, '')
    .trim();
  return /^[a-z]/.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddDraft[] {
  const items = splitItems(text);
  return items.map((raw) => {
    const { date, rest } = extractDate(raw, ctx.today);
    const { amount, rest: words } = extractAmount(rest.split(/\s+/).filter(Boolean));
    const description = tidyDescription(words);
    return {
      raw,
      description,
      amount,
      date: date ?? ctx.today,
      category_id: guessCategory(description, ctx),
    };
  });
}

