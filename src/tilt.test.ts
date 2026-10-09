import { describe, expect, it } from 'vitest';
import {
  THRESHOLDS,
  TiltDetector,
  downFromMotion,
  downFromOrientation,
  isSteady,
  isUpright,
  pitchFromDown,
  sideFromDown,
  type TiltDir,
} from './tilt';

const FRAME = 16;

/** Run a list of [pitch, durationMs] segments (linear ramps) through a detector. */
function run(det: TiltDetector, segments: Array<[number, number]>, start = 0, blocked = () => false) {
  const fired: Array<{ dir: TiltDir; t: number }> = [];
  let t = 0;
  let cur = start;
  for (const [target, dur] of segments) {
    const steps = Math.max(1, Math.round(dur / FRAME));
    const from = cur;
    for (let i = 1; i <= steps; i++) {
      t += FRAME;
      cur = from + ((target - from) * i) / steps;
      const r = det.feed(cur, t, blocked());
      if (r) fired.push({ dir: r, t });
    }
  }
  return fired;
}

const det = () => new TiltDetector({ threshold: THRESHOLDS.medium });

describe('TiltDetector', () => {
  it('fires once on a clean tilt down', () => {
    const f = run(det(), [[0, 200], [55, 200], [55, 300], [0, 200]]);
    expect(f.map((x) => x.dir)).toEqual(['down']);
  });

  it('fires once on a clean tilt up', () => {
    const f = run(det(), [[0, 200], [-55, 200], [-55, 300], [0, 200]]);
    expect(f.map((x) => x.dir)).toEqual(['up']);
  });

  it('ignores jitter around neutral', () => {
    const d = det();
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    let fired = 0;
    for (let t = 0; t < 5000; t += FRAME) if (d.feed(rand() * 15, t)) fired++;
    expect(fired).toBe(0);
  });

  it('ignores a one-frame spike past the threshold', () => {
    const d = det();
    expect(run(d, [[0, 200], [0, 16], [70, 16], [0, 16], [0, 200]])).toEqual([]);
  });

  it('does not double-fire while held or wobbling past the threshold', () => {
    const f = run(det(), [[0, 200], [55, 150], [55, 1500], [30, 200], [55, 200], [30, 200], [60, 200]]);
    expect(f.map((x) => x.dir)).toEqual(['down']);
  });

  it('needs a return to neutral before firing again', () => {
    const f = run(det(), [[0, 200], [55, 150], [55, 300], [0, 300], [0, 400], [55, 150], [55, 300]]);
    expect(f.map((x) => x.dir)).toEqual(['down', 'down']);
  });

  it('respects the lockout even after a quick return to neutral', () => {
    // Down, snap back and immediately up again inside 700ms.
    const f = run(det(), [[0, 200], [55, 80], [55, 80], [0, 50], [-55, 50], [-55, 100], [0, 300]]);
    expect(f.map((x) => x.dir)).toEqual(['down']);
    expect(f.length).toBe(1);
  });

  it('does not fire if the round starts already tilted', () => {
    const f = run(det(), [[55, 16], [55, 1000]], 55);
    expect(f).toEqual([]);
  });

  it('never fires while blocked', () => {
    const f = run(det(), [[0, 200], [55, 200], [55, 300]], 0, () => true);
    expect(f).toEqual([]);
  });

  it('threshold follows sensitivity', () => {
    const low = new TiltDetector({ threshold: THRESHOLDS.low });
    const high = new TiltDetector({ threshold: THRESHOLDS.high });
    expect(run(low, [[0, 200], [35, 200], [35, 300]])).toEqual([]);
    expect(run(high, [[0, 200], [35, 200], [35, 300]]).map((x) => x.dir)).toEqual(['down']);
  });
});

describe('sensor mapping', () => {
  const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(0.5);

  it('maps beta/gamma to a down vector', () => {
    const flat = downFromOrientation(0, 0);
    close(flat.z, -1);
    const portrait = downFromOrientation(90, 0);
    close(portrait.y, -1);
  });

  // Landscape with the phone's top edge to the LEFT (device +x points up).
  // Neutral: (β 0, γ -90). Screen 40° towards floor: (β 180, γ 50). Towards ceiling: (β 0, γ -50).
  // Landscape with the top edge to the RIGHT (device +x points down).
  // Neutral: (β 180, γ -90). Floor: (β 180, γ -50). Ceiling: (β 0, γ 50).
  const sides = {
    'landscape, top edge left': { neutral: [0, -90], down: [180, 50], up: [0, -50] },
    'landscape, top edge right': { neutral: [180, -90], down: [180, -50], up: [0, 50] },
  } as const;

  for (const [name, p] of Object.entries(sides)) {
    it(`${name}: tilt down is positive pitch, tilt up negative`, () => {
      const n = downFromOrientation(p.neutral[0], p.neutral[1]);
      expect(isUpright(n)).toBe(true);
      const side = sideFromDown(n);
      close(pitchFromDown(n, side), 0);
      close(pitchFromDown(downFromOrientation(p.down[0], p.down[1]), side), 40);
      close(pitchFromDown(downFromOrientation(p.up[0], p.up[1]), side), -40);
    });

    it(`${name}: a full sweep fires down then up`, () => {
      const n = downFromOrientation(p.neutral[0], p.neutral[1]);
      const side = sideFromDown(n);
      const d = new TiltDetector({ threshold: THRESHOLDS.medium });
      const fired: TiltDir[] = [];
      let t = 0;
      // Sweep the screen from vertical to 60° down, back, then 60° up.
      const angles = [
        ...Array.from({ length: 20 }, () => 0),
        ...Array.from({ length: 30 }, (_, i) => (i + 1) * 2),
        ...Array.from({ length: 30 }, (_, i) => 60 - (i + 1) * 2),
        ...Array.from({ length: 60 }, () => 0),
        ...Array.from({ length: 30 }, (_, i) => -(i + 1) * 2),
        ...Array.from({ length: 20 }, () => -60),
      ];
      for (const a of angles) {
        t += FRAME;
        // Rotate the neutral down vector about the device y axis by `a`.
        const r = (a * Math.PI) / 180;
        const v = { x: n.x * Math.cos(r), y: 0, z: Math.sin(r) };
        const pitch = pitchFromDown(v, side);
        const res = d.feed(pitch, t);
        if (res) fired.push(res);
      }
      expect(fired).toEqual(['down', 'up']);
    });
  }

  it('motion fallback: iOS and Android sign conventions agree after mapping', () => {
    // Phone flat face-up. Spec/Android reports +9.81 on z, iOS reports -9.81.
    const android = downFromMotion({ x: 0, y: 0, z: 9.81 }, false)!;
    const ios = downFromMotion({ x: 0, y: 0, z: -9.81 }, true)!;
    close(android.z, -1);
    close(ios.z, -1);
  });

  it('rejects shaken (non-gravity) motion readings', () => {
    expect(isSteady({ x: 0, y: 0, z: 9.8 })).toBe(true);
    expect(isSteady({ x: 12, y: 3, z: 9 })).toBe(false);
    expect(isSteady({ x: 0, y: 1, z: 2 })).toBe(false);
  });
});
