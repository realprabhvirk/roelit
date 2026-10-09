import type { Deck } from '../deck';
import animals from './animals.json';
import moviesTv from './movies-tv.json';
import famousPeople from './famous-people.json';
import foodDrink from './food-drink.json';
import actItOut from './act-it-out.json';
import aroundAustralia from './around-australia.json';
import brandsApps from './brands-apps.json';
import jobsTrades from './jobs-trades.json';
import theCrew from './the-crew.json';

export const BUILT_IN_DECKS: Deck[] = [
  animals,
  moviesTv,
  famousPeople,
  foodDrink,
  actItOut,
  aroundAustralia,
  brandsApps,
  jobsTrades,
  theCrew,
] as Deck[];
