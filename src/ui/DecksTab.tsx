import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import {
  allDecks,
  customDecks,
  deleteCustomDeck,
  findDeck,
  lastDeckId,
  uniqueDeckId,
  upsertCustomDeck,
} from '../state';
import { cardCount, cardsToLines, exportDeck, isLocked, parseCardLines, parseDeckJSON, slug, text, type Deck } from '../deck';
import { PALETTE_NAMES, onColor, resolveColor } from '../palette';
import { unlockAudio } from '../audio';
import { ICON_KEYS, Icon } from './icons';
import { Group, Page, Row, Sheet } from './controls';
import { go } from './router';
import { PasscodeSheet } from './Passcode';
import { lockCrew } from '../vault';
import { CREW_ID } from '../decks';
import { primeForRound } from './PreRound';

export function DecksTab({ active }: { active: boolean }) {
  const [preview, setPreview] = useState<Deck | null>(null);
  const [lockFor, setLockFor] = useState<Deck | null>(null);
  const [editing, setEditing] = useState<Deck | 'new' | null>(null);
  const [notice, setNotice] = useState<{ title: string; body: string; deck?: Deck } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const custom = customDecks.value;

  const onFile = async (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    let txt = '';
    try {
      txt = await file.text();
    } catch {
      setNotice({ title: "Couldn't import", body: "Couldn't read that file." });
      return;
    }
    const res = parseDeckJSON(txt);
    if (!res.ok) {
      setNotice({ title: "Couldn't import", body: res.error });
      return;
    }
    // Re-importing the same deck replaces it; built-in ids are never touched.
    const existing = custom.find((d) => d.id === res.deck.id);
    const id = existing ? existing.id : uniqueDeckId(res.deck.id);
    const deck = { ...res.deck, id, custom: true };
    upsertCustomDeck(deck);
    setNotice({
      title: existing ? 'Deck updated' : 'Deck imported',
      body: `${deck.name} · ${deck.cards.length} cards. It's on the Play tab now.`,
      deck,
    });
  };

  return (
    <Page title="Decks" active={active}>
      <Group label="Yours" foot="Make your own, or import a deck file from a mate.">
        {custom.map((d) => (
          <DeckRow key={d.id} deck={d} onClick={() => setEditing(d)} />
        ))}
        <Row
          title="New deck"
          lead={
            <span class="row-lead-icon">
              <Icon name="plus" size={22} />
            </span>
          }
          variant="accent"
          onClick={() => setEditing('new')}
        />
        <Row
          title="Import from file"
          lead={
            <span class="row-lead-icon">
              <Icon name="download-simple" size={22} />
            </span>
          }
          variant="accent"
          onClick={() => fileRef.current?.click()}
        />
      </Group>

      <Group label="Built in">
        {allDecks.value.filter((d) => !d.custom).map((d) => (
          <DeckRow key={d.id} deck={d} onClick={() => (isLocked(d) ? setLockFor(d) : setPreview(d))} />
        ))}
      </Group>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        class="visually-hidden"
        onChange={onFile}
        tabIndex={-1}
        aria-hidden="true"
      />

      <PreviewSheet deck={preview} onClose={() => setPreview(null)} />
      <PasscodeSheet
        open={lockFor !== null}
        title={lockFor?.name ?? 'Locked'}
        onClose={() => setLockFor(null)}
        onUnlocked={() => {
          setPreview(findDeck(lockFor?.id) ?? null);
          setLockFor(null);
        }}
      />
      <EditorSheet target={editing} onClose={() => setEditing(null)} />
      <Sheet
        open={!!notice}
        onClose={() => setNotice(null)}
        title={notice?.title}
        right={
          <button class="btn-plain" onClick={() => setNotice(null)}>
            OK
          </button>
        }
      >
        {notice && (
          <>
            {notice.deck ? <p class="prose">{notice.body}</p> : <div class="error-box">{notice.body}</div>}
            {notice.deck && (
              <>
                <div style={{ height: 16 }} />
                <button
                  class="btn btn-primary press"
                  onClick={() => {
                    const d = notice.deck!;
                    setNotice(null);
                    playDeck(d);
                  }}
                >
                  Play it
                </button>
              </>
            )}
          </>
        )}
      </Sheet>
    </Page>
  );
}

function playDeck(d: Deck): void {
  unlockAudio();
  lastDeckId.value = d.id;
  primeForRound();
  go({ name: 'pre', deckId: d.id });
}

function DeckRow({ deck, onClick }: { deck: Deck; onClick: () => void }) {
  return (
    <Row
      title={deck.name}
      sub={`${isLocked(deck) ? 'Locked · ' : ''}${cardCount(deck)} cards`}
      lead={
        <span class="swatch" style={{ background: resolveColor(deck.color), color: onColor(deck.color) }}>
          <Icon name={isLocked(deck) ? 'lock-simple' : deck.icon} size={18} />
        </span>
      }
      chevron
      onClick={onClick}
    />
  );
}

export async function shareDeck(d: Deck): Promise<void> {
  const json = exportDeck(d);
  const name = `${d.id}.json`;
  try {
    const file = new File([json], name, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: d.name });
      return;
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function PreviewSheet({ deck, onClose }: { deck: Deck | null; onClose: () => void }) {
  const last = useRef<Deck | null>(deck);
  if (deck) last.current = deck;
  const d = deck ?? last.current;
  return (
    <Sheet open={!!deck} onClose={onClose} tall>
      {d && (
        <>
          <div class="deck-hero" style={{ background: resolveColor(d.color), color: onColor(d.color) }}>
            <div class="deck-hero-top">
              <Icon name={d.icon} size={28} />
              <span>{d.cards.length} cards</span>
            </div>
            <div>
              <h2 class="display">{d.name}</h2>
              {d.description && <p>{d.description}</p>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button class="btn btn-secondary press" onClick={() => shareDeck(d)}>
              <Icon name="export" size={18} /> Export
            </button>
            <button
              class="btn btn-primary press"
              onClick={() => {
                onClose();
                playDeck(d);
              }}
            >
              Play
            </button>
          </div>
          {d.id === CREW_ID && (
            <button
              class="btn btn-plain press"
              style={{ marginTop: 6 }}
              onClick={() => {
                onClose();
                lockCrew();
              }}
            >
              Lock again
            </button>
          )}
          <div class="field-label">Cards</div>
          <div class="card-list">
            {d.cards.map((c, i) => (
              <div key={i}>{text(c)}</div>
            ))}
          </div>
        </>
      )}
    </Sheet>
  );
}

function EditorSheet({ target, onClose }: { target: Deck | 'new' | null; onClose: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('tomato');
  const [icon, setIcon] = useState('users-three');
  const [lines, setLines] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lastTarget = useRef<Deck | 'new' | null>(target);
  if (target) lastTarget.current = target;

  // Load fields when a new target opens.
  useLayoutEffect(() => {
    if (!target) return;
    setConfirmDelete(false);
    if (target === 'new') {
      setName('');
      setColor('tomato');
      setIcon('users-three');
      setLines('');
    } else {
      setName(target.name);
      setColor(target.color);
      setIcon(target.icon);
      setLines(cardsToLines(target.cards));
    }
  }, [target]);

  const shown = target ?? lastTarget.current;
  const editingDeck = shown && shown !== 'new' ? shown : null;
  const cards = parseCardLines(lines);
  const canSave = name.trim().length > 0 && cards.length > 0;

  const close = () => onClose();

  const save = () => {
    if (!canSave) return;
    const id = editingDeck ? editingDeck.id : uniqueDeckId(slug(name));
    upsertCustomDeck({
      id,
      name: name.trim().slice(0, 40),
      color,
      icon,
      description: editingDeck?.description,
      cards,
      custom: true,
    });
    close();
  };

  const del = () => {
    if (!editingDeck) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3500);
      return;
    }
    deleteCustomDeck(editingDeck.id);
    if (lastDeckId.value === editingDeck.id) lastDeckId.value = null;
    close();
  };

  return (
    <Sheet
      open={!!target}
      onClose={close}
      tall
      modal
      title={editingDeck ? 'Edit deck' : 'New deck'}
      left={
        <button class="btn-plain" onClick={close}>
          Cancel
        </button>
      }
      right={
        <button class="btn-plain" style={{ fontWeight: 700, opacity: canSave ? 1 : 0.4 }} disabled={!canSave} onClick={save}>
          Save
        </button>
      }
    >
      <div class="group" style={{ marginTop: 8 }}>
        <div class="row">
          <input
            class="text-input"
            placeholder="Deck name"
            value={name}
            maxLength={40}
            onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
            aria-label="Deck name"
          />
        </div>
      </div>

      <div class="field-label">Colour</div>
      <div class="swatches" role="radiogroup" aria-label="Colour">
        {PALETTE_NAMES.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={color === c}
            aria-label={c}
            class="press"
            style={{ background: resolveColor(c) }}
            onClick={() => setColor(c)}
          />
        ))}
      </div>

      <div class="field-label">Icon</div>
      <div class="icon-grid" role="radiogroup" aria-label="Icon">
        {ICON_KEYS.map((k) => (
          <button key={k} role="radio" aria-checked={icon === k} aria-label={k} onClick={() => setIcon(k)}>
            <Icon name={k} size={22} />
          </button>
        ))}
      </div>

      <div class="field-label">Cards · {cards.length}</div>
      <div class="group">
        <div class="row">
          <textarea
            class="text-input"
            placeholder={'One per line\nSpider-Man | Spiderman, Spider Man'}
            value={lines}
            onInput={(e) => setLines((e.currentTarget as HTMLTextAreaElement).value)}
            aria-label="Cards, one per line"
            autocapitalize="words"
            spellcheck={false}
          />
        </div>
      </div>
      <p class="group-foot">
        One card per line. To help voice detection, add other ways of saying it after a bar, split by commas.
      </p>

      {editingDeck && (
        <div class="group" style={{ marginTop: 24 }}>
          <Row
            title="Export deck"
            lead={
              <span class="row-lead-icon">
                <Icon name="export" size={20} />
              </span>
            }
            variant="accent"
            onClick={() => {
              const d = findDeck(editingDeck.id);
              if (d) shareDeck(d);
            }}
          />
          <Row
            title={confirmDelete ? 'Tap again to delete' : 'Delete deck'}
            lead={
              <span class="row-lead-icon" style={{ color: 'var(--bad)' }}>
                <Icon name="trash" size={20} />
              </span>
            }
            variant="destructive"
            onClick={del}
          />
        </div>
      )}
    </Sheet>
  );
}
