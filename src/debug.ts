// On-device diagnostics. The app is mostly run as an iPhone home-screen app,
// where there's no console to look at, so we keep a small rolling log in
// localStorage that survives a force-quit. Settings → Diagnostics shows it
// and copies it. Never log codes, card text or anything personal.

const KEY = 'roelit:log';
const PREV_KEY = 'roelit:log:prev';
const MAX = 400;

const t0 = Date.now();
let lines: string[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function stamp(): string {
  const s = (Date.now() - t0) / 1000;
  return s.toFixed(1).padStart(7);
}

function persist(): void {
  saveTimer = null;
  try {
    localStorage.setItem(KEY, lines.join('\n'));
  } catch {
    /* storage full / unavailable */
  }
}

export function log(msg: string): void {
  lines.push(`${stamp()}  ${msg}`);
  if (lines.length > MAX) lines = lines.slice(-MAX);
  // Write soon, not on every line: cheap, and still survives a force-quit.
  if (!saveTimer) saveTimer = setTimeout(persist, 800);
}

export function currentLog(): string {
  return lines.join('\n');
}

export function previousLog(): string {
  try {
    return localStorage.getItem(PREV_KEY) ?? '';
  } catch {
    return '';
  }
}

export function clearLogs(): void {
  lines = [];
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(PREV_KEY);
  } catch {
    /* ignore */
  }
}

/** Short, non-personal description of an element for the log. */
export function describe(target: EventTarget | null): string {
  if (!(target instanceof Element)) return String(target);
  // Name the control, not the icon path inside it.
  const el = target.closest('button, a, input, textarea, label, [role], .sheet-scrim, .deck-tile') ?? target;
  const label = el.getAttribute('aria-label');
  const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
  return `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''}${label ? `[${label.slice(0, 20)}]` : ''}`;
}

function viewport(): string {
  const vv = window.visualViewport;
  return `win ${innerWidth}x${innerHeight} scroll ${Math.round(scrollX)},${Math.round(scrollY)}${
    vv ? ` vv ${Math.round(vv.width)}x${Math.round(vv.height)} off ${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} scale ${vv.scale.toFixed(2)}` : ''
  }`;
}

/** Wire up global listeners. Call once at startup. */
export function initDiagnostics(version: string): void {
  try {
    const prev = localStorage.getItem(KEY);
    if (prev) localStorage.setItem(PREV_KEY, prev);
  } catch {
    /* ignore */
  }
  const standalone = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches;
  log(`start v${version} ${standalone ? 'standalone' : 'browser'} | ${navigator.userAgent}`);
  log(`viewport ${viewport()}`);

  addEventListener('error', (e) => log(`ERROR ${e.message} @ ${(e.filename || '').split('/').pop()}:${e.lineno}`));
  addEventListener('unhandledrejection', (e) => log(`REJECTION ${String((e as PromiseRejectionEvent).reason).slice(0, 160)}`));

  // Tap tracing: every tap that doesn't turn into a click on a button is the
  // exact symptom we're hunting, so record what was under the finger.
  let down: { target: string; x: number; y: number; at: number; hit: string; interactive: boolean } | null = null;
  addEventListener(
    'pointerdown',
    (e) => {
      const hit = describe(document.elementFromPoint(e.clientX, e.clientY));
      const interactive = !!(e.target instanceof Element && e.target.closest('button, input, label, a, .sheet-scrim'));
      down = { target: describe(e.target), x: Math.round(e.clientX), y: Math.round(e.clientY), at: performance.now(), hit, interactive };
    },
    { capture: true, passive: true },
  );
  addEventListener(
    'click',
    (e) => {
      if (down) {
        const ms = Math.round(performance.now() - down.at);
        log(`tap ${down.target} (${down.x},${down.y}) -> click ${describe(e.target)} ${ms}ms`);
      }
      down = null;
    },
    { capture: true, passive: true },
  );
  addEventListener(
    'pointerup',
    () => {
      const d = down;
      if (!d) return;
      setTimeout(() => {
        if (down === d && d.interactive) {
          log(`tap ${d.target} (${d.x},${d.y}) NO CLICK | under finger: ${d.hit} | ${viewport()}`);
          down = null;
        }
      }, 700);
    },
    { capture: true, passive: true },
  );
  addEventListener('pointercancel', (e) => log(`pointercancel ${describe(e.target)}`), { capture: true, passive: true });

  // Main-thread stall detector: a heartbeat that notices when it runs late.
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const late = now - last - 500;
    if (late > 1200 && document.visibilityState === 'visible') log(`STALL main thread blocked ~${Math.round(late)}ms`);
    last = now;
  }, 500);

  document.addEventListener('visibilitychange', () => log(`visibility ${document.visibilityState}`));
  addEventListener('pageshow', (e) => log(`pageshow persisted=${(e as PageTransitionEvent).persisted}`));
  addEventListener('pagehide', () => persist());
  addEventListener('resize', () => log(`resize ${viewport()}`));
  document.addEventListener('focusin', (e) => log(`focus ${describe(e.target)}`));
}
