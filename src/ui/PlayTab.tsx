import { useRef, useState } from 'preact/hooks';
import { allDecks, bestScores, lastDeckId, settings, setSetting, ROUND_LENGTHS } from '../state';
import { cardCount, isLocked, type Deck } from '../deck';
import { onColor, resolveColor } from '../palette';
import { Icon } from './icons';
import { Page, Segmented, Sheet } from './controls';
import { go, isLandscape } from './router';
import { unlockAudio } from '../audio';
import { primeForRound } from './PreRound';
import { PasscodeSheet } from './Passcode';

// Deliberately uneven tile heights: a repeating rhythm, offset per column.
const HEIGHTS = [212, 156, 184, 232, 164, 200, 148, 220];

export function PlayTab({ active }: { active: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [lockId, setLockId] = useState<string | null>(null);
  const decks = allDecks.value;
  const cols = isLandscape.value && window.innerWidth > 700 ? 4 : 2;
  const columns: Deck[][] = Array.from({ length: cols }, () => []);
  decks.forEach((d, i) => columns[i % cols].push(d));
  const open = decks.find((d) => d.id === openId) ?? null;

  return (
    <Page title="ROEL IT!" brand active={active}>
      <p class="lede">Pick a deck. Phone on your forehead. Your mates do the talking.</p>
      <div class="deck-grid">
        {columns.map((col, c) => (
          <div class="deck-col" key={c}>
            {col.map((d, r) => (
              <DeckTile
                key={d.id}
                deck={d}
                height={HEIGHTS[(r * cols + c * 3) % HEIGHTS.length]}
                onClick={() => (isLocked(d) ? setLockId(d.id) : setOpenId(d.id))}
              />
            ))}
          </div>
        ))}
      </div>
      <DeckSheet deck={open} onClose={() => setOpenId(null)} />
      <PasscodeSheet
        open={lockId !== null}
        title={decks.find((d) => d.id === lockId)?.name ?? 'Locked'}
        onClose={() => setLockId(null)}
        onUnlocked={() => {
          setOpenId(lockId);
          setLockId(null);
        }}
      />
    </Page>
  );
}

function DeckTile({ deck, height, onClick }: { deck: Deck; height: number; onClick: () => void }) {
  const bg = resolveColor(deck.color);
  const fg = onColor(deck.color);
  const best = bestScores.value[deck.id];
  return (
    <button
      class={'deck-tile press' + (deck.color === 'ink' ? ' dark-tile' : '')}
      style={{ background: bg, color: fg, minHeight: height }}
      onClick={onClick}
    >
      <div class="deck-tile-top">
        <Icon name={isLocked(deck) ? 'lock-simple' : deck.icon} size={26} />
        <span class="deck-tile-count">{cardCount(deck)}</span>
      </div>
      <div>
        <div class="deck-tile-name display">{deck.name}</div>
        {best ? <div class="deck-tile-best">Best {best}</div> : null}
      </div>
    </button>
  );
}

export function DeckSheet({ deck, onClose }: { deck: Deck | null; onClose: () => void }) {
  // Keep the last deck around while the sheet animates out.
  const last = useRef<Deck | null>(deck);
  if (deck) last.current = deck;
  const d = deck ?? last.current;
  const len = settings.value.roundLength;

  const start = () => {
    if (!d) return;
    unlockAudio();
    lastDeckId.value = d.id;
    // Permission prompts need this tap, so they're kicked off right here.
    primeForRound();
    onClose();
    go({ name: 'pre', deckId: d.id });
  };

  return (
    <Sheet open={!!deck} onClose={onClose}>
      {d && (
        <>
          <div class="deck-hero" style={{ background: resolveColor(d.color), color: onColor(d.color) }}>
            <div class="deck-hero-top">
              <Icon name={d.icon} size={28} />
              <div class="stat-line">
                <span>{cardCount(d)} cards</span>
                {bestScores.value[d.id] ? <span>Best {bestScores.value[d.id]}</span> : null}
              </div>
            </div>
            <div>
              <h2 class="display">{d.name}</h2>
              {d.description && <p>{d.description}</p>}
            </div>
          </div>
          <div class="field-label">Round length</div>
          <Segmented
            label="Round length"
            value={len}
            options={ROUND_LENGTHS.map((s) => ({ value: s, label: `${s}s` }))}
            onChange={(v) => setSetting('roundLength', v)}
          />
          <div style={{ height: 20 }} />
          <button class="btn btn-primary press" onClick={start}>
            Start
          </button>
        </>
      )}
    </Sheet>
  );
}
