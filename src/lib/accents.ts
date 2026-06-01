import type { AccentColor } from '@shared/types';

interface AccentPalette {
  light: { brand: string; brandHover: string; brandSoft: string };
  dark: { brand: string; brandHover: string; brandSoft: string };
}

// Values are "r g b" strings used by Tailwind's `<alpha-value>` syntax.
export const ACCENTS: Record<AccentColor, AccentPalette> = {
  emerald: {
    light: { brand: '16 185 129',  brandHover: '5 150 105',   brandSoft: '209 250 229' },
    dark:  { brand: '52 211 153',  brandHover: '110 231 183', brandSoft: '6 78 59'     },
  },
  cyan: {
    light: { brand: '6 182 212',   brandHover: '8 145 178',   brandSoft: '207 250 254' },
    dark:  { brand: '34 211 238',  brandHover: '103 232 249', brandSoft: '22 78 99'    },
  },
  orange: {
    light: { brand: '249 115 22',  brandHover: '234 88 12',   brandSoft: '255 237 213' },
    dark:  { brand: '251 146 60',  brandHover: '253 186 116', brandSoft: '124 45 18'   },
  },
  pink: {
    light: { brand: '236 72 153',  brandHover: '219 39 119',  brandSoft: '252 231 243' },
    dark:  { brand: '244 114 182', brandHover: '249 168 212', brandSoft: '131 24 67'   },
  },
  red: {
    light: { brand: '239 68 68',   brandHover: '220 38 38',   brandSoft: '254 226 226' },
    dark:  { brand: '248 113 113', brandHover: '252 165 165', brandSoft: '127 29 29'   },
  },
  yellow: {
    light: { brand: '202 138 4',   brandHover: '161 98 7',    brandSoft: '254 249 195' },
    dark:  { brand: '250 204 21',  brandHover: '253 224 71',  brandSoft: '113 63 18'   },
  },
  purple: {
    light: { brand: '168 85 247',  brandHover: '147 51 234',  brandSoft: '243 232 255' },
    dark:  { brand: '192 132 252', brandHover: '216 180 254', brandSoft: '88 28 135'   },
  },
};

export const ACCENT_LABELS: Record<AccentColor, string> = {
  emerald: 'Emerald',
  cyan: 'Cyan',
  orange: 'Orange',
  pink: 'Pink',
  red: 'Red',
  yellow: 'Yellow',
  purple: 'Purple',
};

// Solid swatch (light-mode brand) — used for previewing the picker.
export const ACCENT_SWATCH: Record<AccentColor, string> = {
  emerald: '#10b981',
  cyan: '#06b6d4',
  orange: '#f97316',
  pink: '#ec4899',
  red: '#ef4444',
  yellow: '#eab308',
  purple: '#a855f7',
};
