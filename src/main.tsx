import { Component, render, type ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { initDiagnostics, log } from './debug';
import '@fontsource/anton/latin-400.css';
import './styles.css';
import { App } from './ui/App';
import { unlockAudio } from './audio';
import { registerSW } from 'virtual:pwa-register';

declare const __APP_VERSION__: string;
initDiagnostics(__APP_VERSION__);

// The page itself never scrolls: every list scrolls inside its own box. iOS can
// still leave the window nudged after the keyboard closes or the phone rotates,
// and then every tap lands a little off its button ("buttons stop working until
// I reopen the app"). Snap it back, except while someone is typing.
function snapBack(): void {
  const typing = document.activeElement?.matches?.('input, textarea');
  if (typing || (!scrollX && !scrollY)) return;
  log(`viewport nudged to ${Math.round(scrollX)},${Math.round(scrollY)}, snapping back`);
  scrollTo(0, 0);
}
addEventListener('scroll', snapBack, { passive: true });
addEventListener('resize', () => setTimeout(snapBack, 250));
addEventListener('orientationchange', () => setTimeout(snapBack, 400));
visualViewport?.addEventListener('resize', () => setTimeout(snapBack, 250));
document.addEventListener('focusout', () => setTimeout(snapBack, 100));

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

/** If anything throws while rendering, show a way out instead of a dead screen. */
class Boundary extends Component<{ children: ComponentChildren }, { failed: boolean }> {
  state = { failed: false };
  componentDidCatch(err: unknown) {
    log(`CRASH ${String((err as Error)?.stack || err).slice(0, 300)}`);
    this.setState({ failed: true });
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div class="overlay-msg" style={{ position: 'fixed', zIndex: 100 }}>
        <h2 class="display">Something broke</h2>
        <p>Sorry. It's been logged in Settings → Diagnostics.</p>
        <button class="btn btn-secondary press" style={{ width: 'auto', marginTop: 12 }} onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

function Root() {
  const [ready, setReady] = useState(needRefresh);
  useEffect(() => {
    const l = () => setReady(true);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  return (
    <Boundary>
      <App updateReady={ready} onUpdate={() => updateSW?.(true)} />
    </Boundary>
  );
}

render(<Root />, document.getElementById('app')!);
