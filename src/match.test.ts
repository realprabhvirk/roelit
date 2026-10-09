import { describe, expect, it } from 'vitest';
import { heard, levenshtein, normalise, stem, tokenise, wordsToNumbers } from './match';

describe('normalise', () => {
  it('lowercases, strips punctuation and diacritics', () => {
    expect(normalise('  Pokémon!!  Go ')).toBe('pokemon go');
    expect(normalise("Spider-Man")).toBe('spider man');
    expect(normalise("Don't")).toBe('dont');
    expect(normalise('Fish & Chips')).toBe('fish and chips');
  });
});

describe('numbers', () => {
  it('converts number words to digits', () => {
    expect(wordsToNumbers(['forty', 'two'])).toEqual(['42']);
    expect(wordsToNumbers(['one', 'hundred', 'and', 'eighty', 'degrees'])).toEqual(['180', 'degrees']);
    expect(wordsToNumbers(['one', 'eleven'])).toEqual(['1', '11']);
    expect(wordsToNumbers(['a', 'hundred'])).toEqual(['100']);
    expect(wordsToNumbers(['six', 'example'])).toEqual(['6', 'example']);
  });
  it('folds street abbreviations both ways', () => {
    expect(tokenise('6 Example Crescent')).toEqual(tokenise('6 Example Cr'));
  });
});

describe('stem / levenshtein', () => {
  it('handles plurals and tense', () => {
    expect(stem('kangaroos')).toBe('kangaroo');
    expect(stem('ponies')).toBe('pony');
    expect(stem('boxes')).toBe('box');
    expect(stem('jumping')).toBe('jump');
    expect(stem('jumped')).toBe('jump');
  });
  it('measures edit distance', () => {
    expect(levenshtein('wombat', 'wombot')).toBe(1);
    expect(levenshtein('cat', 'dog')).toBe(3);
  });
});

describe('heard: single word', () => {
  it('matches the exact word inside a sentence', () => {
    expect(heard('is it a kangaroo', 'Kangaroo')).toBe(true);
  });
  it('matches plurals and tense variants', () => {
    expect(heard('kangaroos', 'Kangaroo')).toBe(true);
    expect(heard('swimming', 'Swim')).toBe(true);
  });
  it('tolerates one recogniser slip on longer words', () => {
    expect(heard('wombot', 'Wombat')).toBe(true);
    expect(heard('platypuss', 'Platypus')).toBe(true);
  });
  it('does not fuzz short words', () => {
    expect(heard('cut', 'Cat')).toBe(false);
    expect(heard('bat', 'Cat')).toBe(false);
  });
  it('respects word boundaries', () => {
    expect(heard('category', 'Cat')).toBe(false);
    expect(heard('scatter', 'Cat')).toBe(false);
  });
  it('joins split compounds', () => {
    expect(heard('spider man', 'Spiderman')).toBe(true);
    expect(heard('tim tam', 'Tim Tam')).toBe(true);
    expect(heard('timtam', 'Tim Tam')).toBe(true);
  });
  it('rejects unrelated speech', () => {
    expect(heard('it has a pouch and hops', 'Kangaroo')).toBe(false);
    expect(heard('', 'Kangaroo')).toBe(false);
  });
});

describe('heard: multi-word', () => {
  it('needs all tokens in order', () => {
    expect(heard('harry potter', 'Harry Potter')).toBe(true);
    expect(heard('oh is it harry umm potter', 'Harry Potter')).toBe(true);
    expect(heard('potter harry', 'Harry Potter')).toBe(false);
    expect(heard('harry', 'Harry Potter')).toBe(false);
  });
  it('needs the tokens close together', () => {
    expect(heard('harry went to the shops and bought a really big pottery wheel potter', 'Harry Potter')).toBe(false);
  });
  it('skips filler words', () => {
    expect(heard('lord rings', 'The Lord of the Rings')).toBe(true);
    expect(heard('the office', 'The Office')).toBe(true);
    expect(heard('fish n chips', 'Fish and Chips')).toBe(true);
  });
  it('handles numbers spoken as words', () => {
    expect(heard('one eighty degrees', '180 Degrees')).toBe(true);
    expect(heard('one hundred and eighty degrees', '180 Degrees')).toBe(true);
    expect(heard('one eleven example terrace', '111 Example Terrace')).toBe(true);
    expect(heard('six example crescent', '6 Example Cr')).toBe(true);
    expect(heard('forty two', '42')).toBe(true);
    expect(heard('farewell twenty twenty four', 'Farewell 2024')).toBe(true);
  });
  it('handles hyphens and punctuation in the card', () => {
    expect(heard('spiderman', 'Spider-Man')).toBe(true);
    expect(heard('spider man', 'Spider-Man')).toBe(true);
  });
});

describe('heard: aliases', () => {
  const card = { text: 'Jane Smith', aliases: ['SP'] };
  it('matches the main text or any alias', () => {
    expect(heard('jane smith', card)).toBe(true);
    expect(heard('its sp', card)).toBe(true);
    expect(heard('s p', card)).toBe(true);
  });
  it('keeps short aliases exact', () => {
    expect(heard('spa', card)).toBe(false);
  });
});
