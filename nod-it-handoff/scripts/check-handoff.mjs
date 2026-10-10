// Verifies the handoff without needing the deck code:
//  1. every decks/*.json except sporrenceson.json is byte-identical to src/decks (when run in the ROEL IT! repo)
//  2. hashes match decks/MANIFEST.md
//  3. the SPORRENCESON list in NOD-IT-FULL-PROMPT.md matches decks/sporrenceson.json exactly
//  4. sporrenceson.json has the same metadata and card count as the encrypted file
// Exit code 1 on any mismatch.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('../', import.meta.url).pathname;
const DECKS = join(HERE, 'decks');
const SRC = join(HERE, '../src/decks');
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
let bad = 0;
const fail = (m) => {
  bad++;
  console.error('FAIL ' + m);
};

const manifest = readFileSync(join(DECKS, 'MANIFEST.md'), 'utf8');
for (const f of readdirSync(DECKS).filter((f) => f.endsWith('.json'))) {
  const h = sha(readFileSync(join(DECKS, f)));
  if (!manifest.includes(`\`${f}\``) || !manifest.includes(h)) fail(`${f} hash not in MANIFEST.md`);
  const srcName = f === 'sporrenceson.locked.json' ? 'the-crew.locked.json' : f;
  if (f !== 'sporrenceson.json' && existsSync(join(SRC, srcName)) && sha(readFileSync(join(SRC, srcName))) !== h) fail(`${f} differs from src/decks/${srcName}`);
}

const plain = JSON.parse(readFileSync(join(DECKS, 'sporrenceson.json'), 'utf8'));
const locked = JSON.parse(readFileSync(join(DECKS, 'sporrenceson.locked.json'), 'utf8'));
for (const k of ['id', 'name', 'color', 'icon', 'description']) if (plain[k] !== locked[k]) fail(`sporrenceson ${k} differs between plain and locked`);
if (plain.cards.length !== locked.count) fail(`sporrenceson has ${plain.cards.length} cards, locked file says ${locked.count}`);

const prompt = readFileSync(join(HERE, 'NOD-IT-FULL-PROMPT.md'), 'utf8');
const m = prompt.match(/<!-- SPORRENCESON:START -->\n([\s\S]*?)\n<!-- SPORRENCESON:END -->/);
if (!m) fail('SPORRENCESON list missing from the prompt');
else {
  const listed = m[1].split('\n').map((l) => l.replace(/^\d+\.\s/, ''));
  const expected = plain.cards.map((c) => (typeof c === 'string' ? c : `${c.text}${c.aliases?.length ? ` (aliases: ${c.aliases.join(', ')})` : ''}`));
  if (JSON.stringify(listed) !== JSON.stringify(expected)) {
    fail('SPORRENCESON list in the prompt does not match sporrenceson.json');
    expected.forEach((e, i) => e !== listed[i] && console.error(`  #${i + 1}: prompt "${listed[i]}" vs json "${e}"`));
  }
}
console.log(bad ? `${bad} problem(s)` : 'handoff OK: decks verbatim, hashes match, SPORRENCESON list matches its JSON');
process.exit(bad ? 1 : 0);
