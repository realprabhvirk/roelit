// Lock / unlock The Crew deck.
//
//   node scripts/crew.mjs lock <plain-deck.json> <code>   write src/decks/the-crew.locked.json
//   node scripts/crew.mjs unlock <code>                   print the plain deck JSON (to edit and re-lock)
//
// The code is never stored in the repo. Anyone with the code can run `unlock`.
import { readFileSync, writeFileSync } from 'node:fs';
import { seal, open } from '../src/vault-crypto.ts';

const OUT = new URL('../src/decks/the-crew.locked.json', import.meta.url);
const [cmd, a, b] = process.argv.slice(2);

if (cmd === 'lock' && a && b) {
  const deck = JSON.parse(readFileSync(a, 'utf8'));
  if (!Array.isArray(deck.cards) || !deck.cards.length) throw new Error('deck.cards is empty');
  if (!/^\d{4,12}$/.test(b)) throw new Error('code must be 4-12 digits (the keypad is numbers only)');
  const sealed = await seal(JSON.stringify(deck.cards), b);
  // Prove it opens before writing anything.
  if ((await open(sealed, b)) !== JSON.stringify(deck.cards)) throw new Error('round trip failed');
  const { cards, ...meta } = deck;
  // codeLength tells the keypad how many digits to wait for. It reveals the
  // length only, never the code.
  writeFileSync(OUT, JSON.stringify({ ...meta, count: cards.length, codeLength: b.length, sealed }, null, 2) + '\n');
  console.log(`locked ${cards.length} cards -> src/decks/the-crew.locked.json`);
} else if (cmd === 'unlock' && a) {
  const locked = JSON.parse(readFileSync(OUT, 'utf8'));
  const json = await open(locked.sealed, a);
  if (json == null) throw new Error('wrong code');
  const { sealed, count, codeLength, ...meta } = locked;
  console.log(JSON.stringify({ ...meta, cards: JSON.parse(json) }, null, 2));
} else {
  console.error('usage: crew.mjs lock <plain.json> <code> | crew.mjs unlock <code>');
  process.exit(1);
}
