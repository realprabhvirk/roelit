import { useEffect, useRef, useState } from 'preact/hooks';
import { findDeck, bestFor } from '../state';
import { STRINGS } from '../strings';
import type { Result } from '../game';
import { cardText } from '../match';
import { unlockAudio } from '../audio';
import { Icon } from './icons';
import { CloseButton, Group, Row } from './controls';
import { go, tab } from './router';
import { primeForRound } from './PreRound';
import { clip, discardClip, saveClip } from '../recorder';
import { stopCamera } from '../camera';
import { log } from '../debug';
import { haptic } from '../haptics';

export function Results({ deckId, results, newBest }: { deckId: string; results: Result[]; newBest: boolean }) {
  const deck = findDeck(deckId);
  const got = results.filter((r) => r.outcome === 'correct');
  const passed = results.filter((r) => r.outcome === 'pass');
  const best = bestFor(deckId);

  const c = clip.value;
  const [warn, setWarn] = useState(false);
  const warnTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(warnTimer.current), []);

  // Don't let an unsaved clip vanish on a stray tap: first tap warns.
  const guard = (leave: () => void) => () => {
    const cur = clip.value;
    const unsaved = cur && !cur.saved && (cur.status === 'ready' || cur.status === 'finishing');
    if (unsaved && !warn) {
      setWarn(true);
      clearTimeout(warnTimer.current);
      warnTimer.current = setTimeout(() => setWarn(false), 4000);
      return;
    }
    if (cur) log(`results: leaving, clip ${cur.saved ? 'saved' : 'not saved'}`);
    discardClip();
    leave();
  };

  const again = guard(() => {
    unlockAudio();
    primeForRound();
    go({ name: 'pre', deckId });
  });
  const change = guard(() => {
    stopCamera();
    tab.value = 'play';
    go({ name: 'tabs' });
  });

  const save = async () => {
    setWarn(false);
    const r = await saveClip();
    if (r === 'saved' || r === 'downloaded') haptic('success');
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter') again();
      if (e.key === 'Escape') change();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  const label = got.length === 1 ? `${STRINGS.correctPast} 1 card` : `${STRINGS.correctPast} ${got.length} cards`;

  return (
    <div class="fullscreen scrolls results">
      <CloseButton onClick={change} label="Done" />
      <div class="results-inner">
        <div class="results-head">
          <div class="results-score display">{got.length}</div>
          <div class="results-meta">
            <div class="deck-name">{deck?.name}</div>
            <div class="label">{got.length === 0 ? 'Tough room.' : label}</div>
            {newBest ? (
              <div class="best-chip">
                <Icon name="trophy" size={15} /> New best
              </div>
            ) : best > 0 ? (
              <div class="row-sub">Best {best}</div>
            ) : null}
          </div>
        </div>

        {c && (
          <div class="clip-card">
            {c.status === 'ready' && c.url ? (
              <video
                src={c.url}
                controls
                playsInline
                preload="metadata"
                aria-label="Round recording"
                // Show a frame from a second in, not the black frame before the camera warmed up.
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget as HTMLVideoElement;
                  if (v.currentTime === 0) v.currentTime = Math.min(1, (v.duration || 2) / 2);
                }}
              />
            ) : null}
            <div class="clip-side">
              {c.status !== 'ready' && (
                <div class="clip-note" style={{ marginTop: 0 }}>
                  {c.status === 'failed' ? "The recording didn't work this time. Sorry." : 'Finishing the video…'}
                </div>
              )}
              {c.status === 'ready' && (
                <div class="clip-actions">
                  <button class="btn btn-primary press" onClick={save}>
                    <Icon name={c.saved ? 'check' : 'download-simple'} size={18} /> {c.saved ? 'Saved' : 'Save to Photos'}
                  </button>
                </div>
              )}
              {c.status === 'ready' && !c.saved && !warn && (
                <p class="clip-note">Tap Save to Photos, then Save Video. iOS doesn't let web apps save on their own.</p>
              )}
              {warn && <p class="clip-note warn">Video's not saved. Tap again to leave without it.</p>}
            </div>
          </div>
        )}

        <div class="results-cols">
          <Group label={`${STRINGS.correctPast} · ${got.length}`}>
            {got.length ? (
              got.map((r, i) => (
                <div class="row result-row" key={i}>
                  <Icon name="check" size={18} />
                  <div class="row-main">
                    <div class="row-title">{cardText(r.card)}</div>
                  </div>
                </div>
              ))
            ) : (
              <Row title={<span style={{ color: 'var(--ink-2)' }}>Nothing this time</span>} />
            )}
          </Group>
          <Group label={`${STRINGS.passPast} · ${passed.length}`}>
            {passed.length ? (
              passed.map((r, i) => (
                <div class="row result-row pass" key={i}>
                  <Icon name="arrow-bend-up-right" size={18} />
                  <div class="row-main">
                    <div class="row-title">{cardText(r.card)}</div>
                  </div>
                </div>
              ))
            ) : (
              <Row title={<span style={{ color: 'var(--ink-2)' }}>No passes. Respect.</span>} />
            )}
          </Group>
        </div>
      </div>
      <div class="results-actions">
        <button class="btn btn-secondary press" onClick={change}>
          Change deck
        </button>
        <button class="btn btn-primary press" onClick={again}>
          <Icon name="arrow-counter-clockwise" size={18} /> Play again
        </button>
      </div>
    </div>
  );
}
