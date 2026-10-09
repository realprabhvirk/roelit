// App-wide persisted state (settings, custom decks, best scores).
import { computed, effect, signal } from '@preact/signals';
import { load, save, clearAll } from './storage';
import type { Deck } from './deck';
import type { Sensitivity } from './tilt';
import { BUILT_IN_DECKS } from './decks';

export type Theme = 'system' | 'light' | 'dark';
export type VoiceLang = 'en-AU' | 'en-US' | 'en-GB';

export type Settings = {
  roundLength: number;
  sensitivity: Sensitivity;
  voice: boolean;
  voiceLang: VoiceLang;
  sound: boolean;
  flipTilt: boolean;
  theme: Theme;
};

export const ROUND_LENGTHS = [30, 60, 90, 120] as const;

const DEFAULTS: Settings = {
  roundLength: 60,
  sensitivity: 'medium',
  voice: true,
  voiceLang: 'en-AU',
  sound: true,
  flipTilt: false,
  theme: 'system',
};

export const settings = signal<Settings>({ ...DEFAULTS, ...load<Partial<Settings>>('settings', {}) });
effect(() => save('settings', settings.value));

export function setSetting<K extends keyof Settings>(k: K, v: Settings[K]): void {
  settings.value = { ...settings.value, [k]: v };
}

export const customDecks = signal<Deck[]>(load<Deck[]>('customDecks', []));
effect(() => save('customDecks', customDecks.value));

export const allDecks = computed<Deck[]>(() => [...BUILT_IN_DECKS, ...customDecks.value]);

export function findDeck(id: string | null | undefined): Deck | undefined {
  return id ? allDecks.value.find((d) => d.id === id) : undefined;
}

/** Unique id that doesn't clash with any existing deck. */
export function uniqueDeckId(base: string, ignore?: string): string {
  const taken = new Set(allDecks.value.map((d) => d.id).filter((id) => id !== ignore));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function upsertCustomDeck(deck: Deck): void {
  const d = { ...deck, custom: true };
  const list = customDecks.value;
  const i = list.findIndex((x) => x.id === d.id);
  customDecks.value = i >= 0 ? list.map((x, j) => (j === i ? d : x)) : [...list, d];
}

export function deleteCustomDeck(id: string): void {
  customDecks.value = customDecks.value.filter((d) => d.id !== id);
}

export const bestScores = signal<Record<string, number>>(load('best', {}));
effect(() => save('best', bestScores.value));

/** Returns true if this is a new best. */
export function recordScore(deckId: string, score: number): boolean {
  const prev = bestScores.value[deckId] ?? 0;
  if (score > prev) {
    bestScores.value = { ...bestScores.value, [deckId]: score };
    return prev > 0;
  }
  return false;
}

export const lastDeckId = signal<string | null>(load('lastDeck', null));
effect(() => save('lastDeck', lastDeckId.value));

/** Remembered motion permission ("granted" | "denied" | null = never asked). */
export const motionPermission = signal<'granted' | 'denied' | null>(load('motionPerm', null));
effect(() => save('motionPerm', motionPermission.value));

/** Mic: we've asked at least once. */
export const micAsked = signal<boolean>(load('micAsked', false));
effect(() => save('micAsked', micAsked.value));

/** Voice health from the last attempt: lets Settings explain what happened. */
export const voiceHealth = signal<'unknown' | 'ok' | 'blocked' | 'unsupported'>(load('voiceHealth', 'unknown'));
effect(() => save('voiceHealth', voiceHealth.value));

export const installDismissed = signal<boolean>(load('installDismissed', false));
effect(() => save('installDismissed', installDismissed.value));

export function resetAll(): void {
  clearAll();
  location.reload();
}
