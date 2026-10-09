import { useEffect, useState } from 'preact/hooks';
import { clearLogs, currentLog, log, previousLog } from '../debug';
import { Sheet } from './controls';
import { Icon } from './icons';

declare const __APP_VERSION__: string;
declare const __BUILD__: string;

/** Settings → Diagnostics: the on-device log, to copy and send when something goes wrong. */
export function DiagnosticsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [text, setText] = useState('');
  const [note, setNote] = useState('');

  const refresh = () => {
    const prev = previousLog();
    setText(
      `ROEL IT! v${__APP_VERSION__} (${__BUILD__})\n\n--- this session ---\n${currentLog()}` +
        (prev ? `\n\n--- previous session ---\n${prev}` : ''),
    );
  };

  useEffect(() => {
    if (open) {
      log('diagnostics opened');
      refresh();
      setNote('');
    }
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied. Paste it to whoever is fixing this.');
    } catch {
      setNote("Couldn't copy. Use Share instead.");
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: 'ROEL IT! diagnostics', text });
    } catch {
      /* cancelled */
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="Diagnostics"
      right={
        <button class="btn-plain" onClick={onClose}>
          Done
        </button>
      }
    >
      <p class="prose">
        If the app froze or the mic acted up, reopen it and send this log straight away. It includes the session
        before this one. No codes or card names are in it.
      </p>
      <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
        <button class="btn btn-primary press" onClick={copy}>
          <Icon name="export" size={18} /> Copy log
        </button>
        {typeof navigator.share === 'function' && (
          <button class="btn btn-secondary press" onClick={share}>
            Share
          </button>
        )}
      </div>
      {note && <p class="prose" style={{ marginBottom: 10 }}>{note}</p>}
      <pre class="log-view">{text}</pre>
      <button
        class="btn btn-plain press"
        onClick={() => {
          clearLogs();
          refresh();
        }}
      >
        Clear log
      </button>
    </Sheet>
  );
}
