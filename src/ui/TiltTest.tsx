import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { motionPermission, settings } from '../state';
import { STRINGS } from '../strings';
import { THRESHOLDS, NEUTRAL_BAND, TiltDetector, motionNeedsPermission, requestMotionPermission } from '../tilt';
import { sfx, unlockAudio } from '../audio';
import { CloseButton } from './controls';
import { go, isLandscape, tab } from './router';
import { setChromeColor, tiltSensor } from './services';
import { MotionHelpSheet } from './HelpSheets';

const RANGE = 90;

export function TiltTest() {
  const threshold = THRESHOLDS[settings.value.sensitivity];
  const detector = useMemo(() => new TiltDetector({ threshold }), [threshold]);
  const [pitch, setPitch] = useState<number | null>(null);
  const [last, setLast] = useState<'correct' | 'pass' | null>(null);
  const [armed, setArmed] = useState(false);
  const [sim, setSim] = useState(0);
  const [help, setHelp] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  const simulating = useRef(false);

  useEffect(() => {
    setChromeColor('#46505C');
    tiltSensor.start();
    tiltSensor.resetCalibration();
    const off = tiltSensor.subscribe((s) => {
      setPitch(s.pitch);
      const dir = detector.feed(s.pitch, s.t, !isLandscape.value && !simulating.current);
      setArmed(detector.isArmed);
      if (dir) {
        const r = dir === 'down' ? 'correct' : 'pass';
        r === 'correct' ? sfx.correct() : sfx.pass();
        setLast(r);
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setLast(null), 650);
      }
    });
    const k = (e: KeyboardEvent) => e.key === 'Escape' && done();
    window.addEventListener('keydown', k);
    return () => {
      off();
      setChromeColor(null);
      clearTimeout(flashTimer.current);
      window.removeEventListener('keydown', k);
    };
  }, [detector]);

  const done = () => {
    tab.value = 'settings';
    go({ name: 'tabs' });
  };

  const calibrate = () => {
    unlockAudio();
    tiltSensor.beginCalibration();
    setTimeout(() => tiltSensor.endCalibration(), 400);
    detector.reset();
  };

  const needPerm = motionNeedsPermission() && motionPermission.value !== 'granted';
  const enable = () => {
    unlockAudio();
    requestMotionPermission().then((r) => {
      motionPermission.value = r === 'denied' ? 'denied' : 'granted';
      if (r === 'denied') setHelp(true);
    });
  };

  const pct = (deg: number) => `${((Math.max(-RANGE, Math.min(RANGE, deg)) + RANGE) / (2 * RANGE)) * 100}%`;
  const p = pitch ?? 0;
  const zone = p >= threshold ? 'correct' : p <= -threshold ? 'pass' : null;
  const stateLabel = last
    ? last === 'correct'
      ? STRINGS.correct
      : STRINGS.pass
    : pitch == null
      ? 'No sensor yet'
      : zone === 'correct'
        ? `Would ${STRINGS.correct}`
        : zone === 'pass'
          ? `Would ${STRINGS.pass}`
          : armed
            ? 'Neutral · ready'
            : 'Back to neutral';

  return (
    <div class={'fullscreen tilt-test' + (last ? ' flash-' + last : '')}>
      <CloseButton onClick={done} label="Done" />
      <div class="tilt-body">
        <div class="tilt-angle display" aria-live="polite">
          {pitch == null ? '—' : `${p > 0 ? '+' : ''}${Math.round(p)}°`}
        </div>
        <div class="tilt-state display">{stateLabel}</div>

        <div class="meter" aria-hidden="true">
          <div class="meter-track" />
          <div
            class="meter-zone"
            style={{ left: pct(-NEUTRAL_BAND), width: `calc(${pct(NEUTRAL_BAND)} - ${pct(-NEUTRAL_BAND)})`, background: 'rgba(243,237,226,0.18)' }}
          />
          <div class="meter-zone" style={{ left: 0, width: pct(-threshold), background: 'rgba(216,69,46,0.75)' }} />
          <div class="meter-zone" style={{ left: pct(threshold), right: 0, background: 'rgba(47,107,79,0.9)' }} />
          <div class="meter-tick" style={{ left: '50%' }} />
          {pitch != null && <div class="meter-needle" style={{ left: pct(p) }} />}
        </div>
        <div class="meter-labels">
          <span>Up · {STRINGS.pass}</span>
          <span>
            ±{threshold}° to fire
          </span>
          <span>Down · {STRINGS.correct}</span>
        </div>

        <p style={{ marginTop: 18, opacity: 0.8, fontSize: 15, maxWidth: '48ch' }}>
          Hold it sideways on your forehead, screen out. Tap Calibrate in your normal pose, then tilt. If down
          shows {STRINGS.pass}, turn on Flip tilt direction in Settings.
        </p>

        <label style={{ marginTop: 14, fontSize: 13, opacity: 0.75, display: 'block' }}>
          Simulate tilt (no sensor? use this)
          <input
            class="sim"
            type="range"
            min={-RANGE}
            max={RANGE}
            value={sim}
            onPointerDown={() => (simulating.current = true)}
            onPointerUp={() => {
              simulating.current = false;
              setSim(0);
              tiltSensor.simulate(0);
            }}
            onInput={(e) => {
              simulating.current = true;
              const v = Number((e.currentTarget as HTMLInputElement).value);
              setSim(v);
              tiltSensor.resetCalibration();
              tiltSensor.simulate(v);
            }}
          />
        </label>
      </div>
      <div class="tilt-actions">
        {needPerm ? (
          <button class="btn btn-primary press" onClick={enable}>
            Enable motion
          </button>
        ) : (
          <button class="btn btn-secondary press" onClick={calibrate}>
            Calibrate
          </button>
        )}
        <button class="btn btn-primary press" onClick={done}>
          Done
        </button>
      </div>
      <MotionHelpSheet open={help} onClose={() => setHelp(false)} />
    </div>
  );
}
