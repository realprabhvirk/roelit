import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceListener } from './voice';

// Minimal fake of webkitSpeechRecognition. Each instance is scripted by the
// test through `next`: what happens when start() is called.
type Script = 'start' | 'refuse' | 'die' | 'hang' | 'slow';
/** When true, abort() ends the recogniser straight away (like a healthy Safari). */
let abortEnds = true;
let next: Script[] = [];
let instances: Fake[] = [];

class Fake {
  onstart?: () => void;
  onend?: () => void;
  onerror?: (e: { error: string }) => void;
  onresult?: (e: unknown) => void;
  start() {
    instances.push(this);
    const s = next.shift() ?? 'start';
    queueMicrotask(() => {
      if (s === 'refuse') {
        this.onerror?.({ error: 'not-allowed' });
        this.onend?.();
      } else if (s === 'die') {
        this.onend?.();
      } else if (s === 'slow') {
        // iOS showed a permission prompt and the user took a while to answer.
        setTimeout(() => this.onstart?.(), 2000);
      } else if (s === 'hang') {
        // Never reports back (iOS sitting on a permission request).
      } else {
        this.onstart?.();
      }
    });
  }
  abort() {
    if (abortEnds) queueMicrotask(() => this.onend?.());
  }
  end() {
    this.onend?.();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  next = [];
  instances = [];
  abortEnds = true;
  (globalThis as any).window = { webkitSpeechRecognition: Fake };
});
afterEach(async () => {
  // End every fake recogniser so the next test starts with an idle mic.
  for (const i of instances) i.onend?.();
  await Promise.resolve();
  delete (globalThis as any).window;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('VoiceListener', () => {
  it('is blocked when refused on the very first start', async () => {
    const onBlocked = vi.fn();
    const v = new VoiceListener({ lang: 'en-AU', onBlocked });
    next = ['refuse'];
    v.start();
    await tick();
    expect(v.status.value).toBe('unavailable');
    expect(v.isBlocked).toBe(true);
    expect(onBlocked).toHaveBeenCalledWith('not-allowed');
  });

  it('only pauses (not blocked) when an automatic restart is refused', async () => {
    vi.useFakeTimers();
    const onBlocked = vi.fn();
    const v = new VoiceListener({ lang: 'en-AU', onBlocked });
    next = ['start', 'refuse'];
    v.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(v.status.value).toBe('listening');
    // Pretend it listened for a while, then iOS ended the session.
    await vi.advanceTimersByTimeAsync(5000);
    instances[0].end();
    await vi.advanceTimersByTimeAsync(5000);
    expect(v.status.value).toBe('paused');
    expect(v.isBlocked).toBe(false);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(instances.length).toBe(2); // no further retries
  });

  it('stops retrying when sessions keep dying instantly', async () => {
    vi.useFakeTimers();
    const v = new VoiceListener({ lang: 'en-AU' });
    next = Array(20).fill('die');
    v.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(v.status.value).toBe('paused');
    expect(instances.length).toBeLessThanOrEqual(4);
  });

  it('keeps restarting healthy sessions', async () => {
    vi.useFakeTimers();
    const v = new VoiceListener({ lang: 'en-AU' });
    v.start();
    for (let i = 0; i < 5; i++) {
      await vi.advanceTimersByTimeAsync(8000);
      instances[instances.length - 1].end();
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(v.status.value).toBe('listening');
    expect(instances.length).toBe(6);
  });

  it('never runs two recognisers at once', async () => {
    vi.useFakeTimers();
    abortEnds = false; // the old recogniser is slow to shut down
    const a = new VoiceListener({ lang: 'en-AU' });
    a.start();
    await vi.advanceTimersByTimeAsync(10);
    a.stop();
    const b = new VoiceListener({ lang: 'en-AU' });
    b.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(instances.length).toBe(1); // b waits for a to end
    instances[0].end();
    await vi.advanceTimersByTimeAsync(10);
    expect(instances.length).toBe(2);
    expect(b.status.value).toBe('listening');
  });

  it('starts anyway if the old recogniser never ends', async () => {
    vi.useFakeTimers();
    abortEnds = false;
    const a = new VoiceListener({ lang: 'en-AU' });
    a.start();
    await vi.advanceTimersByTimeAsync(10);
    a.stop();
    const b = new VoiceListener({ lang: 'en-AU' });
    b.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(instances.length).toBe(2);
  });

  it('in the home-screen app, does not auto-restart when the last start needed a prompt', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { standalone: true, permissions: { query: async () => ({ state: 'prompt' }) } });
    const v = new VoiceListener({ lang: 'en-AU' });
    next = ['slow'];
    v.start();
    await vi.advanceTimersByTimeAsync(5000);
    instances[0].end();
    await vi.advanceTimersByTimeAsync(5000);
    expect(instances.length).toBe(1);
    expect(v.status.value).toBe('paused');
    expect(v.canResume).toBe(true);
    // A tap on the mic pill brings it back.
    v.resume();
    await vi.advanceTimersByTimeAsync(10);
    expect(instances.length).toBe(2);
    expect(v.status.value).toBe('listening');
  });

  it('in the home-screen app, auto-restarts when the mic is allowed', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { standalone: true, permissions: { query: async () => ({ state: 'granted' }) } });
    const v = new VoiceListener({ lang: 'en-AU' });
    v.start();
    await vi.advanceTimersByTimeAsync(5000);
    instances[0].end();
    await vi.advanceTimersByTimeAsync(2000);
    expect(instances.length).toBe(2);
    expect(v.status.value).toBe('listening');
  });

  it('gives up on a start that never reports back', async () => {
    vi.useFakeTimers();
    const v = new VoiceListener({ lang: 'en-AU' });
    next = ['hang'];
    v.start();
    await vi.advanceTimersByTimeAsync(6000);
    expect(v.status.value).toBe('paused');
    expect(v.lastError).toBe('start-timeout');
  });

  it('in the home-screen app, auto-restarts when the last start was instant (no prompt shown)', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', { standalone: true, permissions: { query: async () => ({ state: 'prompt' }) } });
    const v = new VoiceListener({ lang: 'en-AU' });
    v.start();
    await vi.advanceTimersByTimeAsync(5000);
    instances[0].end();
    await vi.advanceTimersByTimeAsync(2000);
    expect(instances.length).toBe(2);
    expect(v.status.value).toBe('listening');
  });
});
