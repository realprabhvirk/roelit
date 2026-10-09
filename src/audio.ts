// Tiny Web Audio synth. Everything is generated, nothing to download.
// iOS needs the context created/resumed inside a user gesture, so
// unlockAudio() is wired to the first pointerdown in main.tsx.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

export function unlockAudio(): void {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      // A silent blip is what actually unlocks output on older iOS.
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    }
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* no audio, no problem */
  }
}

/**
 * iOS 16.4+ Audio Session API. "playback" plays through the silent switch
 * (handy at a party), but while the mic is live we hand control back to
 * "auto" so recognition and our sounds can share the session.
 */
let sessionType: string | null = null;

export function setAudioSessionForMic(micLive: boolean): void {
  const want = micLive ? 'auto' : 'playback';
  // Switching makes iOS reconfigure audio (and can stall the page), so only
  // touch it when it actually changes.
  if (want === sessionType) return;
  try {
    const s = (navigator as any).audioSession;
    if (s && 'type' in s) {
      s.type = want;
      sessionType = want;
    }
  } catch {
    /* ignore */
  }
}

function ready(): AudioContext | null {
  if (!enabled || !ctx || !master) return null;
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  c: AudioContext,
  opts: { type?: OscillatorType; f: number; f2?: number; at?: number; dur: number; gain: number; attack?: number },
): void {
  const t0 = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(opts.f, t0);
  if (opts.f2) o.frequency.exponentialRampToValueAtTime(opts.f2, t0 + opts.dur);
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + opts.dur + 0.02);
}

export const sfx = {
  /** Rising two-note tick. */
  correct() {
    const c = ready();
    if (!c) return;
    tone(c, { type: 'triangle', f: 784, dur: 0.12, gain: 0.32 });
    tone(c, { type: 'triangle', f: 1175, at: 0.085, dur: 0.2, gain: 0.32 });
    tone(c, { type: 'sine', f: 392, at: 0.085, dur: 0.18, gain: 0.12 });
  },
  /** Soft low thud. */
  pass() {
    const c = ready();
    if (!c) return;
    tone(c, { type: 'sine', f: 190, f2: 70, dur: 0.22, gain: 0.55, attack: 0.004 });
    tone(c, { type: 'triangle', f: 120, f2: 60, dur: 0.12, gain: 0.18 });
  },
  countdown() {
    const c = ready();
    if (!c) return;
    tone(c, { type: 'sine', f: 660, dur: 0.12, gain: 0.3 });
  },
  go() {
    const c = ready();
    if (!c) return;
    tone(c, { type: 'sine', f: 990, dur: 0.28, gain: 0.32 });
  },
  /** Woodblock-ish tick for the last ten seconds. */
  tick() {
    const c = ready();
    if (!c) return;
    tone(c, { type: 'triangle', f: 1600, dur: 0.045, gain: 0.16, attack: 0.002 });
  },
  /** End-of-round buzzer: two detuned saws through a low-pass. */
  buzzer() {
    const c = ready();
    if (!c || !master) return;
    const t0 = c.currentTime;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
    g.gain.setValueAtTime(0.22, t0 + 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.8);
    lp.connect(g).connect(master);
    for (const f of [146, 151]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 0.82);
    }
  },
};
