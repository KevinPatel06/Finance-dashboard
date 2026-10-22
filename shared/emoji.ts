import type { CategoryKind } from './types';

/**
 * Keyword → emoji suggestions for categories, funds and recurring items, plus
 * a need/want guess. Pure and dependency-free: used by migration v13 to
 * backfill existing rows and by the phone UI to suggest as the user types.
 *
 * Words match whole words (an optional plural "s"/"es" is allowed), so "car"
 * never fires on "card" or "personal care". A trailing `*` marks a stem that
 * may continue ("grocer*" → groceries, grocery). First rule that matches wins.
 */
const RULES: Array<{ words: string[]; emoji: string; need?: boolean }> = [
  { words: ['rent', 'housing', 'mortgage', 'condo', 'apartment', 'home'], emoji: '🏠', need: true },
  { words: ['grocer*', 'supermarket', 'no frills', 'food basics', 'loblaws', 'farm boy', 'costco'], emoji: '🛒', need: true },
  { words: ['coffee', 'cafe', 'starbucks', 'tim hortons', 'tims'], emoji: '☕' },
  { words: ['delivery', 'uber eats', 'doordash', 'skip the dishes'], emoji: '🛵' },
  {
    words: ['eating out', 'dining', 'restaurant', 'takeout', 'take out', 'food', 'lunch', 'dinner', 'brunch', 'fast food', 'sushi', 'pizza'],
    emoji: '🍔',
  },
  { words: ['gas', 'fuel', 'petro*', 'esso', 'shell'], emoji: '⛽', need: true },
  { words: ['transport*', 'transit', 'ttc', 'presto', 'bus', 'train', 'uber', 'lyft', 'taxi', 'parking'], emoji: '🚌', need: true },
  { words: ['car', 'auto', 'vehicle'], emoji: '🚗', need: true },
  { words: ['phone', 'mobile', 'cell', 'rogers', 'bell', 'telus', 'fido', 'koodo', 'freedom'], emoji: '📱', need: true },
  { words: ['internet', 'wifi', 'wi-fi'], emoji: '🌐', need: true },
  { words: ['hydro', 'electric*', 'utilit*', 'water', 'heating', 'enbridge', 'bill'], emoji: '💡', need: true },
  { words: ['insur*'], emoji: '🛡️', need: true },
  { words: ['health', 'medic*', 'doctor', 'dental', 'dentist', 'pharmacy', 'meds', 'shoppers'], emoji: '💊', need: true },
  { words: ['fitness', 'gym', 'yoga', 'classpass', 'sport'], emoji: '🧘' },
  { words: ['personal care', 'hair', 'nail', 'beauty', 'salon', 'barber', 'wax', 'spa'], emoji: '💆' },
  { words: ['shopping', 'cloth*', 'amazon', 'shoe'], emoji: '🛍️' },
  { words: ['netflix', 'spotify', 'disney', 'crave', 'prime', 'youtube', 'streaming', 'subscription', 'icloud'], emoji: '📺' },
  { words: ['entertainment', 'movie', 'cinema', 'concert', 'game', 'gaming', 'fun'], emoji: '🎬' },
  { words: ['travel*', 'trip', 'vacation', 'flight', 'hotel', 'airbnb'], emoji: '✈️' },
  { words: ['gift', 'birthday', 'christmas', 'holiday'], emoji: '🎁' },
  { words: ['pet', 'dog', 'cat', 'vet'], emoji: '🐶' },
  { words: ['education', 'school', 'tuition', 'course', 'book'], emoji: '📚', need: true },
  { words: ['child*', 'kid', 'daycare', 'baby'], emoji: '🧸', need: true },
  { words: ['emergency', 'sos', 'rainy day'], emoji: '🆘' },
  { words: ['laptop', 'computer', 'tech', 'electronic*'], emoji: '💻' },
  { words: ['wedding', 'ring'], emoji: '💍' },
  { words: ['debt', 'loan', 'credit card', 'visa', 'mastercard', 'amex'], emoji: '💳', need: true },
  { words: ['saving*', 'invest*', 'rrsp', 'tfsa', 'fhsa'], emoji: '💰' },
  { words: ['charity', 'donation'], emoji: '💝' },
  { words: ['alcohol', 'bar', 'beer', 'wine', 'lcbo'], emoji: '🍷' },
  { words: ['other', 'misc*'], emoji: '📦' },
];

const COMPILED = RULES.map((r) => ({
  ...r,
  patterns: r.words.map((w) =>
    w.endsWith('*') ? new RegExp(`\\b${w.slice(0, -1)}`, 'i') : new RegExp(`\\b${w}(s|es)?\\b`, 'i')
  ),
}));

function matchRule(name: string) {
  if (!name.trim()) return null;
  return COMPILED.find((r) => r.patterns.some((p) => p.test(name))) ?? null;
}

/** An emoji that fits `name`, or `fallback` when nothing matches. */
export function suggestEmoji(name: string, fallback = '📦'): string {
  return matchRule(name)?.emoji ?? fallback;
}

/** 'need' for essentials (housing, groceries, transport, bills…), else 'want'. */
export function suggestKind(name: string): CategoryKind {
  return matchRule(name)?.need ? 'need' : 'want';
}
