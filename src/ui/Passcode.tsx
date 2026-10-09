import { useEffect, useRef, useState } from 'preact/hooks';
import { unlockCrew } from '../vault';
import { sfx } from '../audio';
import { Icon } from './icons';
import { Sheet } from './controls';

const LENGTH = 6;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

/** Passcode keypad for locked decks. Custom keypad: no iOS keyboard popping up. */
export function PasscodeSheet({
  open,
  title,
  onClose,
  onUnlocked,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  onUnlocked: () => void;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const live = useRef({ digits, busy });
  live.current = { digits, busy };

  useEffect(() => {
    if (open) {
      setDigits('');
      setBusy(false);
      setShake(false);
    }
  }, [open]);

  const press = async (k: string) => {
    const { digits: d, busy: b } = live.current;
    if (b) return;
    if (k === 'back') return setDigits(d.slice(0, -1));
    if (d.length >= LENGTH) return;
    const next = d + k;
    setDigits(next);
    if (next.length < LENGTH) return;
    setBusy(true);
    const ok = await unlockCrew(next);
    if (ok) {
      sfx.correct();
      onUnlocked();
    } else {
      sfx.pass();
      setShake(true);
      setTimeout(() => {
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
      <div class={'pin-dots' + (shake ? ' shake' : '')} role="status" aria-label={`${digits.length} of ${LENGTH} digits`}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <span key={i} class={i < digits.length ? 'on' : ''} />
        ))}
      </div>
      <div class="keypad">
        {KEYS.map((k, i) =>
          k === '' ? (
            <span key={i} />
          ) : (
            <button key={i} class="key press" onClick={() => press(k)} aria-label={k === 'back' ? 'Delete' : k}>
              {k === 'back' ? <Icon name="backspace" size={26} /> : k}
            </button>
          ),
        )}
      </div>
    </Sheet>
  );
}
