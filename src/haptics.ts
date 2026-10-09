// Haptics. iOS Safari has no vibration API; the one way in (iOS 18+) is
// toggling a native <input type="checkbox" switch>, which plays the system
// tick. It only fires inside a real tap, so on iPhone haptics come from taps
// only. Android gets navigator.vibrate patterns everywhere.
import { log } from './debug';

export type Haptic = 'select' | 'light' | 'medium' | 'success' | 'error';

let enabled = true;
let el: HTMLLabelElement | null = null;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

const canVibrate = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
const hasSwitch = (): boolean => typeof HTMLInputElement !== 'undefined' && 'switch' in HTMLInputElement.prototype;

export function hapticsSupported(): boolean {
  return canVibrate() || hasSwitch();
}

const PATTERNS: Record<Haptic, number | number[]> = {
  select: 6,
  light: 10,
  medium: 18,
  success: [12, 70, 22],
  error: [24, 50, 24, 50, 24],
};
// iOS ticks per kind (the switch trick has one strength, so rhythm does the talking).
const TICKS: Record<Haptic, number> = { select: 1, light: 1, medium: 1, success: 2, error: 3 };

function tickEl(): HTMLLabelElement {
  if (el) return el;
  el = document.createElement('label');
  el.setAttribute('data-haptic-el', '');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.setAttribute('switch', '');
  input.tabIndex = -1;
  el.appendChild(input);
  document.body.appendChild(el);
  return el;
}

function tick(): void {
  const l = tickEl();
  l.click();
  // Don't leave focus on the hidden switch.
  (l.firstChild as HTMLInputElement).blur();
}

export function haptic(kind: Haptic = 'light'): void {
  if (!enabled) return;
  try {
    if (canVibrate()) {
      navigator.vibrate(PATTERNS[kind]);
      return;
    }
    if (!hasSwitch()) return;
    tick();
    for (let i = 1; i < TICKS[kind]; i++) setTimeout(tick, i * 75);
  } catch (e) {
    log(`haptic failed ${String(e).slice(0, 60)}`);
  }
}

/**
 * One app-wide tap haptic, so every control feels the same. A control can
 * ask for a different feel with data-haptic="select|medium|success|error|none".
 */
export function initTapHaptics(): void {
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as Element | null;
      if (!t?.closest || t.closest('[data-haptic-el]')) return;
      const ctl = t.closest('button, [role=tab], [role=radio], input[type=checkbox], .deck-tile');
      if (!ctl) return;
      const want = (ctl.closest('[data-haptic]') as HTMLElement | null)?.dataset.haptic;
      if (want === 'none') return;
      haptic((want as Haptic) || (ctl.matches('[role=tab], [role=radio], input[type=checkbox]') ? 'select' : 'light'));
    },
    { capture: true },
  );
}
