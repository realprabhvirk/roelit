// Web Speech API wrapper. Defensive by design: voice is a bonus, tilt is the
// game. Nothing in here may throw into a round.
import { signal } from '@preact/signals';
import { heard, type CardInput } from './match';
import { log } from './debug';

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

// iOS runs one recogniser per page. Starting a new one while the previous one
// is still shutting down is a reliable way to end up with a dead mic, so every
// start waits for the last recogniser's `end` event (or a short timeout).
let liveRec: SR | null = null;
let idleWaiter: (() => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function whenIdle(fn: () => void): void {
  if (!liveRec) return fn();
  // Only the most recent start request matters.
  idleWaiter = fn;
  if (!idleTimer) {
    idleTimer = setTimeout(() => {
      log('voice: previous recogniser never ended, starting anyway');
      markIdle(liveRec);
    }, 1500);
  }
}

function markIdle(rec: SR | null): void {
  if (rec !== liveRec) return;
  liveRec = null;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const fn = idleWaiter;
  idleWaiter = null;
  fn?.();
}

/** Resolves once no recogniser holds the mic (or after `timeoutMs`). */
export function voiceIdle(timeoutMs = 1500): Promise<void> {
  if (!liveRec) return Promise.resolve();
  const until = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => (!liveRec || Date.now() > until ? resolve() : setTimeout(tick, 50));
    tick();
  });
}

/** 'granted' | 'denied' | 'prompt', or 'unknown' if the browser won't say. */
async function micPermission(): Promise<string> {
  try {
    const p = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return p.state;
  } catch {
    return 'unknown';
  }
}

const START_TIMEOUT_MS = 5000;

function pageHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

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
  private startTimer: ReturnType<typeof setTimeout> | null = null;
  private blocked = false;
  /** Has any session actually started? Distinguishes "refused" from "restart refused". */
  private everStarted = false;
  /** Sessions in a row that died within a second. */
  private quickFails = 0;
  /** Last error code from the recogniser (for Settings → Test voice). */
  lastError: string | null = null;
  /** ms from start() to onstart last time. Quick = iOS didn't need to ask. */
  private lastStartLatency: number | null = null;
  private launchedAt = 0;

  constructor(private opts: VoiceOptions) {
    this.status.subscribe((s) => log(`voice: ${s}`));
  }

  /** Swap callbacks (the listener is started in a tap, then handed to the round). */
  setHandlers(h: Pick<VoiceOptions, 'onMatch' | 'onTranscript'>): void {
    this.opts.onMatch = h.onMatch;
    this.opts.onTranscript = h.onTranscript;
  }

  get isBlocked(): boolean {
    return this.blocked;
  }

  /** Paused (iOS refused a restart, or it kept dying) — a tap can bring it back. */
  get canResume(): boolean {
    return !this.blocked && (this.status.value === 'paused' || this.status.value === 'off');
  }

  setLang(lang: string): void {
    this.opts.lang = lang;
  }

  /** Call from a tap where possible, so any iOS permission prompt has a reason to appear. */
  start(): void {
    if (this.blocked) return;
    const C = ctor();
    if (!C) {
      this.status.value = 'unavailable';
      return;
    }
    if (pageHidden()) return;
    this.wanted = true;
    this.quickFails = 0;
    if (this.rec) return;
    if (this.status.value !== 'listening') this.status.value = 'starting';
    whenIdle(() => this.wanted && !this.rec && this.launch(C));
  }

  /** Bring voice back after a pause. Must be called from a tap. */
  resume(): void {
    this.start();
  }

  /**
   * Start without a tap (round mounting, app back from background). Same rules
   * as an automatic restart: in a home-screen app only if the mic is already
   * allowed, so iOS never throws a permission prompt at you mid-game.
   */
  startQuietly(): void {
    if (this.blocked || this.rec || pageHidden()) return;
    const C = ctor();
    if (!C) {
      this.status.value = 'unavailable';
      return;
    }
    this.wanted = true;
    this.quickFails = 0;
    this.status.value = 'starting';
    void this.autoRestart(C);
  }

  stop(): void {
    this.wanted = false;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.restartTimer = null;
    this.startTimer = null;
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
    liveRec = rec;
    this.sessionStart = 0;
    this.lastResults = [];
    this.baseIndex = 0;
    this.baseWords = 0;
    this.status.value = 'starting';
    log('voice: launch');

    rec.onstart = () => {
      if (this.startTimer) clearTimeout(this.startTimer);
      this.startTimer = null;
      this.sessionStart = performance.now();
      this.lastStartLatency = this.sessionStart - this.launchedAt;
      log(`voice: started in ${Math.round(this.lastStartLatency)}ms`);
      this.everStarted = true;
      if (this.rec === rec) this.status.value = 'listening';
    };
    rec.onresult = (e: any) => {
      if (this.rec !== rec) return;
      this.backoff = 250;
      try {
        this.onResult(e);
      } catch (err) {
        log(`voice: result handler error ${String(err).slice(0, 120)}`);
      }
    };
    rec.onerror = (e: any) => {
      const err = e?.error as string | undefined;
      if (err !== 'no-speech') log(`voice: error ${err}`);
      if (this.rec !== rec) return;
      if (err && err !== 'no-speech' && err !== 'aborted') this.lastError = err;
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.wanted = false;
        if (!this.everStarted) {
          // Refused on the first try: genuinely blocked here.
          this.blocked = true;
          this.status.value = 'unavailable';
          this.opts.onBlocked?.(err);
        } else {
          // It worked, then iOS refused a restart. Don't keep poking it.
          this.status.value = 'paused';
        }
      } else if (err === 'audio-capture') {
        this.wanted = false;
        this.status.value = 'paused';
      } else if (err === 'network') {
        this.status.value = 'offline';
        this.backoff = Math.max(this.backoff, 2000);
      }
      // no-speech / aborted: onend decides whether to restart.
    };
    rec.onend = () => {
      markIdle(rec);
      if (this.startTimer) clearTimeout(this.startTimer);
      this.startTimer = null;
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
        log('voice: dying instantly, giving up until tapped');
        this.wanted = false;
        this.status.value = 'paused';
        return;
      }
      this.backoff = lived < 1000 ? Math.min(this.backoff * 2, 4000) : 250;
      if (this.status.value === 'listening') this.status.value = 'starting';
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (!this.wanted || pageHidden()) return;
        void this.autoRestart(C);
      }, this.backoff);
    };

    // A start that never reports back usually means iOS is sitting on a
    // permission request. Don't leave the UI saying "Starting" forever.
    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      if (this.rec !== rec || this.everStartedFor(rec)) return;
      log('voice: start never confirmed, aborting');
      this.lastError = this.lastError ?? 'start-timeout';
      this.wanted = false;
      this.rec = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      this.status.value = 'paused';
    }, START_TIMEOUT_MS);

    try {
      this.launchedAt = performance.now();
      rec.start();
    } catch (err) {
      // Threw synchronously (already started / not allowed). Don't loop.
      log(`voice: start threw ${String(err).slice(0, 120)}`);
      markIdle(rec);
      if (this.startTimer) clearTimeout(this.startTimer);
      this.startTimer = null;
      this.rec = null;
      this.wanted = false;
      this.status.value = this.everStarted ? 'paused' : 'unavailable';
    }
  }

  private everStartedFor(rec: SR): boolean {
    return this.rec === rec && this.sessionStart > 0;
  }

  /**
   * Restart without a tap. In a home-screen app iOS may re-ask for the mic on
   * every start, and an unexpected system prompt mid-game reads as a freeze.
   * So there, only restart when the mic is already allowed; otherwise pause
   * and let a tap on the mic pill bring it back.
   */
  private async autoRestart(C: new () => SR): Promise<void> {
    if (isStandalone()) {
      const perm = await micPermission();
      // iOS home-screen apps often report "prompt" even after you've said yes.
      // A start that came back almost instantly means no prompt was shown, so
      // another one won't show one either.
      const quietLastTime = this.lastStartLatency !== null && this.lastStartLatency < 800;
      if (perm !== 'granted' && !quietLastTime) {
        log(`voice: not auto-restarting (mic permission ${perm}, last start ${Math.round(this.lastStartLatency ?? -1)}ms)`);
        this.wanted = false;
        this.status.value = 'paused';
        return;
      }
    }
    if (!this.wanted || this.rec) return;
    whenIdle(() => this.wanted && !this.rec && this.launch(C));
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
