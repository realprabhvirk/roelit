import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { findDeck, micAsked, motionPermission, settings } from '../state';
import { onColor, resolveColor } from '../palette';
import { STRINGS } from '../strings';
import { motionNeedsPermission, motionSupported, requestMotionPermission } from '../tilt';
import { voiceSupported, type VoiceListener } from '../voice';
import { unlockAudio } from '../audio';
import { log } from '../debug';
import { CloseButton } from './controls';
import { Icon } from './icons';
import { go, isLandscape } from './router';
import { makeVoice, setChromeColor, tiltSensor, voiceBlockedHere } from './services';
import { MotionHelpSheet } from './HelpSheets';
import { HeadIllustration } from './Illustration';

// The recogniser is started inside a tap (iOS wants a gesture), then handed
// to the round screen.
let pendingVoice: VoiceListener | null = null;

export function takePendingVoice(): VoiceListener | null {
  const v = pendingVoice;
  pendingVoice = null;
  return v;
}

function voiceWanted(): boolean {
  return settings.value.voice && voiceSupported() && !voiceBlockedHere();
}

function startVoice(): void {
  if (!pendingVoice) pendingVoice = makeVoice({});
  pendingVoice.start();
}

export function stopPendingVoice(): void {
  pendingVoice?.stop();
  pendingVoice = null;
}

/**
 * Call synchronously from the tap that starts a game.
 * Never fire two iOS permission requests at once: two system prompts in the
 * same instant is asking for trouble. Motion goes first, voice after it settles.
 */
export function primeForRound(): void {
  const wantVoice = voiceWanted() && micAsked.value;
  if (motionNeedsPermission() && motionPermission.value === 'granted') {
    // Already allowed once: re-request inside this gesture (resolves silently).
    log('motion: re-request');
    requestMotionPermission()
      .then((r) => {
        log(`motion: ${r}`);
        if (r === 'denied') motionPermission.value = 'denied';
        else tiltSensor.refresh();
      })
      .finally(() => {
        if (wantVoice) startVoice();
      });
    return;
  }
  if (wantVoice) startVoice();
}

const UPRIGHT_HOLD_MS = 700;

export function PreRound({ deckId }: { deckId: string }) {
  const deck = findDeck(deckId);
  const [skipTilt, setSkipTilt] = useState(false);
  const [skipVoice, setSkipVoice] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [hasTilt, setHasTilt] = useState(tiltSensor.hasData);
  const [upright, setUpright] = useState(false);
  const uprightSince = useRef<number | null>(null);
  const started = useRef(false);

  const color = resolveColor(deck?.color ?? 'slate');
  const on = onColor(deck?.color ?? 'slate');

  useEffect(() => {
    setChromeColor(color);
    tiltSensor.acquire();
    return () => {
      setChromeColor(null);
      tiltSensor.release();
    };
  }, [color]);

  const needMotion =
    !skipTilt && motionSupported() && motionNeedsPermission() && motionPermission.value !== 'granted';
  const motionDenied = needMotion && motionPermission.value === 'denied';
  const needMic = !needMotion && !skipVoice && voiceWanted() && !micAsked.value;
  const ready = !needMotion && !needMic;
  const landscape = isLandscape.value;

  const begin = (manual: boolean) => {
    if (started.current) return;
    started.current = true;
    if (manual) unlockAudio();
    const voice = settings.value.voice && !skipVoice && voiceWanted();
    if (!voice) stopPendingVoice();
    go({ name: 'round', deckId, tilt: !skipTilt, voice });
  };

  // Auto-start: landscape + phone held roughly upright for a moment.
  useEffect(() => {
    if (!ready || skipTilt) return;
    return tiltSensor.subscribe((s) => {
      if (!hasTilt) setHasTilt(true);
      const ok = s.upright && isLandscape.value;
      setUpright(ok);
      if (!ok) {
        uprightSince.current = null;
        return;
      }
      if (uprightSince.current == null) uprightSince.current = s.t;
      if (s.t - uprightSince.current > UPRIGHT_HOLD_MS) begin(false);
    });
  }, [ready, skipTilt, hasTilt]);

  // Desktop: Enter / Space starts.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (ready && (e.key === 'Enter' || e.key === ' ')) begin(true);
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ready]);

  const close = () => {
    stopPendingVoice();
    go({ name: 'tabs' });
  };

  if (!deck) return null;

  const enableMotion = () => {
    unlockAudio();
    log('motion: request');
    requestMotionPermission().then((r) => {
      log(`motion: ${r}`);
      motionPermission.value = r === 'granted' || r === 'unsupported' ? 'granted' : 'denied';
      if (r === 'granted') tiltSensor.refresh();
    });
  };

  const allowMic = () => {
    unlockAudio();
    micAsked.value = true;
    startVoice();
  };

  let title: string = STRINGS.forehead;
  let sub: string = STRINGS.tiltHint;
  let body: ComponentChildren = null;
  let actions: ComponentChildren = null;

  if (motionDenied) {
    title = 'Motion is off';
    sub = "iOS is blocking motion for this app, so tilt can't work yet. You can still play with taps.";
    actions = (
      <>
        <button class="btn btn-primary press" onClick={() => setHelpOpen(true)}>
          How to turn it on
        </button>
        <button class="btn btn-plain press" onClick={() => setSkipTilt(true)}>
          Play with taps
        </button>
      </>
    );
  } else if (needMotion) {
    title = 'Tilt needs motion';
    sub = 'iOS asks once. Say yes and tilting the phone does the scoring.';
    actions = (
      <>
        <button class="btn btn-primary press" onClick={enableMotion}>
          Enable motion
        </button>
        <button class="btn btn-plain press" onClick={() => setSkipTilt(true)}>
          Not now, use taps
        </button>
      </>
    );
  } else if (needMic) {
    title = 'Want it to listen?';
    sub = 'When someone says the word, it counts. iOS will ask for the mic.';
    actions = (
      <>
        <button class="btn btn-primary press" onClick={allowMic}>
          Allow microphone
        </button>
        <button class="btn btn-plain press" onClick={() => setSkipVoice(true)}>
          Skip voice
        </button>
      </>
    );
  } else {
    body = (
      <div class="pre-status" role="status">
        {!landscape ? (
          <>
            <Icon name="device-rotate" size={20} /> {STRINGS.turnSideways}
          </>
        ) : hasTilt && !skipTilt ? (
          <>
            <Icon name="phone" size={20} /> {upright ? 'Hold still…' : 'Hold it up to start'}
          </>
        ) : (
          <>
            <Icon name="hand-tap" size={20} /> Tap right edge for {STRINGS.correct} Left edge to pass.
          </>
        )}
      </div>
    );
    actions = (
      <button class="btn btn-primary press" onClick={() => begin(true)}>
        Start
      </button>
    );
  }

  return (
    <div class="fullscreen" style={{ background: color, color: on, ['--on' as any]: on, ['--deck' as any]: color }}>
      <CloseButton onClick={close} />
      <div class="pre">
        <div class="pre-main">
          <HeadIllustration fg={on} bg={color} />
          <div>
            <h1 class="display">{title}</h1>
            <p class="pre-sub" style={{ marginTop: 10 }}>
              {sub}
            </p>
            {body && <div style={{ marginTop: 16 }}>{body}</div>}
          </div>
        </div>
        <div class="pre-actions">{actions}</div>
      </div>
      <MotionHelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
