import type { Deck } from '../deck';
import animals from './animals.json';
import moviesTv from './movies-tv.json';
import famousPeople from './famous-people.json';
import foodDrink from './food-drink.json';
import actItOut from './act-it-out.json';
import aroundAustralia from './around-australia.json';
import brandsApps from './brands-apps.json';
import jobsTrades from './jobs-trades.json';
import crewLocked from './the-crew.locked.json';
import type { Sealed } from '../vault-crypto';

export const BUILT_IN_DECKS: Deck[] = [
  animals,
  moviesTv,
  famousPeople,
  foodDrink,
  actItOut,
  aroundAustralia,
  brandsApps,
  jobsTrades,
  {
    id: crewLocked.id,
    name: crewLocked.name,
    color: crewLocked.color,
    icon: crewLocked.icon,
    description: crewLocked.description,
    cards: [],
    lockedCount: crewLocked.count,
  },
] as Deck[];

/** The Crew's cards, encrypted. Opened with a passcode (see vault.ts). */
export const CREW_ID = crewLocked.id;
export const CREW_SEALED = crewLocked.sealed as Sealed;
/** How many digits the keypad waits for (length only, never the code). */
export const CREW_CODE_LENGTH: number = (crewLocked as { codeLength?: number }).codeLength ?? 6;
