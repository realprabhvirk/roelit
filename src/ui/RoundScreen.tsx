import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { findDeck, recordScore, settings } from '../state';
import { onColor, resolveColor } from '../palette';
import { STRINGS } from '../strings';
import { CardQueue, Round, type Outcome } from '../game';
import { THRESHOLDS, TiltDetector } from '../tilt';
import { sfx } from '../audio';
import { haptic } from '../haptics';
import { log } from '../debug';
import { keepAwake } from '../wakelock';
import { cardText } from '../match';
import { cameraStream, frameMode, stopCamera } from '../camera';
import { frameRotation, screenAngle } from '../videoOrientation';
import { cancelRecording, finishRecording, startRecording, type OverlayState } from '../recorder';
import type { Deck } from '../deck';
import type { VoiceStatus } from '../voice';
import { fitText, type Fit } from './fit';
import { Icon } from './icons';
import { go, isLandscape } from './router';
import { makeVoice, setChromeColor, tiltSensor } from './services';
import { takePendingVoice } from './PreRound';

const TIME_UP_MS = 1400;
const EARLY_MS = 700;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type RoundProps = { deckId: string; tilt: boolean; voice: boolean; record: boolean };

export function RoundScreen(props: RoundProps) {
  const deck = findDeck(props.deckId);
  // Deck vanished (e.g. The Crew got locked again): back out instead of crashing.
  useEffect(() => {
    if (!deck || !deck.cards.length) {
      log(`round: deck ${props.deckId} missing or empty, leaving`);
      go({ name: 'tabs' });
    }
  }, []);
  if (!deck || !deck.cards.length) return null;
  return <RoundView deck={deck} tilt={props.tilt} voiceOn={props.voice} record={props.record} />;
}

function RoundView({ deck, tilt, voiceOn, record }: { deck: Deck; tilt: boolean; voiceOn: boolean; record: boolean }) {
  const color = resolveColor(deck.color);
  const on = onColor(deck.color);

  const round = useMemo(
    () =>
      new Round({
        queue: new CardQueue(deck.id, deck.cards),
        durationMs: settings.value.roundLength * 1000,
      }),
    [],
  );
  const detector = useMemo(() => new TiltDetector({ threshold: THRESHOLDS[settings.value.sensitivity] }), []);
  const voice = useMemo(() => {
    if (!voiceOn) return null;
    return takePendingVoice() ?? makeVoice({});
  }, []);

  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const [flash, setFlash] = useState<{ outcome: Outcome; text: string } | null>(null);
  const [secLeft, setSecLeft] = useState(settings.value.roundLength);
  const [timeUp, setTimeUp] = useState(false);
  const [confirmQuit, setConfirmQuit] = useState(false);
  const confirming = useRef(false);
  const early = useRef(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>(voice ? voice.status.value : 'off');
  const [cardKey, setCardKey] = useState(0);
  const progressRef = useRef<HTMLDivElement>(null);
  const landscape = isLandscape.value;
  const [recording, setRecording] = useState(false);

  // What the recording overlay shows; updated from round events, read every frame.
  const ov = useRef<OverlayState>({
    phase: 'countdown',
    paused: false,
    countdown: 3,
    word: '',
    flash: null,
    score: 0,
    secLeft: settings.value.roundLength,
    progress: 1,
    deckName: deck.name,
    deckColor: color,
    onColor: on,
  });
  const overlay = (): OverlayState => ({
    ...ov.current,
    paused: round.isPaused && round.phase !== 'ended',
    progress: round.remainingMs() / round.durationMs,
    secLeft: Math.ceil(round.remainingMs() / 1000),
    score: round.score,
  });

  // ----- wiring -----
  useEffect(() => {
    let endTimer: ReturnType<typeof setTimeout> | undefined;
    log(`round: start ${deck.id} tilt=${tilt} voice=${!!voice} record=${record}`);
    const stream = cameraStream.value;
    if (record && stream)
      setRecording(
        startRecording(stream, overlay, deck.name, () => frameRotation(frameMode.value, screenAngle(), settings.value.flipVideo)),
      );
    setChromeColor(color);
    keepAwake(true);
    if (tilt) tiltSensor.acquire();

    const off = round.on((e) => {
      switch (e.type) {
        case 'countdown':
          ov.current = { ...ov.current, phase: 'countdown', countdown: e.n };
          if (e.n === 3) tiltSensor.beginCalibration();
          sfx.countdown();
          haptic('select');
          rerender();
          break;
        case 'start':
          sfx.go();
          tiltSensor.endCalibration();
          detector.reset();
          rerender();
          break;
        case 'card':
          ov.current = { ...ov.current, phase: 'playing', word: cardText(e.card), flash: null };
          voice?.setCard(e.card);
          setFlash(null);
          setCardKey((k) => k + 1);
          break;
        case 'mark':
          ov.current = { ...ov.current, phase: 'flash', flash: e.outcome };
          voice?.setCard(null);
          if (e.outcome === 'correct') sfx.correct();
          else sfx.pass();
          // On iPhone this only lands for edge taps (iOS allows haptics from taps only);
          // Android feels tilts and voice too.
          haptic(e.outcome === 'correct' ? 'roel' : 'pass');
          setFlash({ outcome: e.outcome, text: cardText(e.card) });
          break;
        case 'second':
          setSecLeft(e.left);
          if (e.left <= 10 && e.left > 0) sfx.tick();
          break;
        case 'end': {
          const isEarly = early.current;
          ov.current = { ...ov.current, phase: 'ended', flash: null, early: isEarly };
          // Hold the end card a moment, then wrap the clip up. Ending early
          // still keeps the video: it goes to results like a full round.
          finishRecording((isEarly ? EARLY_MS : TIME_UP_MS) + 900);
          if (!isEarly) {
            sfx.buzzer();
            haptic('error');
          }
          voice?.stop();
          setFlash(null);
          setTimeUp(true);
          // An early exit doesn't count towards your best.
          const newBest = isEarly ? false : recordScore(deck.id, round.score);
          const nothingHappened = isEarly && !round.results.length && !record;
          log(`round: ${isEarly ? 'ended early' : 'time'} score ${round.score}`);
          // Cleared on unmount: leaving during "Time!" must not yank you to results later.
          endTimer = setTimeout(
            () =>
              nothingHappened
                ? go({ name: 'tabs' })
                : go({ name: 'results', deckId: deck.id, results: round.results, newBest, early: isEarly }),
            isEarly ? EARLY_MS : TIME_UP_MS,
          );
          break;
        }
      }
    });

    let offVoice: (() => void) | undefined;
    if (voice) {
      voice.setHandlers({ onMatch: () => round.mark('correct') });
      const unsub = voice.status.subscribe((s) => setVoiceStatus(s));
      // Normally already started by the Start tap. If not, start without risking a prompt.
      if (voice.status.value === 'off' && !voice.isBlocked) voice.startQuietly();
      offVoice = unsub;
    }

    const offTilt = tilt
      ? tiltSensor.subscribe((s) => {
          const blocked = !round.canMark || !isLandscape.value;
          const dir = detector.feed(s.pitch, s.t, blocked);
          if (dir) round.mark(dir === 'down' ? 'correct' : 'pass');
        })
      : () => {};

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') round.mark('correct');
      else if (e.key === 'ArrowUp') round.mark('pass');
      else if (e.key === 'Escape') (confirming.current ? keepPlaying() : quit());
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        round.pause();
        voice?.stop();
      } else {
        if (isLandscape.value) round.resume();
        if (voice && round.phase !== 'ended') voice.startQuietly();
      }
      rerender();
    };
    document.addEventListener('visibilitychange', onVis);

    // Stop iOS rubber-banding / pinch on the game surface.
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    document.addEventListener('gesturestart', block);

    if (isLandscape.value) round.begin();
    else {
      round.pause();
      round.begin();
    }

    let raf = 0;
    const loop = () => {
      const el = progressRef.current;
      if (el) el.style.transform = `scaleX(${round.remainingMs() / round.durationMs})`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      // Listeners first: a leaked touchmove blocker would freeze scrolling app-wide.
      document.removeEventListener('touchmove', block);
      document.removeEventListener('gesturestart', block);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      cancelAnimationFrame(raf);
      clearTimeout(endTimer);
      // Left before the buzzer (quit, or the deck vanished): bin the clip, free the camera.
      if (round.phase !== 'ended') {
        cancelRecording();
        stopCamera();
      }
      for (const fn of [off, offTilt, () => offVoice?.(), () => voice?.stop(),
        () => round.dispose(), () => keepAwake(false), () => setChromeColor(null), () => tilt && tiltSensor.release()]) {
        try {
          fn();
        } catch {
          /* keep cleaning up */
        }
      }
    };
  }, []);

  // Portrait pauses the round (and an open "End round?" keeps it paused).
  useEffect(() => {
    if (landscape && !confirming.current) round.resume();
    else round.pause();
    rerender();
  }, [landscape]);

  // X / End round: ask first. The clock stops while you decide.
  const quit = () => {
    if (round.phase === 'ended' || confirming.current) return;
    confirming.current = true;
    round.pause();
    setConfirmQuit(true);
    log('round: asked to end');
  };
  const keepPlaying = () => {
    confirming.current = false;
    setConfirmQuit(false);
    if (isLandscape.value) round.resume();
    rerender();
  };
  const endNow = () => {
    confirming.current = false;
    setConfirmQuit(false);
    early.current = true;
    round.end();
  };

  const phase = round.phase;
  const card = round.card;
  const hurry = phase !== 'countdown' && secLeft <= 10 && !timeUp;

  return (
    <div
      class="fullscreen"
      style={{ background: color, color: on, ['--on' as any]: on }}
    >
      <div class="round">
        <div class="progress">
          <div ref={progressRef} />
        </div>
        <div class="round-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button class="icon-btn press" onClick={quit} aria-label="End round">
              <Icon name="x" size={22} />
            </button>
            <div class="round-score" aria-label={`Score ${round.score}`}>
              <Icon name="check" size={16} />
              <b>{round.score}</b>
            </div>
            {recording && (
              <span class="round-rec" aria-label="Recording">
                <span class="rec-dot" /> REC
              </span>
            )}
          </div>
          <div class={'round-timer' + (hurry ? ' hurry' : '')} role="timer">
            {fmt(secLeft)}
          </div>
        </div>

        {phase === 'countdown' ? (
          <div class="countdown display" aria-live="assertive">
            <span key={round.countdown}>{round.countdown}</span>
          </div>
        ) : (
          card && <Word key={cardKey} text={cardText(card)} />
        )}

        <button class="tap-zone left" data-haptic="none" aria-label={STRINGS.pass} onClick={() => round.mark('pass')} />
        <button class="tap-zone right" data-haptic="none" aria-label={STRINGS.correct} onClick={() => round.mark('correct')} />

        <div class="round-foot">
          <span class="edge-hint">
            <Icon name="arrow-bend-up-right" size={16} style={{ transform: 'scaleX(-1)' }} /> Pass
          </span>
          <MicPill on={!!voice} status={voiceStatus} onResume={voice?.canResume ? () => voice.resume() : undefined} />
          <span class="edge-hint">
            {STRINGS.correct} <Icon name="check" size={16} />
          </span>
        </div>
      </div>

      {flash && (
        <div class={'flash ' + flash.outcome} role="status">
          <div class="display">{flash.outcome === 'correct' ? STRINGS.correct : STRINGS.pass}</div>
          <div class="flash-word">{flash.text}</div>
        </div>
      )}

      {timeUp && (
        <div class="time-up">
          <span class="display">{early.current ? 'Ended' : STRINGS.time}</span>
        </div>
      )}

      {confirmQuit && !timeUp && (
        <div class="quit-confirm" role="alertdialog" aria-label="End this round?">
          <div class="quit-card">
            <h2 class="display">End this round?</h2>
            <p>{recording ? 'The clock is paused. Your video so far gets kept.' : 'The clock is paused.'}</p>
            <div class="quit-actions">
              <button class="btn btn-secondary press" onClick={keepPlaying}>
                Keep playing
              </button>
              <button class="btn btn-primary press" data-haptic="medium" onClick={endNow}>
                End round
              </button>
            </div>
          </div>
        </div>
      )}

      {!landscape && !timeUp && !confirmQuit && (
        <div class="overlay-msg">
          <Icon name="device-rotate" size={44} />
          <h2 class="display">{STRINGS.turnSideways}</h2>
          <p>Clock's paused until you do.</p>
          <button class="btn btn-secondary press" style={{ width: 'auto', marginTop: 12, background: 'rgba(243,237,226,0.14)', color: 'inherit' }} onClick={quit}>
            End round
          </button>
        </div>
      )}
    </div>
  );
}

function Word({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const landscape = isLandscape.value;

  useLayoutEffect(() => {
    const box = ref.current?.parentElement;
    if (!box) return;
    const measure = () => setFit(fitText(text, box.clientWidth, box.clientHeight));
    measure();
    // Re-fit once the display font is definitely in.
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, landscape]);

  return (
    <div class="word-box">
      <div
        ref={ref}
        class="word display enter"
        style={{ fontSize: fit ? fit.size : 10, visibility: fit ? 'visible' : 'hidden' }}
      >
        {(fit?.lines ?? [text]).join('\n')}
      </div>
    </div>
  );
}

function MicPill({ on, status, onResume }: { on: boolean; status: VoiceStatus; onResume?: () => void }) {
  if (!on) {
    return (
      <span class="mic-pill dim">
        <Icon name="microphone-slash" size={14} /> Voice off
      </span>
    );
  }
  const label =
    status === 'listening'
      ? 'Listening'
      : status === 'starting'
        ? 'Starting mic'
        : status === 'offline'
          ? 'Voice offline'
          : status === 'unavailable'
            ? 'Voice unavailable'
            : 'Voice paused';
  const live = status === 'listening';
  if (onResume && (status === 'paused' || status === 'off')) {
    return (
      <button class="mic-pill tappable press" onClick={onResume}>
        <Icon name="microphone" size={14} /> Tap to resume voice
      </button>
    );
  }
  return (
    <span class={'mic-pill' + (live ? ' live' : ' dim')} role="status">
      {live ? <span class="dot" /> : <Icon name="microphone-slash" size={14} />}
      {label}
    </span>
  );
}
