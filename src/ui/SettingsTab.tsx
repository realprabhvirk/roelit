import { useEffect, useRef, useState } from 'preact/hooks';
import { resetAll, settings, setSetting, voiceHealth, ROUND_LENGTHS, type Theme, type VoiceLang } from '../state';
import { STRINGS } from '../strings';
import type { Sensitivity } from '../tilt';
import { heard } from '../match';
import { isStandalone, voiceSupported, type VoiceListener, type VoiceStatus } from '../voice';
import { unlockAudio, setAudioSessionForMic, sfx } from '../audio';
import { Group, Page, Row, Segmented, Sheet, Switch } from './controls';
import { Icon } from './icons';
import { go } from './router';
import { makeVoice } from './services';
import { InstallSheet } from './HelpSheets';

declare const __APP_VERSION__: string;

export function SettingsTab({ active }: { active: boolean }) {
  const s = settings.value;
  const [voiceTest, setVoiceTest] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [install, setInstall] = useState(false);

  const supported = voiceSupported();
  const standalone = isStandalone();
  const blocked = voiceHealth.value === 'blocked';
  let voiceFoot: string | null = null;
  if (!supported) voiceFoot = "This browser doesn't do speech recognition, so it's tilt only.";
  else if (blocked && standalone)
    voiceFoot =
      "iOS is blocking speech recognition for home-screen apps on this phone. Tilt still works. Voice usually works if you open the game in Safari instead.";
  else if (blocked) voiceFoot = 'Mic or speech recognition is blocked. Allow it in Settings → Apps → Safari, then try the test.';
  else voiceFoot = 'Listens during a round and counts the card when someone says it. Uses Apple’s recogniser, which may need a connection.';

  return (
    <Page title="Settings" active={active}>
      <Group label="Game">
        <Row
          title="Round length"
          trail={
            <Segmented
              compact
              label="Round length"
              value={s.roundLength}
              options={ROUND_LENGTHS.map((n) => ({ value: n, label: `${n}s` }))}
              onChange={(v) => setSetting('roundLength', v)}
            />
          }
        />
        <Row
          title="Sound"
          trail={<Switch label="Sound" checked={s.sound} onChange={(v) => setSetting('sound', v)} />}
        />
      </Group>

      <Group label="Tilt" foot="Less sensitive needs a bigger nod. If tilting down passes, flip it.">
        <Row
          title="Sensitivity"
          trail={
            <Segmented<Sensitivity>
              compact
              label="Tilt sensitivity"
              value={s.sensitivity}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Med' },
                { value: 'high', label: 'High' },
              ]}
              onChange={(v) => setSetting('sensitivity', v)}
            />
          }
        />
        <Row
          title="Flip tilt direction"
          trail={<Switch label="Flip tilt direction" checked={s.flipTilt} onChange={(v) => setSetting('flipTilt', v)} />}
        />
        <Row
          title="Test tilt"
          chevron
          onClick={() => {
            unlockAudio();
            go({ name: 'tilt-test' });
          }}
        />
      </Group>

      <Group label="Voice" foot={voiceFoot}>
        <Row
          title="Voice detection"
          sub={!supported ? 'Not available here' : blocked ? 'Blocked' : undefined}
          trail={
            <Switch
              label="Voice detection"
              checked={s.voice && supported}
              onChange={(v) => setSetting('voice', v)}
            />
          }
        />
        <Row
          title="Accent"
          trail={
            <Segmented<VoiceLang>
              compact
              label="Recognition language"
              value={s.voiceLang}
              options={[
                { value: 'en-AU', label: 'AU' },
                { value: 'en-GB', label: 'UK' },
                { value: 'en-US', label: 'US' },
              ]}
              onChange={(v) => setSetting('voiceLang', v)}
            />
          }
        />
        <Row
          title="Test voice"
          chevron
          onClick={() => {
            unlockAudio();
            setVoiceTest(true);
          }}
        />
      </Group>

      <Group label="Appearance">
        <Row
          title="Theme"
          trail={
            <Segmented<Theme>
              compact
              label="Theme"
              value={s.theme}
              options={[
                { value: 'system', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              onChange={(v) => setSetting('theme', v)}
            />
          }
        />
      </Group>

      <Group label="About">
        {!standalone && <Row title="Add to Home Screen" chevron onClick={() => setInstall(true)} />}
        <Row title="Version" value={__APP_VERSION__} />
        <Row title={confirmReset ? 'Tap again to wipe everything' : 'Reset all data'} variant="destructive" onClick={() => {
          if (confirmReset) resetAll();
          else {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 3500);
          }
        }} />
      </Group>
      <p class="group-foot" style={{ marginTop: 20, textAlign: 'center' }}>
        {STRINGS.appName} · settings, custom decks and scores stay on this phone.
      </p>

      <VoiceTestSheet open={voiceTest} onClose={() => setVoiceTest(false)} />
      <InstallSheet open={install} onClose={() => setInstall(false)} />
    </Page>
  );
}

const TEST_WORD = 'Kangaroo';

function VoiceTestSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<VoiceStatus>('off');
  const [text, setText] = useState('');
  const [hit, setHit] = useState(false);
  const voice = useRef<VoiceListener | null>(null);

  const stop = () => {
    voice.current?.stop();
    voice.current = null;
    setAudioSessionForMic(false);
  };

  useEffect(() => {
    if (!open) stop();
    else {
      setText('');
      setHit(false);
      setStatus('off');
    }
    return stop;
  }, [open]);

  const start = () => {
    unlockAudio();
    stop();
    setHit(false);
    setText('');
    const v = makeVoice({
      onTranscript: (t) => {
        setText(t);
        if (heard(t, TEST_WORD)) {
          setHit((was) => {
            if (!was) sfx.correct();
            return true;
          });
        }
      },
    });
    v.status.subscribe((st) => setStatus(st));
    voice.current = v;
    setAudioSessionForMic(true);
    v.start();
  };

  const supported = voiceSupported();
  const msg = !supported
    ? "This browser doesn't support speech recognition."
    : status === 'unavailable'
      ? isStandalone()
        ? "Blocked. iOS often won't let home-screen apps use speech recognition. Try it in Safari."
        : 'Blocked. Check mic and speech recognition permissions for Safari.'
      : status === 'offline'
        ? "Can't reach the recogniser. Check your connection."
        : status === 'listening'
          ? `Say "${TEST_WORD}"`
          : status === 'starting'
            ? 'Starting the mic…'
            : `Tap Start, then say "${TEST_WORD}".`;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Test voice"
      right={
        <button class="btn-plain" onClick={onClose}>
          Done
        </button>
      }
    >
      <p class="prose">{msg}</p>
      <div class={'voice-heard' + (hit ? ' hit' : '')} aria-live="polite">
        {hit ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icon name="check" size={22} /> Heard it. Voice works.
          </span>
        ) : (
          text || <span style={{ color: 'var(--ink-3)' }}>Nothing yet</span>
        )}
      </div>
      {supported && (
        <button class="btn btn-primary press" onClick={status === 'listening' || status === 'starting' ? stop : start}>
          <Icon name={status === 'listening' ? 'microphone-slash' : 'microphone'} size={18} />
          {status === 'listening' || status === 'starting' ? 'Stop' : 'Start'}
        </button>
      )}
    </Sheet>
  );
}
