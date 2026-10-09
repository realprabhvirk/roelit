// Records a round: front camera + a branded ROEL IT! overlay, drawn onto a
// canvas and captured with the mic audio. The clip waits on the results
// screen for "Save to Photos" (iOS only lets web apps save through the share
// sheet, so that last tap is unavoidable).
import { signal } from '@preact/signals';
import { log } from './debug';
import { fitText, type Fit } from './ui/fit';
import { INK, PAPER, PALETTE } from './palette';
import { STRINGS } from './strings';

export type OverlayState = {
  phase: 'countdown' | 'playing' | 'flash' | 'ended';
  paused: boolean;
  countdown: number;
  word: string;
  flash: 'correct' | 'pass' | null;
  score: number;
  secLeft: number;
  /** 1 at the start of the round, 0 at the buzzer. */
  progress: number;
  deckName: string;
  deckColor: string;
  onColor: string;
  /** Round was ended early (end card says ENDED, not TIME!). */
  early?: boolean;
};

export type Clip = {
  status: 'recording' | 'finishing' | 'ready' | 'failed';
  blob?: Blob;
  url?: string;
  name?: string;
  saved?: boolean;
};

/** The current/last recording. The results screen watches this. */
export const clip = signal<Clip | null>(null);

const W = 1280;
const H = 720;
const M = 32; // outer margin
const BAND = 176; // bottom band height
const UI = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
const DISPLAY = 'Anton, Impact, sans-serif';

const TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

function pickType(): string {
  for (const t of TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(t)) return t;
    } catch {
      /* ignore */
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// Overlay drawing (flat, solid, on brand).

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

type Run = { text: string; font: string; color: string };

/** A solid rounded chip with one or more text runs. Returns its width. */
function chip(ctx: CanvasRenderingContext2D, x: number, y: number, h: number, runs: Run[], bg: string, alignRight = false): number {
  const padX = 20;
  const gap = 10;
  const widths = runs.map((r) => {
    ctx.font = r.font;
    return ctx.measureText(r.text).width;
  });
  const w = padX * 2 + widths.reduce((a, b) => a + b, 0) + gap * (runs.length - 1);
  const left = alignRight ? x - w : x;
  ctx.fillStyle = bg;
  rr(ctx, left, y, w, h, 14);
  ctx.fill();
  let cx = left + padX;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  runs.forEach((r, i) => {
    ctx.font = r.font;
    ctx.fillStyle = r.color;
    ctx.fillText(r.text, cx, y + h / 2 + 2);
    cx += widths[i] + gap;
  });
  return w;
}

function fmt(sec: number): string {
  const s = Math.max(0, sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const fitCache = new Map<string, Fit>();
function fitWord(word: string, w: number, h: number): Fit {
  const k = `${word}|${w}|${h}`;
  let f = fitCache.get(k);
  if (!f) {
    f = fitText(word, w, h, { maxLines: 2, maxSize: 120 });
    if (fitCache.size > 200) fitCache.clear();
    fitCache.set(k, f);
  }
  return f;
}

function bigCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number, color: string): void {
  ctx.font = `400 ${size}px ${DISPLAY}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + size * 0.04);
}

export function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement | null, o: OverlayState): void {
  // Camera, cover-fitted. True view (not mirrored) so the room reads right.
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, W, H);
  if (video && video.readyState >= 2 && video.videoWidth) {
    const s = Math.max(W / video.videoWidth, H / video.videoHeight);
    const dw = video.videoWidth * s;
    const dh = video.videoHeight * s;
    ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }

  // Top left: the mark.
  chip(ctx, M, 28, 64, [{ text: STRINGS.appName, font: `400 40px ${DISPLAY}`, color: PAPER }], INK);

  // Top right: timer, then score.
  const hurry = o.phase !== 'countdown' && o.phase !== 'ended' && o.secLeft <= 10;
  const tw = chip(ctx, W - M, 28, 64, [{ text: fmt(o.secLeft), font: `700 38px ${UI}`, color: PAPER }], hurry ? PALETTE.tomato : INK, true);
  chip(
    ctx,
    W - M - tw - 12,
    28,
    64,
    [
      { text: String(o.score), font: `400 40px ${DISPLAY}`, color: o.onColor },
      { text: STRINGS.correctPast.toUpperCase(), font: `800 18px ${UI}`, color: o.onColor },
    ],
    o.deckColor,
    true,
  );

  // Bottom band.
  const y0 = H - BAND;
  const cy = y0 + BAND / 2 + 6;
  let bg = o.deckColor;
  let fg = o.onColor;
  if (o.phase === 'ended' || o.paused) {
    bg = INK;
    fg = PAPER;
  } else if (o.phase === 'flash' && o.flash) {
    bg = o.flash === 'correct' ? PALETTE.forest : PALETTE.tomato;
    fg = PAPER;
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, y0, W, BAND);

  // Progress along the top edge of the band.
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = fg;
  ctx.fillRect(0, y0, W, 8);
  ctx.globalAlpha = 1;
  ctx.fillRect(0, y0, W * Math.max(0, Math.min(1, o.progress)), 8);

  if (o.phase === 'ended') {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = `400 110px ${DISPLAY}`;
    ctx.fillStyle = fg;
    ctx.fillText(o.early ? 'ENDED' : STRINGS.time.toUpperCase(), M + 8, cy);
    ctx.textAlign = 'right';
    ctx.font = `400 92px ${DISPLAY}`;
    ctx.fillText(String(o.score), W - M - 8, cy - 18);
    ctx.font = `800 22px ${UI}`;
    ctx.fillText(`${STRINGS.correctPast.toUpperCase()} · ${o.deckName.toUpperCase()}`, W - M - 8, cy + 48);
    return;
  }
  if (o.paused) {
    bigCentered(ctx, 'PAUSED', W / 2, cy, 96, fg);
    return;
  }
  if (o.phase === 'flash' && o.flash) {
    bigCentered(ctx, o.flash === 'correct' ? STRINGS.correct : STRINGS.pass, W / 2, cy, 120, fg);
    return;
  }
  if (o.phase === 'countdown') {
    ctx.font = `800 22px ${UI}`;
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('GET READY', M + 8, y0 + 40);
    bigCentered(ctx, String(o.countdown), W / 2, cy, 130, fg);
    return;
  }

  // Playing: deck label + the word, fitted.
  ctx.font = `800 20px ${UI}`;
  ctx.fillStyle = fg;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(o.deckName.toUpperCase(), M + 8, y0 + 36);
  ctx.globalAlpha = 1;
  if (!o.word) return;
  const boxW = W - 2 * (M + 8);
  const boxH = BAND - 64;
  const f = fitWord(o.word, boxW, boxH);
  const lh = f.size * 0.95;
  const top = y0 + 52 + (boxH - lh * f.lines.length) / 2;
  ctx.font = `400 ${f.size}px ${DISPLAY}`;
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  f.lines.forEach((line, i) => ctx.fillText(line, W / 2, top + lh * (i + 0.5) + f.size * 0.04));
}

// ---------------------------------------------------------------------------
// Recording session.

type Session = {
  host: HTMLDivElement;
  video: HTMLVideoElement;
  rec: MediaRecorder;
  chunks: Blob[];
  type: string;
  raf: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
  stopping: boolean;
  cancelled: boolean;
  name: string;
};

let session: Session | null = null;

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}`;
}

/** Start recording the round. Returns false if this device can't. */
export function startRecording(stream: MediaStream, overlay: () => OverlayState, deckName: string): boolean {
  cancelRecording();
  discardClip();
  try {
    // Hidden but attached: Safari is happier capturing elements that are in the page.
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.autoplay = true;
    video.srcObject = stream;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    host.append(video, canvas);
    document.body.append(host);
    void video.play().catch((e) => log(`rec: video play ${String(e).slice(0, 60)}`));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    drawFrame(ctx, video, overlay());

    const out = canvas.captureStream(30);
    stream.getAudioTracks().forEach((t) => out.addTrack(t));
    const type = pickType();
    const rec = new MediaRecorder(out, {
      ...(type ? { mimeType: type } : {}),
      videoBitsPerSecond: 3_000_000,
      audioBitsPerSecond: 128_000,
    });
    const s: Session = {
      host,
      video,
      rec,
      chunks: [],
      type: rec.mimeType || type || 'video/mp4',
      raf: 0,
      stopTimer: null,
      stopping: false,
      cancelled: false,
      name: `ROEL IT ${deckName} ${stamp()}`.replace(/[^\w .-]+/g, ''),
    };
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) s.chunks.push(e.data);
    };
    rec.onstop = () => finalize(s);
    rec.onerror = (e) => log(`rec: error ${String((e as any)?.error?.name ?? e)}`);
    const loop = () => {
      try {
        drawFrame(ctx, video, overlay());
      } catch (err) {
        log(`rec: draw error ${String(err).slice(0, 80)}`);
      }
      s.raf = requestAnimationFrame(loop);
    };
    s.raf = requestAnimationFrame(loop);
    rec.start(1000);
    session = s;
    clip.value = { status: 'recording' };
    log(`rec: started ${s.type}`);
    return true;
  } catch (e) {
    log(`rec: couldn't start ${String(e).slice(0, 120)}`);
    clip.value = { status: 'failed' };
    return false;
  }
}

/** Keep drawing the end card for `afterMs`, then wrap the clip up. */
export function finishRecording(afterMs: number): void {
  const s = session;
  if (!s || s.stopTimer || s.stopping) return;
  clip.value = { status: 'finishing' };
  s.stopTimer = setTimeout(() => stop(s, false), afterMs);
}

/** Quit mid-round: throw the recording away. */
export function cancelRecording(): void {
  if (session) stop(session, true);
}

function stop(s: Session, cancel: boolean): void {
  if (s.stopping) {
    // Already wrapping up; a cancel still wins (e.g. quit during the end card).
    if (cancel) s.cancelled = true;
    return;
  }
  s.stopping = true;
  s.cancelled = cancel;
  if (s.stopTimer) clearTimeout(s.stopTimer);
  s.stopTimer = null;
  cancelAnimationFrame(s.raf);
  try {
    if (s.rec.state !== 'inactive') s.rec.stop();
    else finalize(s);
  } catch {
    finalize(s);
  }
}

function finalize(s: Session): void {
  if (session === s) session = null;
  cancelAnimationFrame(s.raf);
  s.video.srcObject = null;
  s.host.remove();
  if (s.cancelled) {
    log('rec: discarded');
    if (clip.value?.status !== 'ready') clip.value = null;
    return;
  }
  const blob = new Blob(s.chunks, { type: s.type.split(';')[0] });
  if (!blob.size) {
    log('rec: empty recording');
    clip.value = { status: 'failed' };
    return;
  }
  const ext = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('webm') ? 'webm' : 'mov';
  clip.value = { status: 'ready', blob, url: URL.createObjectURL(blob), name: `${s.name}.${ext}` };
  log(`rec: ready ${(blob.size / 1e6).toFixed(1)}MB ${blob.type}`);
}

export function discardClip(): void {
  const c = clip.value;
  if (c?.url) URL.revokeObjectURL(c.url);
  clip.value = null;
}

/**
 * Hand the clip to the iOS share sheet ("Save Video" puts it in Photos).
 * Must be called from a tap. Falls back to a download elsewhere.
 */
export async function saveClip(): Promise<'saved' | 'cancelled' | 'downloaded' | 'failed'> {
  const c = clip.value;
  if (!c?.blob || !c.name) return 'failed';
  const file = new File([c.blob], c.name, { type: c.blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      clip.value = { ...c, saved: true };
      log('rec: shared');
      return 'saved';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'cancelled';
    log(`rec: share failed ${(e as Error)?.name}`);
  }
  try {
    const a = document.createElement('a');
    a.href = c.url!;
    a.download = c.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    clip.value = { ...c, saved: true };
    return 'downloaded';
  } catch {
    return 'failed';
  }
}
