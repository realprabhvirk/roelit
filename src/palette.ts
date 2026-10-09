// Solid colour palette. Decks reference these by name; custom/imported decks
// may also use a raw #RRGGBB hex.
export const PALETTE = {
  tomato: '#D8452E',
  mustard: '#E3A52A',
  forest: '#2F6B4F',
  ocean: '#2D5E8C',
  plum: '#7A3E6B',
  clay: '#B8603C',
  teal: '#2A7F7A',
  slate: '#46505C',
  ink: '#1E1B18',
} as const;

export type PaletteName = keyof typeof PALETTE;

export const PALETTE_NAMES = Object.keys(PALETTE) as PaletteName[];

export const INK = '#1E1B18';
export const PAPER = '#F3EDE2';

export function resolveColor(c: string): string {
  return Object.prototype.hasOwnProperty.call(PALETTE, c) ? (PALETTE as Record<string, string>)[c] : c;
}

/** Text colour that sits on top of a solid fill. */
export function onColor(c: string): string {
  const hex = resolveColor(c).replace('#', '');
  if (hex.length !== 6) return PAPER;
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.33 ? INK : PAPER;
}
