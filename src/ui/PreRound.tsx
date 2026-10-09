import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { findDeck, micAsked, motionPermission, settings, setSetting } from '../state';
import { cameraStatus, cameraStream, cameraSupported, startCamera, stopCamera } from '../camera';
import { onColor, resolveColor } from '../palette';
import { STRINGS } from '../strings';
import { motionNeedsPermission, motionSupported, requestMotionPermission } from '../tilt';
import { voiceIdle, voiceSupported, type VoiceListener } from '../voice';
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
  // Recording takes the mic for the video, so voice sits those rounds out.
  const wantCamera = settings.value.record && cameraSupported();
  const wantVoice = !wantCamera && voiceWanted() && micAsked.value;
  const next = () => {
    if (wantCamera) void startCamera();
    else if (wantVoice) startVoice();
  };
  if (motionNeedsPermission() && motionPermission.value === 'granted') {
    // Already allowed once: re-request inside this gesture (resolves silently).
    log('motion: re-request');
    requestMotionPermission()
      .then((r) => {
        log(`motion: ${r}`);
        if (r === 'denied') motionPermission.value = 'denied';
        else tiltSensor.refresh();
      })
      .finally(next);
    return;
  }
  next();
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
  const canRecord = cameraSupported();
  const recording = settings.value.record && canRecord;
  const cam = cameraStatus.value;
  const needMic = !needMotion && !skipVoice && !recording && voiceWanted() && !micAsked.value;
  const ready = !needMotion && !needMic;
  const landscape = isLandscape.value;

  const begin = (manual: boolean) => {
    if (started.current) return;
    started.current = true;
    if (manual) unlockAudio();
    const record = settings.value.record && cameraStatus.value === 'on';
    const voice = settings.value.voice && !skipVoice && voiceWanted() && !record;
    if (!voice) stopPendingVoice();
    go({ name: 'round', deckId, tilt: !skipTilt, voice, record });
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
      // Wait for the camera if a recording was asked for.
      const camPending = settings.value.record && cameraStatus.value === 'starting';
      if (s.t - uprightSince.current > UPRIGHT_HOLD_MS && !camPending) begin(false);
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
    stopCamera();
    go({ name: 'tabs' });
  };

  const toggleRecord = async () => {
    unlockAudio();
    if (settings.value.record) {
      setSetting('record', false);
      stopCamera();
      if (voiceWanted() && micAsked.value) startVoice();
      return;
    }
    setSetting('record', true);
    // Let the voice recogniser fully release the mic before the camera asks for it.
    stopPendingVoice();
    await voiceIdle();
    const ok = await startCamera();
    if (!ok) setSetting('record', false);
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
      <>
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
      {recording && cam === 'on' && <p class="pre-note">Recording starts with the countdown. Voice is off while recording: the mic's on the video.</p>}
      {cam === 'denied' && <p class="pre-note">Camera's blocked. Settings → Apps → Safari → Camera, then try again.</p>}
      {cam === 'error' && <p class="pre-note">Couldn't start the camera. Try again, or play without recording.</p>}
      </>
    );
    actions = (
      <>
        {canRecord && (
          <button class={'rec-toggle press' + (recording ? ' on' : '')} aria-pressed={recording} onClick={toggleRecord}>
            <Icon name={recording ? 'video-camera' : 'video-camera-slash'} size={20} />
            <span>{cam === 'starting' ? 'Starting camera…' : recording ? 'Recording on' : 'Record video'}</span>
            {recording && cam === 'on' && <span class="rec-dot" />}
          </button>
        )}
        <button class="btn btn-primary press" onClick={() => begin(true)}>
          Start
        </button>
      </>
    );
  }

  return (
    <div class="fullscreen" style={{ background: color, color: on, ['--on' as any]: on, ['--deck' as any]: color }}>
      <CloseButton onClick={close} />
      <div class="pre">
        <div class="pre-main">
          {recording && cam === 'on' ? <CameraPreview /> : <HeadIllustration fg={on} bg={color} />}
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

/** Live, mirrored front-camera preview (the recording itself is true view). */
function CameraPreview() {
  const ref = useRef<HTMLVideoElement>(null);
  const stream = cameraStream.value;
  useEffect(() => {
    const v = ref.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    void v.play().catch(() => {});
    return () => {
      v.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} class="pre-preview" muted playsInline autoplay aria-label="Camera preview" />;
}
