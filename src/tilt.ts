// Tilt input: sensor mapping + trigger state machine.
//
// Pose we care about: phone in LANDSCAPE, held against the forehead, screen
// facing outward (towards your mates).
//
//   neutral   screen roughly vertical
//   ROEL IT!  screen turns towards the floor   (pitch goes positive)
//   PASS      screen turns towards the ceiling (pitch goes negative)
//
// Everything is computed from a single "down" vector expressed in DEVICE
// coordinates (the W3C frame: +x = right edge in portrait, +y = top edge in
// portrait, +z = out of the screen). Working on the vector instead of raw
// Euler angles means:
//   - no ±90° gamma wraparound right at our neutral pose,
//   - landscape-left vs landscape-right only changes the sign of d.x, which we
//     read straight off the vector at calibration time (no reliance on
//     screen.orientation, which iOS reports inconsistently),
//   - rolling the phone in the screen plane mostly moves d.y, which we ignore.

export type Vec3 = { x: number; y: number; z: number };
export type TiltDir = 'down' | 'up';
export type Sensitivity = 'low' | 'medium' | 'high';

/** Degrees past neutral needed to fire. */
export const THRESHOLDS: Record<Sensitivity, number> = {
  low: 45,
  medium: 38,
  high: 30,
};

/** Must come back within this many degrees of neutral before re-arming. */
export const NEUTRAL_BAND = 18;
export const LOCKOUT_MS = 700;
/** The tilt must be held past the threshold this long (kills spikes). */
export const HOLD_MS = 60;

const RAD = 180 / Math.PI;

function normalise(v: Vec3): Vec3 | null {
  const m = Math.hypot(v.x, v.y, v.z);
  if (!isFinite(m) || m < 1e-6) return null;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}

/**
 * Down vector from DeviceOrientationEvent beta/gamma (degrees).
 * Spec rotation order is Z-X'-Y'', so earth "up" in device coords is
 *   (-sinγ·cosβ, sinβ, cosβ·cosγ)
 * and down is the negation. Alpha (compass heading) doesn't matter.
 * iOS and Android agree on beta/gamma, and the values are sensor-fused, so
 * this is the preferred source: shaking the phone barely moves it.
 */
export function downFromOrientation(beta: number, gamma: number): Vec3 {
  const b = beta / RAD;
  const g = gamma / RAD;
  return {
    x: Math.sin(g) * Math.cos(b),
    y: -Math.sin(b),
    z: -Math.cos(b) * Math.cos(g),
  };
}

/**
 * Down vector from DeviceMotionEvent.accelerationIncludingGravity.
 * The spec says a phone lying face-up reads z ≈ +9.81 (the reaction to
 * gravity, pointing UP), and Android follows that. iOS Safari reports the
 * opposite sign (z ≈ -9.81 face-up, i.e. it reports gravity itself).
 * So: on iOS the reading already points down; elsewhere we negate it.
 * If this ever turns out wrong on a device, "Flip tilt direction" in
 * Settings fixes it without a code change.
 */
export function downFromMotion(a: Vec3, iosConvention: boolean): Vec3 | null {
  const s = iosConvention ? 1 : -1;
  return normalise({ x: a.x * s, y: a.y * s, z: a.z * s });
}

/** True if |acceleration| is close enough to 1 g to trust as a gravity reading. */
export function isSteady(a: Vec3): boolean {
  const g = Math.hypot(a.x, a.y, a.z) / 9.81;
  return g > 0.75 && g < 1.25;
}

/**
 * Which landscape side we're on, from the vector itself: +1 if gravity points
 * along +x (phone's top edge to the right), -1 if along -x (top edge left).
 */
export function sideFromDown(d: Vec3): 1 | -1 {
  return d.x >= 0 ? 1 : -1;
}

/**
 * Pitch in degrees: 0 = screen vertical, + = screen towards floor,
 * - = screen towards ceiling. Rotation is about the device's long (y) axis,
 * which is the horizontal axis when the phone is landscape on your forehead.
 */
export function pitchFromDown(d: Vec3, side: 1 | -1): number {
  return Math.atan2(d.z, side * d.x) * RAD;
}

/** Wrap an angle into [-180, 180). */
export function wrap(deg: number): number {
  return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/** Phone is landscape-ish with the screen roughly vertical. */
export function isUpright(d: Vec3): boolean {
  return Math.abs(d.x) > 0.8;
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// ---------------------------------------------------------------------------
// Trigger state machine (pure; unit tested).

export type DetectorOptions = {
  threshold: number;
  neutralBand?: number;
  lockoutMs?: number;
  holdMs?: number;
};

export class TiltDetector {
  threshold: number;
  neutralBand: number;
  lockoutMs: number;
  holdMs: number;

  /** Only armed after we've seen the phone near neutral. */
  private armed = false;
  private lockUntil = 0;
  private pending: { dir: TiltDir; since: number } | null = null;

  constructor(opts: DetectorOptions) {
    this.threshold = opts.threshold;
    this.neutralBand = opts.neutralBand ?? NEUTRAL_BAND;
    this.lockoutMs = opts.lockoutMs ?? LOCKOUT_MS;
    this.holdMs = opts.holdMs ?? HOLD_MS;
  }

  reset(): void {
    this.armed = false;
    this.lockUntil = 0;
    this.pending = null;
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /**
   * Feed one filtered pitch sample (degrees relative to the calibrated
   * neutral). `blocked` = we're mid-flash, paused or in portrait: never fire,
   * but still let the phone re-arm by coming back to neutral.
   */
  feed(pitch: number, t: number, blocked = false): TiltDir | null {
    if (!this.armed) {
      if (Math.abs(pitch) <= this.neutralBand && t >= this.lockUntil) this.armed = true;
      this.pending = null;
      return null;
    }
    if (blocked) {
      this.pending = null;
      return null;
    }
    const dir: TiltDir | null =
      pitch >= this.threshold ? 'down' : pitch <= -this.threshold ? 'up' : null;
    if (!dir) {
      this.pending = null;
      return null;
    }
    if (!this.pending || this.pending.dir !== dir) this.pending = { dir, since: t };
    if (t - this.pending.since >= this.holdMs) {
      this.armed = false;
      this.lockUntil = t + this.lockoutMs;
      this.pending = null;
      return dir;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Browser sensor wrapper.

export type MotionPermission = 'granted' | 'denied' | 'unsupported';

type PermissionAPI = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function motionNeedsPermission(): boolean {
  if (typeof window === 'undefined') return false;
  const DOE = (window as any).DeviceOrientationEvent as PermissionAPI | undefined;
  const DME = (window as any).DeviceMotionEvent as PermissionAPI | undefined;
  return typeof DOE?.requestPermission === 'function' || typeof DME?.requestPermission === 'function';
}

export function motionSupported(): boolean {
  return typeof window !== 'undefined' && ('DeviceOrientationEvent' in window || 'DeviceMotionEvent' in window);
}

/**
 * Must be called synchronously inside a tap handler (iOS 13+). Both requests
 * are fired in the same tick so neither loses the user-gesture.
 */
export function requestMotionPermission(): Promise<MotionPermission> {
  if (!motionSupported()) return Promise.resolve('unsupported');
  if (!motionNeedsPermission()) return Promise.resolve('granted');
  const DOE = (window as any).DeviceOrientationEvent as PermissionAPI;
  const DME = (window as any).DeviceMotionEvent as PermissionAPI;
  const reqs = [DOE?.requestPermission?.(), DME?.requestPermission?.()].filter(Boolean) as Promise<string>[];
  return Promise.allSettled(reqs).then((rs) =>
    rs.some((r) => r.status === 'fulfilled' && r.value === 'granted') ? 'granted' : 'denied',
  );
}

export type TiltSample = {
  t: number;
  /** Filtered down vector. */
  down: Vec3;
  /** Pitch relative to calibrated neutral (flip applied). */
  pitch: number;
  upright: boolean;
};

/**
 * Listens to orientation (preferred) and motion (fallback) events, low-pass
 * filters the down vector and emits pitch samples relative to a calibrated
 * neutral pose.
 */
export class TiltSensor {
  private filtered: Vec3 | null = null;
  private lastT = 0;
  private lastOrientationT = -Infinity;
  private side: 1 | -1 = 1;
  private baseline = 0;
  private calibrated = false;
  private calib: Vec3[] | null = null;
  private listeners = new Set<(s: TiltSample) => void>();
  private running = false;
  private readonly ios = isIOS();

  /** Read on every sample so the setting applies live. */
  flip: () => boolean;

  constructor(flip: () => boolean = () => false) {
    this.flip = flip;
  }

  get hasData(): boolean {
    return this.filtered !== null;
  }

  get down(): Vec3 | null {
    return this.filtered;
  }

  subscribe(cb: (s: TiltSample) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  start(): void {
    if (this.running || typeof window === 'undefined') return;
    this.running = true;
    window.addEventListener('deviceorientation', this.onOrientation);
    window.addEventListener('devicemotion', this.onMotion);
  }

  stop(): void {
    this.running = false;
    window.removeEventListener('deviceorientation', this.onOrientation);
    window.removeEventListener('devicemotion', this.onMotion);
    this.filtered = null;
  }

  /** Start collecting neutral-pose samples (call at the start of the countdown). */
  beginCalibration(): void {
    this.calib = [];
  }

  /** Lock in neutral from the samples collected since beginCalibration(). */
  endCalibration(): void {
    const samples = this.calib ?? [];
    this.calib = null;
    const src = samples.length ? samples : this.filtered ? [this.filtered] : [];
    if (!src.length) {
      this.baseline = 0;
      return;
    }
    const avg = normalise(
      src.reduce((a, v) => ({ x: a.x + v.x, y: a.y + v.y, z: a.z + v.z }), { x: 0, y: 0, z: 0 }),
    );
    if (!avg) return;
    this.calibrated = true;
    this.side = sideFromDown(avg);
    // Keep the baseline sane: if someone calibrates with the phone way off,
    // don't let it eat the whole threshold.
    const p = pitchFromDown(avg, this.side);
    this.baseline = Math.max(-25, Math.min(25, p));
  }

  /** Neutral = screen vertical, using whatever side the phone is on right now. */
  resetCalibration(): void {
    this.baseline = 0;
    this.calibrated = false;
  }

  /** Feed a sample manually (desktop "simulate tilt" slider, tests). */
  simulate(pitchDeg: number): void {
    const r = pitchDeg / RAD;
    // Landscape, top edge to the right: neutral down = +x, tilting screen
    // towards the floor swings down into +z.
    this.ingest({ x: Math.cos(r), y: 0, z: Math.sin(r) }, performance.now(), 0, true);
  }

  private onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null) return;
    const t = e.timeStamp || performance.now();
    this.lastOrientationT = t;
    this.ingest(downFromOrientation(e.beta, e.gamma), t, 60);
  };

  private onMotion = (e: DeviceMotionEvent) => {
    const t = e.timeStamp || performance.now();
    // Orientation is sensor-fused and better; only use motion if it's quiet.
    if (t - this.lastOrientationT < 400) return;
    const a = e.accelerationIncludingGravity;
    if (!a || a.x == null || a.y == null || a.z == null) return;
    const v = { x: a.x, y: a.y, z: a.z };
    // Shaking / walking: the reading isn't gravity, skip it.
    if (!isSteady(v)) return;
    const d = downFromMotion(v, this.ios);
    if (d) this.ingest(d, t, 110);
  };

  private ingest(d: Vec3, t: number, tauMs: number, raw = false): void {
    if (raw || !this.filtered) {
      this.filtered = d;
    } else {
      const dt = Math.max(0, Math.min(200, t - this.lastT));
      const k = 1 - Math.exp(-dt / tauMs);
      this.filtered =
        normalise({
          x: this.filtered.x + (d.x - this.filtered.x) * k,
          y: this.filtered.y + (d.y - this.filtered.y) * k,
          z: this.filtered.z + (d.z - this.filtered.z) * k,
        }) ?? d;
    }
    this.lastT = t;
    const f = this.filtered;
    if (this.calib) this.calib.push(f);
    // Until calibrated, follow whichever landscape side the phone is on.
    if (!this.calibrated && Math.abs(f.x) > 0.5) this.side = sideFromDown(f);
    let pitch = wrap(pitchFromDown(f, this.side) - this.baseline);
    if (this.flip()) pitch = -pitch;
    const sample: TiltSample = { t, down: f, pitch, upright: isUpright(f) };
    this.listeners.forEach((cb) => cb(sample));
  }
}
