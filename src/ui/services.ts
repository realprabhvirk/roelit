// Long-lived singletons shared by screens.
import { TiltSensor } from '../tilt';
import { VoiceListener } from '../voice';
import { settings, voiceHealth } from '../state';
import { isStandalone } from '../voice';

export const tiltSensor = new TiltSensor(() => settings.value.flipTilt);

/** Created per round so callbacks point at the live round. */
export function makeVoice(opts: { onMatch?: () => void; onTranscript?: (t: string) => void }): VoiceListener {
  return new VoiceListener({
    lang: settings.value.voiceLang,
    ...opts,
    onBlocked: () => {
      voiceHealth.value = 'blocked';
    },
    onWorking: () => {
      if (voiceHealth.value !== 'ok') voiceHealth.value = 'ok';
    },
  });
}

export function voiceBlockedHere(): boolean {
  return voiceHealth.value === 'blocked' && isStandalone();
}

let themeMetaOverride: string | null = null;

/** Point the status bar colour at whatever is full-bleed on screen. */
export function setChromeColor(color: string | null): void {
  themeMetaOverride = color;
  applyChrome();
}

export function applyChrome(): void {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  const t = settings.value.theme;
  const light = '#F3EDE2';
  const dark = '#1A1714';
  metas.forEach((m) => {
    const isDarkMeta = (m.getAttribute('media') ?? '').includes('dark');
    let c = isDarkMeta ? dark : light;
    if (t === 'light') c = light;
    if (t === 'dark') c = dark;
    if (themeMetaOverride) c = themeMetaOverride;
    m.setAttribute('content', c);
  });
}
