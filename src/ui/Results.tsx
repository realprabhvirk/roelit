import { useEffect } from 'preact/hooks';
import { findDeck, bestFor } from '../state';
import { STRINGS } from '../strings';
import type { Result } from '../game';
import { cardText } from '../match';
import { unlockAudio } from '../audio';
import { Icon } from './icons';
import { CloseButton, Group, Row } from './controls';
import { go, tab } from './router';
import { primeForRound } from './PreRound';

export function Results({ deckId, results, newBest }: { deckId: string; results: Result[]; newBest: boolean }) {
  const deck = findDeck(deckId);
  const got = results.filter((r) => r.outcome === 'correct');
  const passed = results.filter((r) => r.outcome === 'pass');
  const best = bestFor(deckId);

  const again = () => {
    unlockAudio();
    primeForRound();
    go({ name: 'pre', deckId });
  };
  const change = () => {
    tab.value = 'play';
    go({ name: 'tabs' });
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
