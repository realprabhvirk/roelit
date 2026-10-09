import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@fontsource/anton/latin-400.css';
import './styles.css';
import { App } from './ui/App';
import { unlockAudio } from './audio';
import { registerSW } from 'virtual:pwa-register';

// Unlock Web Audio on the very first touch (iOS requirement).
const unlock = () => {
  unlockAudio();
  window.removeEventListener('pointerdown', unlock, true);
};
window.addEventListener('pointerdown', unlock, true);

// iOS only applies :active styles if a touch listener exists.
document.addEventListener('touchstart', () => {}, { passive: true });
// Belt and braces against pinch-zoom (iOS ignores user-scalable=no in Safari).
document.addEventListener('gesturestart', (e) => e.preventDefault());
// Kill double-tap zoom on anything that isn't a text field.
let lastTouchEnd = 0;
document.addEventListener(
  'touchend',
  (e) => {
    const now = Date.now();
    const t = e.target as HTMLElement | null;
    if (now - lastTouchEnd < 320 && !t?.closest('input, textarea')) e.preventDefault();
    lastTouchEnd = now;
  },
  { passive: false },
);

// Warm the display font so the first card fits correctly.
document.fonts?.load('100px Anton').catch(() => {});

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
let needRefresh = false;

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      needRefresh = true;
      listeners.forEach((l) => l());
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // Home-screen apps rarely reload: check for a new deploy whenever we come back.
      const check = () => {
        if (document.visibilityState === 'visible' && navigator.onLine) reg.update().catch(() => {});
      };
      document.addEventListener('visibilitychange', check);
      setInterval(check, 30 * 60 * 1000);
    },
  });
}

function Root() {
  const [ready, setReady] = useState(needRefresh);
  useEffect(() => {
    const l = () => setReady(true);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return <App updateReady={ready} onUpdate={() => updateSW?.(true)} />;
}

render(<Root />, document.getElementById('app')!);
