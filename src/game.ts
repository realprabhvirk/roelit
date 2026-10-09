// Round state machine + card order. Framework-free; the UI subscribes.
import type { Card } from './deck';
import { load, save } from './storage';
import { cardText } from './match';

export type Outcome = 'correct' | 'pass';
export type Result = { card: Card; outcome: Outcome };
export type Phase = 'countdown' | 'playing' | 'flash' | 'ended';

export const FLASH_MS = 650;
export const COUNTDOWN_FROM = 3;

export function shuffle<T>(arr: readonly T[], rand: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Deals cards without repeats until the whole deck has been seen (across
 * rounds), then reshuffles. Remaining order is persisted per deck.
 */
export class CardQueue {
  private remaining: string[];
  private readonly byText: Map<string, Card>;

  constructor(
    private readonly deckId: string,
    cards: Card[],
    private readonly rand: () => number = Math.random,
    private readonly persist = true,
  ) {
    this.byText = new Map(cards.map((c) => [cardText(c), c]));
    const saved = persist ? load<string[]>('queue:' + deckId, []) : [];
    // Drop anything that's no longer in the deck (edited custom decks).
    this.remaining = saved.filter((t) => this.byText.has(t));
    if (!this.remaining.length) this.refill();
  }

  private refill(avoid?: string): void {
    this.remaining = shuffle([...this.byText.keys()], this.rand);
    // Don't deal the same card twice in a row across a reshuffle.
    if (avoid && this.remaining.length > 1 && this.remaining[0] === avoid) {
      this.remaining.push(this.remaining.shift()!);
    }
  }

  next(): Card {
    const t = this.remaining.shift()!;
    if (!this.remaining.length) this.refill(t);
    if (this.persist) save('queue:' + this.deckId, this.remaining);
    return this.byText.get(t)!;
  }
}

export type RoundEvent =
  | { type: 'countdown'; n: number }
  | { type: 'start' }
  | { type: 'card'; card: Card }
  | { type: 'mark'; outcome: Outcome; card: Card }
  | { type: 'second'; left: number }
  | { type: 'end' };

export type RoundOptions = {
  queue: { next(): Card };
  durationMs: number;
  now?: () => number;
  /** Set false in tests to drive time manually with update(). */
  autoTick?: boolean;
};

export class Round {
  phase: Phase = 'countdown';
  card: Card | null = null;
  results: Result[] = [];
  countdown = COUNTDOWN_FROM;
  readonly durationMs: number;

  private readonly queue: { next(): Card };
  private readonly now: () => number;
  private readonly autoTick: boolean;
  private elapsedBefore = 0;
  private runningSince: number | null = null;
  private paused = false;
  private flashUntil = 0;
  private countdownAt = 0;
  private lastSecond = -1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(e: RoundEvent) => void>();

  constructor(opts: RoundOptions) {
    this.queue = opts.queue;
    this.durationMs = opts.durationMs;
    this.now = opts.now ?? (() => performance.now());
    this.autoTick = opts.autoTick ?? true;
  }

  on(cb: (e: RoundEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: RoundEvent): void {
    this.listeners.forEach((cb) => cb(e));
  }

  get score(): number {
    return this.results.filter((r) => r.outcome === 'correct').length;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  elapsedMs(): number {
    const live = this.runningSince != null ? this.now() - this.runningSince : 0;
    return this.elapsedBefore + live;
  }

  remainingMs(): number {
    return Math.max(0, this.durationMs - this.elapsedMs());
  }

  /** Kick off the 3-2-1. */
  begin(): void {
    this.phase = 'countdown';
    this.countdown = COUNTDOWN_FROM;
    this.countdownAt = this.now();
    this.emit({ type: 'countdown', n: this.countdown });
    if (this.autoTick && !this.timer) this.timer = setInterval(() => this.update(), 50);
  }

  /** Skip the countdown (manual start / tests). */
  startNow(): void {
    this.phase = 'playing';
    this.runningSince = this.paused ? null : this.now();
    this.lastSecond = Math.ceil(this.durationMs / 1000);
    this.emit({ type: 'start' });
    this.deal();
    if (this.autoTick && !this.timer) this.timer = setInterval(() => this.update(), 50);
  }

  private deal(): void {
    this.card = this.queue.next();
    this.emit({ type: 'card', card: this.card });
  }

  /** Accepting input right now? (Not during countdown, flash, pause or after the end.) */
  get canMark(): boolean {
    return this.phase === 'playing' && !this.paused;
  }

  mark(outcome: Outcome): boolean {
    if (!this.canMark || !this.card) return false;
    this.results.push({ card: this.card, outcome });
    this.phase = 'flash';
    this.flashUntil = this.now() + FLASH_MS;
    this.emit({ type: 'mark', outcome, card: this.card });
    return true;
  }

  pause(): void {
    if (this.paused || this.phase === 'ended') return;
    this.paused = true;
    if (this.runningSince != null) {
      this.elapsedBefore += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  resume(): void {
    if (!this.paused || this.phase === 'ended') return;
    this.paused = false;
    if (this.phase === 'countdown') {
      this.countdown = COUNTDOWN_FROM;
      this.countdownAt = this.now();
      this.emit({ type: 'countdown', n: this.countdown });
    } else {
      this.runningSince = this.now();
    }
  }

  end(): void {
    if (this.phase === 'ended') return;
    if (this.runningSince != null) {
      this.elapsedBefore += this.now() - this.runningSince;
      this.runningSince = null;
    }
    this.phase = 'ended';
    this.stopTimer();
    this.emit({ type: 'end' });
  }

  /** Abandon without an end event. */
  dispose(): void {
    this.stopTimer();
    this.listeners.clear();
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  update(): void {
    if (this.paused || this.phase === 'ended') return;
    const t = this.now();
    if (this.phase === 'countdown') {
      const n = COUNTDOWN_FROM - Math.floor((t - this.countdownAt) / 1000);
      if (n <= 0) this.startNow();
      else if (n !== this.countdown) {
        this.countdown = n;
        this.emit({ type: 'countdown', n });
      }
      return;
    }
    const left = this.remainingMs();
    const sec = Math.ceil(left / 1000);
    if (sec !== this.lastSecond) {
      this.lastSecond = sec;
      this.emit({ type: 'second', left: sec });
    }
    if (left <= 0) {
      this.end();
      return;
    }
    if (this.phase === 'flash' && t >= this.flashUntil) {
      this.phase = 'playing';
      this.deal();
    }
  }
}
