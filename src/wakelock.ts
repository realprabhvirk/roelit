// Keep the screen awake during a round. Feature-detected, fails silently.
let sentinel: any = null;
let wanted = false;

async function acquire(): Promise<void> {
  try {
    const wl = (navigator as any).wakeLock;
    if (!wl || sentinel || document.visibilityState !== 'visible') return;
    sentinel = await wl.request('screen');
    sentinel.addEventListener?.('release', () => {
      sentinel = null;
    });
  } catch {
    sentinel = null;
  }
}

function onVisibility(): void {
  if (wanted && document.visibilityState === 'visible') void acquire();
}

export function keepAwake(on: boolean): void {
  wanted = on;
  if (on) {
    document.addEventListener('visibilitychange', onVisibility);
    void acquire();
  } else {
    document.removeEventListener('visibilitychange', onVisibility);
    try {
      void sentinel?.release();
    } catch {
      /* ignore */
    }
    sentinel = null;
  }
}
