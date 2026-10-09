// Deck schema + validation. Used for built-ins, custom decks and imports.
import { PALETTE } from './palette';
import { ICON_KEYS } from './ui/icons';
import type { CardInput } from './match';

export type Card = CardInput;

export type Deck = {
  id: string;
  name: string;
  /** Palette name ("tomato") or #RRGGBB. */
  color: string;
  /** Key from ui/icons DECK_ICONS. */
  icon: string;
  description?: string;
  cards: Card[];
  /** Set on decks the user made or imported. */
  custom?: boolean;
  /** Set while the deck is passcode-locked: `cards` is empty and this is the real count. */
  lockedCount?: number;
};

export function isLocked(d: Deck): boolean {
  return d.lockedCount !== undefined;
}

export function cardCount(d: Deck): number {
  return d.lockedCount ?? d.cards.length;
}

export type ValidationResult = { ok: true; deck: Deck } | { ok: false; error: string };

const HEX = /^#[0-9a-fA-F]{6}$/;

export function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'deck'
  );
}

/** Validate something that claims to be a deck. Error messages are user-facing. */
export function validateDeck(input: unknown): ValidationResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: "That file isn't a deck. Expected a JSON object with a name and cards." };
  }
  const o = input as Record<string, unknown>;
  const name = typeof o.name === 'string' ? o.name.trim() : '';
  if (!name) return { ok: false, error: 'The deck needs a "name".' };
  if (name.length > 40) return { ok: false, error: 'Deck name is too long (40 characters max).' };
  if (!Array.isArray(o.cards)) return { ok: false, error: 'The deck needs a "cards" list.' };

  const cards: Card[] = [];
  for (let i = 0; i < o.cards.length; i++) {
    const c = o.cards[i];
    if (typeof c === 'string') {
      const t = c.trim();
      if (t) cards.push(t);
      continue;
    }
    if (c && typeof c === 'object' && typeof (c as any).text === 'string' && (c as any).text.trim()) {
      const text = (c as any).text.trim() as string;
      const al = (c as any).aliases;
      if (al !== undefined && (!Array.isArray(al) || al.some((a: unknown) => typeof a !== 'string'))) {
        return { ok: false, error: `Card ${i + 1} ("${text}"): "aliases" must be a list of strings.` };
      }
      const aliases = (al as string[] | undefined)?.map((a) => a.trim()).filter(Boolean);
      cards.push(aliases?.length ? { text, aliases } : text);
      continue;
    }
    return { ok: false, error: `Card ${i + 1} isn't valid. Use a string or { "text": "...", "aliases": [...] }.` };
  }
  if (cards.length < 1) return { ok: false, error: 'The deck has no cards.' };
  if (cards.length > 1000) return { ok: false, error: 'That deck is huge. Keep it under 1000 cards.' };

  const colorIn = typeof o.color === 'string' ? o.color : '';
  const color = Object.prototype.hasOwnProperty.call(PALETTE, colorIn) || HEX.test(colorIn) ? colorIn : 'slate';
  const iconIn = typeof o.icon === 'string' ? o.icon : '';
  const icon = ICON_KEYS.includes(iconIn) ? iconIn : 'cards';
  const id = typeof o.id === 'string' && o.id.trim() ? slug(o.id) : slug(name);
  const description = typeof o.description === 'string' ? o.description.trim().slice(0, 140) : undefined;

  return { ok: true, deck: { id, name, color, icon, description, cards } };
}

export function parseDeckJSON(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Couldn't read that file. It isn't valid JSON." };
  }
  return validateDeck(data);
}

/** Card text for display. */
export function text(c: Card): string {
  return typeof c === 'string' ? c : c.text;
}

/** Serialise for export (no internal flags). */
export function exportDeck(d: Deck): string {
  const { custom: _c, ...rest } = d;
  return JSON.stringify(rest, null, 2) + '\n';
}

/** Parse a textarea: one card per line, "Text | alias, alias" for aliases. */
export function parseCardLines(src: string): Card[] {
  return src
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [t, al] = l.split('|');
      const aliases = (al ?? '')
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean);
      return aliases.length ? { text: t.trim(), aliases } : t.trim();
    })
    .filter((c) => text(c));
}

export function cardsToLines(cards: Card[]): string {
  return cards
    .map((c) => (typeof c === 'string' ? c : c.aliases?.length ? `${c.text} | ${c.aliases.join(', ')}` : c.text))
    .join('\n');
}
