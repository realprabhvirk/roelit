// Pure speech-to-card matching. No DOM, no state: everything here is unit
// tested in match.test.ts.

export type CardInput = string | { text: string; aliases?: string[] };

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

// Both sides get folded to the same short form, so "6 Stockade Cr" matches a
// recogniser that writes "six stockade crescent".
const FOLD: Record<string, string> = {
  street: 'st', saint: 'st', road: 'rd', crescent: 'cr', cres: 'cr', avenue: 'ave', av: 'ave',
  mount: 'mt', doctor: 'dr', mister: 'mr', drive: 'dr', okay: 'ok', vs: 'versus',
  '&': 'and', n: 'and',
};

// Filler words that are optional inside a card ("Lord of the Rings" matches
// "lord the rings", "The Office" matches "office").
const OPTIONAL = new Set(['the', 'a', 'an', 'and', 'of']);

/** Lowercase, strip diacritics/punctuation, collapse whitespace. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '') // don't -> dont, roel's -> roels
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Turn runs of number words into digit tokens.
 *   "forty two" -> "42", "one hundred and eighty" -> "180",
 *   "one eleven" -> "1 11" (merged later into "111" as an alternative).
 */
export function wordsToNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (!(t in UNITS) && !(t in TENS) && !(t === 'a' && tokens[i + 1] === 'hundred')) {
      out.push(t);
      i++;
      continue;
    }
    let value = 0;
    let last: 'unit' | 'tens' | 'hundred' | null = null;
    while (i < tokens.length) {
      const w = tokens[i];
      if (w === 'a' && tokens[i + 1] === 'hundred' && last === null) {
        value = 1;
        last = 'unit';
        i++;
      } else if (w in TENS) {
        if (last === 'unit' || last === 'tens') break;
        value += TENS[w];
        last = 'tens';
        i++;
      } else if (w in UNITS) {
        const u = UNITS[w];
        if (last === 'unit') break;
        if (last === 'tens' && u >= 10) break;
        value += u;
        last = 'unit';
        i++;
      } else if (w === 'hundred' && last !== null && last !== 'hundred') {
        value = value * 100;
        last = 'hundred';
        i++;
      } else if (w === 'and' && last === 'hundred' && (tokens[i + 1] ?? '') in { ...UNITS, ...TENS }) {
        i++;
      } else {
        break;
      }
    }
    out.push(String(value));
  }
  return out;
}

export function tokenise(text: string): string[] {
  const raw = normalise(text).split(' ').filter(Boolean);
  return wordsToNumbers(raw).map((t) => FOLD[t] ?? t);
}

/** Collapse adjacent digit tokens: ["1","80","degrees"] -> ["180","degrees"]. */
export function mergeDigits(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const prev = out[out.length - 1];
    if (prev !== undefined && /^\d+$/.test(t) && /^\d+$/.test(prev)) out[out.length - 1] = prev + t;
    else out.push(t);
  }
  return out;
}

/** Very small stemmer: plurals, possessives, -ed, -ing. */
export function stem(t: string): string {
  if (/^\d+$/.test(t)) return t;
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 4 && /(ches|shes|xes|sses|zes)$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  if (t.length > 5 && t.endsWith('ing')) return undouble(t.slice(0, -3));
  if (t.length > 4 && t.endsWith('ed')) return undouble(t.slice(0, -2));
  return t;
}

// swimm -> swim, hopp -> hop (but keep "ll", "ss": fall, kiss)
function undouble(t: string): string {
  return /([bdgmnprt])\1$/.test(t) ? t.slice(0, -1) : t;
}

export function levenshtein(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Does a heard token count as the card token? */
export function tokenMatches(heard: string, target: string): boolean {
  if (heard === target) return true;
  // Numbers and short tokens ("sp", "hj", "42") must be exact.
  if (/^\d+$/.test(target) || /^\d+$/.test(heard)) return false;
  if (target.length <= 2) return false;
  const hs = stem(heard);
  const ts = stem(target);
  if (hs === ts) return true;
  if (target.length >= 5 && heard.length >= 4 && levenshtein(heard, target, 1) <= 1) return true;
  if (ts.length >= 5 && levenshtein(hs, ts, 1) <= 1) return true;
  return false;
}

/** Every way a card can be said, as token lists. */
export function targetsFor(card: CardInput): string[][] {
  const texts = typeof card === 'string' ? [card] : [card.text, ...(card.aliases ?? [])];
  const out: string[][] = [];
  const seen = new Set<string>();
  const add = (toks: string[]) => {
    if (!toks.length) return;
    const k = toks.join(' ');
    if (seen.has(k)) return;
    seen.add(k);
    out.push(toks);
  };
  for (const text of texts) {
    const toks = mergeDigits(tokenise(text));
    const core = toks.filter((t) => !OPTIONAL.has(t));
    add(core.length ? core : toks);
    // "Spider-Man" also as "spiderman", "Tim Tam" as "timtam".
    if (toks.length > 1 && toks.length <= 3) add([toks.join('')]);
  }
  return out;
}

const WINDOW = 6;

function matchSingle(heard: string[], target: string): boolean {
  for (let i = 0; i < heard.length; i++) {
    if (tokenMatches(heard[i], target)) return true;
    // Recogniser split a compound: "spider man" for "spiderman", "s p" for "sp".
    let joined = heard[i];
    for (let j = i + 1; j < Math.min(heard.length, i + 3); j++) {
      joined += heard[j];
      if (joined === target || (target.length >= 5 && tokenMatches(joined, target))) return true;
    }
  }
  return false;
}

/** All target tokens, in order, inside a short window of heard words. */
function matchSequence(heard: string[], target: string[]): boolean {
  const span = Math.max(WINDOW, target.length + 3);
  for (let start = 0; start < heard.length; start++) {
    if (!tokenMatches(heard[start], target[0])) continue;
    let k = 1;
    for (let i = start + 1; i < heard.length && i - start < span && k < target.length; i++) {
      if (tokenMatches(heard[i], target[k])) k++;
    }
    if (k === target.length) return true;
  }
  return false;
}

/** Tokens to match against, given raw recogniser text. */
export function heardTokens(transcript: string): string[][] {
  const toks = tokenise(transcript).filter((t) => !OPTIONAL.has(t));
  const merged = mergeDigits(toks);
  return merged.length !== toks.length ? [toks, merged] : [toks];
}

export function matchTokens(heardVariants: string[][], targets: string[][]): boolean {
  for (const heard of heardVariants) {
    for (const target of targets) {
      if (target.length === 1 ? matchSingle(heard, target[0]) : matchSequence(heard, target)) return true;
    }
  }
  return false;
}

/** Main entry: did the recogniser say this card? */
export function heard(transcript: string, card: CardInput): boolean {
  return matchTokens(heardTokens(transcript), targetsFor(card));
}

export function cardText(card: CardInput): string {
  return typeof card === 'string' ? card : card.text;
}
