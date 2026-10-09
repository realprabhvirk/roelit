import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceListener } from './voice';

// Minimal fake of webkitSpeechRecognition. Each instance is scripted by the
// test through `next`: what happens when start() is called.
type Script = 'start' | 'refuse' | 'die';
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
      } else {
        this.onstart?.();
      }
    });
  }
  abort() {}
  end() {
    this.onend?.();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  next = [];
  instances = [];
  (globalThis as any).window = { webkitSpeechRecognition: Fake };
});
afterEach(() => {
  delete (globalThis as any).window;
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
});
