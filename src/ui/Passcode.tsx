import { useEffect, useRef, useState } from 'preact/hooks';
import { unlockCrew } from '../vault';
import { CREW_CODE_LENGTH } from '../decks';
import { sfx } from '../audio';
import { log } from '../debug';
import { haptic } from '../haptics';
import { Icon } from './icons';
import { Sheet } from './controls';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/** Passcode keypad for locked decks. Custom keypad: no iOS keyboard popping up. */
export function PasscodeSheet({
  open,
  title,
  length = CREW_CODE_LENGTH,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  title: string;
  /** Digits to wait for before checking. */
  length?: number;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const LENGTH = length;
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const live = useRef({ digits, busy });
  live.current = { digits, busy };

  useEffect(() => {
    if (open) {
      live.current = { digits: '', busy: false };
      setDigits('');
      setBusy(false);
      setShake(false);
    }
  }, [open]);

  const press = async (k: string) => {
    const { digits: d, busy: b } = live.current;
    if (b) return;
    if (k === 'back') {
      live.current = { digits: d.slice(0, -1), busy: false };
      return setDigits(live.current.digits);
    }
    if (d.length >= LENGTH) return;
    const next = d + k;
    // Update the live copy now, not on the next render, so two taps in the
    // same frame can't both read the old value.
    live.current = { digits: next, busy: next.length >= LENGTH };
    setDigits(next);
    if (next.length < LENGTH) return;
    setBusy(true);
    log('passcode: checking');
    // Never let the keypad wedge on a check that doesn't come back.
    const ok = await Promise.race([
      unlockCrew(next),
      new Promise<boolean>((r) => setTimeout(() => r(false), 10_000)),
    ]);
    log(`passcode: ${ok ? 'ok' : 'wrong'}`);
    if (ok) {
      sfx.correct();
      haptic('success');
      onUnlocked();
    } else {
      sfx.pass();
      haptic('error');
      setShake(true);
      setTimeout(() => {
        live.current = { digits: '', busy: false };
        setShake(false);
        setDigits('');
        setBusy(false);
      }, 420);
    }
  };

  // Desktop keyboard.
  useEffect(() => {
    if (!open) return;
    const on = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('back');
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <p class="prose" style={{ textAlign: 'center', marginTop: 8 }}>
        Enter the code
      </p>
      <div class={'pin-dots' + (shake ? ' shake' : '') + (LENGTH > 6 ? ' many' : '')} role="status" aria-label={`${digits.length} of ${LENGTH} digits`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} class={i < digits.length ? 'on' : ''} />
        ))}
      </div>
      <div class="keypad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              class="key press"
              // Act on touch-down like the iOS keypad: fast typing can't be
              // swallowed by the browser deciding a tap wasn't a "click".
              onPointerDown={(e) => {
                e.preventDefault();
                press(k);
              }}
              // Keyboard / switch-control activation (no pointer involved).
              onClick={(e) => e.detail === 0 && press(k)}
              aria-label={k === 'back' ? 'Delete' : k}
            >
              {k === 'back' ? <Icon name="backspace" size={26} /> : k}
            </button>
          ),
        )}
      </div>
    </Sheet>
  );
}
