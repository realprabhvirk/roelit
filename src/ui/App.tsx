import { useEffect, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { installDismissed, settings } from '../state';
import { setSoundEnabled } from '../audio';
import { setHapticsEnabled } from '../haptics';
import { isStandalone } from '../voice';
import { isIOS } from '../tilt';
import { Icon } from './icons';
import { screen, screenNonce, tab, type Tab } from './router';
import { applyChrome } from './services';
import { PlayTab } from './PlayTab';
import { DecksTab } from './DecksTab';
import { SettingsTab } from './SettingsTab';
import { PreRound } from './PreRound';
import { RoundScreen } from './RoundScreen';
import { Results } from './Results';
import { TiltTest } from './TiltTest';
import { InstallSheet } from './HelpSheets';

effect(() => {
  const t = settings.value.theme;
  const root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', t);
  applyChrome();
});
effect(() => setSoundEnabled(settings.value.sound));
effect(() => setHapticsEnabled(settings.value.haptics));

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'play', label: 'Play', icon: 'play' },
  { id: 'decks', label: 'Decks', icon: 'stack' },
  { id: 'settings', label: 'Settings', icon: 'gear-six' },
];

export function App({ updateReady, onUpdate }: { updateReady: boolean; onUpdate: () => void }) {
  const [install, setInstall] = useState(false);
  const current = tab.value;
  const s = screen.value;

  useEffect(() => {
    // First visit in Safari on iPhone: explain Add to Home Screen once.
    if (!isStandalone() && isIOS() && !installDismissed.value) {
      const t = setTimeout(() => setInstall(true), 900);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <>
      <div class="shell" aria-hidden={s.name !== 'tabs'}>
        <div class="tab-views">
          <PlayTab active={current === 'play'} />
          <DecksTab active={current === 'decks'} />
          <SettingsTab active={current === 'settings'} />
        </div>
        <nav class="tabbar" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={current === t.id}
              onClick={() => (tab.value = t.id)}
            >
              <Icon name={t.icon} size={24} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {s.name === 'pre' && <PreRound key={'pre' + screenNonce} deckId={s.deckId} />}
      {s.name === 'round' && <RoundScreen key={'round' + screenNonce} deckId={s.deckId} tilt={s.tilt} voice={s.voice} record={s.record} />}
      {s.name === 'results' && <Results deckId={s.deckId} results={s.results} newBest={s.newBest} early={s.early} />}
      {s.name === 'tilt-test' && <TiltTest />}

      {updateReady && s.name === 'tabs' && (
        <div class="toast" role="status">
          <span>New version ready.</span>
          <button onClick={onUpdate}>Reload</button>
        </div>
      )}
      <InstallSheet open={install} onClose={() => setInstall(false)} />
    </>
  );
}
