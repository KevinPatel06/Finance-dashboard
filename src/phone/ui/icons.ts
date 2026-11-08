import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Bus,
  CalendarDays,
  Car,
  ChartColumn,
  CircleHelp,
  Clapperboard,
  Coffee,
  Coins,
  Compass,
  CreditCard,
  Dog,
  Dumbbell,
  Flag,
  Flower2,
  Fuel,
  Gamepad2,
  Gem,
  Gift,
  HeartHandshake,
  House,
  Inbox,
  Landmark,
  Sprout,
  Laptop,
  LifeBuoy,
  Lightbulb,
  Music,
  Newspaper,
  Package,
  PartyPopper,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Target,
  TreePalm,
  TriangleAlert,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/**
 * The phone draws line icons, not emoji. Categories, funds and recurring items
 * still STORE an emoji (the column, the keyword suggestions in shared/emoji.ts,
 * the AI export and the desktop app all keep working unchanged); this table is
 * how the phone draws each one. The picker (IconField) offers exactly PICKABLE.
 */
const ICONS: Record<string, LucideIcon> = {
  // Pickable: what a category, fund or recurring item can be.
  '🏠': House,
  '🛒': ShoppingCart,
  '🍔': Utensils,
  '☕': Coffee,
  '🛵': Bike,
  '⛽': Fuel,
  '🚌': Bus,
  '🚗': Car,
  '📱': Smartphone,
  '🌐': Wifi,
  '💡': Lightbulb,
  '🛡': Shield,
  '💊': Pill,
  '🧘': Dumbbell,
  '💆': Flower2,
  '🛍': ShoppingBag,
  '🎬': Clapperboard,
  '📺': Tv,
  '✈': Plane,
  '🎁': Gift,
  '🐶': Dog,
  '📚': BookOpen,
  '🧸': Baby,
  '🍷': Wine,
  '💳': CreditCard,
  '💰': PiggyBank,
  '🆘': LifeBuoy,
  '💻': Laptop,
  '💍': Gem,
  '🏖': TreePalm,
  '🎮': Gamepad2,
  '🎵': Music,
  '👕': Shirt,
  '🧾': Receipt,
  '💝': HeartHandshake,
  '📦': Package,
  '🔁': Repeat,

  // The app's own rows, banners and illustrations.
  '💵': Banknote,
  '💸': Wallet,
  '🎉': PartyPopper,
  '🗓': CalendarDays,
  '🏦': Landmark,
  '🌱': Sprout,
  '🏛': Landmark,
  '📊': ChartColumn,
  '🗞': Newspaper,
  '✨': Sparkles,
  '🧭': Compass,
  '✂': Scissors,
  '🪙': Coins,
  '⚠': TriangleAlert,
  '🏁': Flag,
  '🎯': Target,
  '📥': Inbox,
  '❔': CircleHelp,
  '⚡': Zap,
};

/** The picker grid, in order: the same 36 the emoji grid offered. */
export const PICKABLE = [
  '🏠', '🛒', '🍔', '☕', '🛵', '⛽', '🚌', '🚗', '📱', '🌐', '💡', '🛡️',
  '💊', '🧘', '💆', '🛍️', '🎬', '📺', '✈️', '🎁', '🐶', '📚', '🧸', '🍷',
  '💳', '💰', '🆘', '💻', '💍', '🏖️', '🎮', '🎵', '👕', '🧾', '💝', '📦',
];

/** Drop variation selectors so '🛡️' and '🛡' find the same icon. */
const key = (e: string) => e.replace(/️/g, '');

/**
 * The line icon for a stored emoji. Anything unknown (an emoji someone typed
 * before the picker became icons-only) falls back to a package.
 */
export function iconFor(emoji: string | null | undefined): LucideIcon {
  return (emoji && ICONS[key(emoji)]) || Package;
}

/** Same icon, same emoji? Used to highlight the current pick. */
export const sameIcon = (a: string | null | undefined, b: string) => !!a && key(a) === key(b);
