import { describe, expect, it } from 'vitest';
import { CardQueue, FLASH_MS, Round, shuffle } from './game';

function rng(seed = 1) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe('shuffle / CardQueue', () => {
  it('shuffle keeps every item', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    expect(shuffle(a, rng()).sort((x, y) => x - y)).toEqual(a);
  });

  it('never repeats a card until the deck is exhausted', () => {
    const cards = ['a', 'b', 'c', 'd', 'e'];
    const q = new CardQueue('t', cards, rng(3), false);
    const first = Array.from({ length: 5 }, () => q.next());
    expect([...first].sort()).toEqual(cards);
    const second = Array.from({ length: 5 }, () => q.next());
    expect([...second].sort()).toEqual(cards);
    expect(second[0]).not.toBe(first[4]);
  });
});

describe('Round', () => {
  function make(durationMs = 10_000) {
    let t = 0;
    const cards = ['one', 'two', 'three', 'four'];
    const round = new Round({
      queue: new CardQueue('t', cards, rng(), false),
      durationMs,
      now: () => t,
      autoTick: false,
    });
    const step = (ms: number) => {
      for (let i = 0; i < ms; i += 50) {
        t += 50;
        round.update();
      }
    };
    return { round, step };
  }

  it('counts down then deals a card', () => {
    const { round, step } = make();
    round.begin();
    expect(round.phase).toBe('countdown');
    step(3000);
    expect(round.phase).toBe('playing');
    expect(round.card).not.toBeNull();
  });

  it('ignores input during the flash, then deals the next card', () => {
    const { round, step } = make();
    round.startNow();
    expect(round.mark('correct')).toBe(true);
    expect(round.mark('correct')).toBe(false);
    step(FLASH_MS + 50);
    expect(round.phase).toBe('playing');
    expect(round.mark('pass')).toBe(true);
    expect(round.score).toBe(1);
    expect(round.results.map((r) => r.outcome)).toEqual(['correct', 'pass']);
  });

  it('pauses the clock', () => {
    const { round, step } = make(5000);
    round.startNow();
    step(1000);
    round.pause();
    step(10_000);
    expect(round.phase).toBe('playing');
    expect(round.remainingMs()).toBe(4000);
    round.resume();
    step(4100);
    expect(round.phase).toBe('ended');
  });
});
