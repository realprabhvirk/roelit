// Web Speech API wrapper. Defensive by design: voice is a bonus, tilt is the
// game. Nothing in here may throw into a round.
import { signal } from '@preact/signals';
import { heard, type CardInput } from './match';

export type VoiceStatus = 'off' | 'starting' | 'listening' | 'unavailable' | 'offline';

type SR = any; // SpeechRecognition isn't in lib.dom for every TS version.

function ctor(): (new () => SR) | null {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function voiceSupported(): boolean {
  return ctor() !== null;
}

export function isStandalone(): boolean {
  try {
    return (
      (navigator as any).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    );
  } catch {
    return false;
  }
}

const MAX_WORDS = 12;
const DEBOUNCE_MS = 800;

export type VoiceOptions = {
  lang: string;
  /** Fired when the current card is heard. */
  onMatch?: () => void;
  /** Every transcript update (for the Test voice screen). */
  onTranscript?: (text: string) => void;
  /** Permission was refused / service blocked. */
  onBlocked?: () => void;
  /** Got real results back: voice works here. */
  onWorking?: () => void;
};

export class VoiceListener {
  readonly status = signal<VoiceStatus>('off');

  private rec: SR | null = null;
  private wanted = false;
  private card: CardInput | null = null;
  private cardAt = 0;
  private baseIndex = 0;
  private baseWords = 0;
  private lastResults: { text: string; final: boolean }[] = [];
  private backoff = 250;
  private sessionStart = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private blocked = false;

  constructor(private opts: VoiceOptions) {}

  /** Swap callbacks (the listener is started in a tap, then handed to the round). */
  setHandlers(h: Pick<VoiceOptions, 'onMatch' | 'onTranscript'>): void {
    this.opts.onMatch = h.onMatch;
    this.opts.onTranscript = h.onTranscript;
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  setLang(lang: string): void {
    this.opts.lang = lang;
  }

  /** Call from a tap the first time so iOS shows its permission prompts. */
  start(): void {
    if (this.blocked) return;
    const C = ctor();
    if (!C) {
      this.status.value = 'unavailable';
      return;
    }
    this.wanted = true;
    this.launch(C);
  }

  stop(): void {
    this.wanted = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const r = this.rec;
    this.rec = null;
    try {
      r?.abort();
    } catch {
      /* ignore */
    }
    if (this.status.value !== 'unavailable') this.status.value = 'off';
  }

  /** New card: forget everything heard so far so the old word can't re-trigger. */
  setCard(card: CardInput | null): void {
    this.card = card;
    this.cardAt = performance.now();
    const last = this.lastResults[this.lastResults.length - 1];
    if (last && !last.final) {
      this.baseIndex = this.lastResults.length - 1;
      this.baseWords = words(last.text).length;
    } else {
      this.baseIndex = this.lastResults.length;
      this.baseWords = 0;
    }
  }

  private launch(C: new () => SR): void {
    if (this.rec) return;
    let rec: SR;
    try {
      rec = new C();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.opts.lang;
      rec.maxAlternatives = 3;
    } catch {
      this.status.value = 'unavailable';
      return;
    }
    this.rec = rec;
    this.lastResults = [];
    this.baseIndex = 0;
    this.baseWords = 0;
    this.status.value = 'starting';

    rec.onstart = () => {
      this.sessionStart = performance.now();
      if (this.rec === rec) this.status.value = 'listening';
    };
    rec.onresult = (e: any) => {
      if (this.rec !== rec) return;
      this.backoff = 250;
      this.onResult(e);
    };
    rec.onerror = (e: any) => {
      const err = e?.error as string | undefined;
      if (err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture') {
        this.blocked = true;
        this.wanted = false;
        this.status.value = 'unavailable';
        this.opts.onBlocked?.();
      } else if (err === 'network') {
        this.status.value = 'offline';
        this.backoff = Math.max(this.backoff, 2000);
      }
      // no-speech / aborted: onend restarts us.
    };
    rec.onend = () => {
      if (this.rec !== rec) return;
      this.rec = null;
      if (!this.wanted) {
        if (this.status.value !== 'unavailable') this.status.value = 'off';
        return;
      }
      // iOS stops the recogniser on its own every so often. Restart, backing
      // off if sessions are dying instantly.
      const lived = performance.now() - this.sessionStart;
      this.backoff = lived < 1000 ? Math.min(this.backoff * 2, 4000) : 250;
      if (this.status.value === 'listening') this.status.value = 'starting';
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (this.wanted) this.launch(C);
      }, this.backoff);
    };

    try {
      rec.start();
    } catch {
      // "already started" or blocked: let onend/onerror sort it out.
      this.rec = null;
      this.restartTimer = setTimeout(() => this.wanted && this.launch(C), 1000);
    }
  }

  private onResult(e: any): void {
    const results = e.results;
    const list: { text: string; final: boolean; alts: string[] }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const alts: string[] = [];
      for (let j = 0; j < r.length; j++) alts.push(r[j]?.transcript ?? '');
      list.push({ text: alts[0] ?? '', final: !!r.isFinal, alts });
    }
    this.lastResults = list;
    this.opts.onWorking?.();

    // Words since the card changed.
    const fresh: string[] = [];
    let altTexts: string[] = [];
    for (let i = this.baseIndex; i < list.length; i++) {
      let w = words(list[i].text);
      if (i === this.baseIndex) w = w.slice(this.baseWords);
      fresh.push(...w);
      if (i === list.length - 1) {
        const skip = i === this.baseIndex ? this.baseWords : 0;
        altTexts = list[i].alts.slice(1).map((a) => words(a).slice(skip).join(' '));
      }
    }
    const text = fresh.slice(-MAX_WORDS).join(' ');
    this.opts.onTranscript?.(text);

    if (!this.card || !this.opts.onMatch) return;
    if (performance.now() - this.cardAt < DEBOUNCE_MS) return;
    const hit = heard(text, this.card) || altTexts.some((a) => heard(a, this.card!));
    if (hit) {
      const cb = this.opts.onMatch;
      // Clear before firing so it can't double-trigger.
      this.setCard(null);
      try {
        cb();
      } catch {
        /* never let a UI bug kill recognition */
      }
    }
  }
}

function words(s: string): string[] {
  return s.trim().split(/\s+/).filter(Boolean);
}
