// Web Speech API wrapper. Defensive by design: voice is a bonus, tilt is the
// game. Nothing in here may throw into a round.
import { signal } from '@preact/signals';
import { heard, type CardInput } from './match';

export type VoiceStatus = 'off' | 'starting' | 'listening' | 'unavailable' | 'offline' | 'paused';

/** Plain-English reason for a recogniser error code, or null if it's routine. */
export function explainVoiceError(code: string | null): string | null {
  switch (code) {
    case 'service-not-allowed':
      return isStandalone()
        ? "iOS won't let the home-screen app use speech recognition. Check Dictation is on (Settings → General → Keyboard → Dictation). If it is, voice usually works when you open the game in Safari."
        : 'Speech recognition is off. Turn on Dictation: Settings → General → Keyboard → Dictation.';
    case 'not-allowed':
      return 'Mic or speech recognition permission was refused. Settings → Apps → Safari → Microphone, and allow Speech Recognition, then test again.';
    case 'audio-capture':
      return "Couldn't get the mic. Something else might be using it.";
    case 'network':
      return "Couldn't reach Apple's recogniser. Check your connection.";
    default:
      return null;
  }
}

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
  /** Permission was refused / service blocked, with the error code. */
  onBlocked?: (code: string) => void;
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
  /** Has any session actually started? Distinguishes "refused" from "restart refused". */
  private everStarted = false;
  /** Sessions in a row that died within a second. */
  private quickFails = 0;
  /** Last error code from the recogniser (for Settings → Test voice). */
  lastError: string | null = null;

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
    this.sessionStart = 0;
    this.lastResults = [];
    this.baseIndex = 0;
    this.baseWords = 0;
    this.status.value = 'starting';

    rec.onstart = () => {
      this.sessionStart = performance.now();
      this.everStarted = true;
      if (this.rec === rec) this.status.value = 'listening';
    };
    rec.onresult = (e: any) => {
      if (this.rec !== rec) return;
      this.backoff = 250;
      this.onResult(e);
    };
    rec.onerror = (e: any) => {
      const err = e?.error as string | undefined;
      if (err && err !== 'no-speech' && err !== 'aborted') this.lastError = err;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.wanted = false;
        if (!this.everStarted) {
          // Refused on the first try: genuinely blocked here.
          this.blocked = true;
          this.status.value = 'unavailable';
          this.opts.onBlocked?.(err);
        } else {
          // It worked, then iOS refused an automatic restart. Don't keep
          // poking it (that can re-show the mic prompt); sit this round out.
          this.status.value = 'paused';
        }
      } else if (err === 'audio-capture') {
        this.wanted = false;
        this.status.value = 'paused';
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
        // Keep an error state set by onerror; otherwise we just stopped.
        if (this.status.value !== 'unavailable' && this.status.value !== 'paused') this.status.value = 'off';
        return;
      }
      // iOS stops the recogniser on its own every so often. Restart, backing
      // off if sessions are dying instantly.
      const lived = this.sessionStart ? performance.now() - this.sessionStart : 0;
      this.quickFails = lived < 1000 ? this.quickFails + 1 : 0;
      if (this.quickFails >= 4) {
        // Dying instantly over and over: stop rather than loop.
        this.wanted = false;
        this.status.value = 'paused';
        return;
      }
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
      // Threw synchronously (already started / not allowed). Don't loop.
      this.rec = null;
      this.wanted = false;
      this.status.value = this.everStarted ? 'paused' : 'unavailable';
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
