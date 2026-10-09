// Tiny app router: the tab shell is always mounted, full-screen flows sit on top.
import { signal } from '@preact/signals';
import type { Result } from '../game';
import { log } from '../debug';

export type Tab = 'play' | 'decks' | 'settings';

export type Screen =
  | { name: 'tabs' }
  | { name: 'pre'; deckId: string }
  | { name: 'round'; deckId: string; tilt: boolean; voice: boolean; record: boolean }
  | { name: 'results'; deckId: string; results: Result[]; newBest: boolean; early?: boolean }
  | { name: 'tilt-test' };

export const tab = signal<Tab>('play');
tab.subscribe((t) => log(`tab ${t}`));
export const screen = signal<Screen>({ name: 'tabs' });

/** Bumped on every navigation so a re-entered screen remounts fresh. */
export let screenNonce = 0;

export function go(s: Screen): void {
  screenNonce++;
  log(`screen ${s.name}${'deckId' in s ? ' ' + s.deckId : ''}`);
  screen.value = s;
}

const landscapeQuery = typeof window !== 'undefined' ? window.matchMedia('(orientation: landscape)') : null;
export const isLandscape = signal<boolean>(landscapeQuery?.matches ?? false);
landscapeQuery?.addEventListener?.('change', (e) => (isLandscape.value = e.matches));
// iOS sometimes misses the media query change in standalone; belt and braces.
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    isLandscape.value = window.innerWidth > window.innerHeight;
  });
}
