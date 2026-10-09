// Front camera + mic stream for recording rounds. One stream for the whole
// session (pre-round preview, then the recording), stopped when you leave.
import { signal } from '@preact/signals';
import { log } from './debug';
import { load, save } from './storage';
import { inferMode, type FrameMode } from './videoOrientation';

export type CameraStatus = 'off' | 'starting' | 'on' | 'denied' | 'unsupported' | 'error';

export const cameraStatus = signal<CameraStatus>('off');
export const cameraStream = signal<MediaStream | null>(null);

export function cameraSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'captureStream' in HTMLCanvasElement.prototype
  );
}

function live(s: MediaStream | null): boolean {
  return !!s && s.getVideoTracks().some((t) => t.readyState === 'live');
}

let pending: Promise<boolean> | null = null;

/** Ask for the front camera and mic. Resolves true when the stream is live. */
export function startCamera(): Promise<boolean> {
  if (live(cameraStream.value)) return Promise.resolve(true);
  if (pending) return pending;
  if (!cameraSupported()) {
    cameraStatus.value = 'unsupported';
    return Promise.resolve(false);
  }
  cameraStatus.value = 'starting';
  log('camera: requesting');
  pending = navigator.mediaDevices
    .getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: true,
    })
    .then((s) => {
      cameraStream.value = s;
      cameraStatus.value = 'on';
      const v = s.getVideoTracks()[0];
      const st = v?.getSettings?.() ?? {};
      log(`camera: on ${st.width}x${st.height} audio=${s.getAudioTracks().length > 0}`);
      for (const t of s.getTracks()) {
        t.addEventListener('ended', () => {
          log(`camera: ${t.kind} track ended`);
          if (cameraStream.value === s && !live(s)) {
            cameraStream.value = null;
            cameraStatus.value = 'off';
          }
        });
      }
      return true;
    })
    .catch((e: Error) => {
      log(`camera: ${e?.name} ${String(e?.message ?? '').slice(0, 80)}`);
      cameraStatus.value = e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'denied' : 'error';
      return false;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function stopCamera(): void {
  const s = cameraStream.value;
  if (s) {
    s.getTracks().forEach((t) => t.stop());
    log('camera: off');
  }
  cameraStream.value = null;
  if (cameraStatus.value === 'on' || cameraStatus.value === 'starting') cameraStatus.value = 'off';
}

// ---------------------------------------------------------------------------
// Learn how this phone hands us camera frames (see videoOrientation.ts).

export const frameMode = signal<FrameMode>(load<FrameMode>('frameMode', 'follows'));
let pendingMode: FrameMode | null = null;
let pendingCount = 0;

/** Feed a frame's size; after a steady run of the same reading, remember it. */
export function noteFrame(video: HTMLVideoElement): void {
  const m = inferMode(video.videoWidth, video.videoHeight, innerWidth > innerHeight);
  if (!m) return;
  if (m === pendingMode) pendingCount++;
  else {
    pendingMode = m;
    pendingCount = 1;
  }
  if (pendingCount >= 20 && m !== frameMode.value) {
    frameMode.value = m;
    save('frameMode', m);
    log(`camera: frames are ${m} (${video.videoWidth}x${video.videoHeight}, screen ${innerWidth}x${innerHeight})`);
  }
}
