import { STRINGS } from '../strings';
import { installDismissed } from '../state';
import { Icon } from './icons';
import { Sheet } from './controls';

export function MotionHelpSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Turn on motion"
      right={
        <button class="btn-plain" onClick={onClose}>
          Done
        </button>
      }
    >
      <ol class="steps">
        <li>
          <span class="step-num">1</span>
          <span>
            Open <b>Settings</b> on your iPhone, then <b>Apps → Safari</b>
          </span>
        </li>
        <li>
          <span class="step-num">2</span>
          <span>
            Turn on <b>Motion &amp; Orientation Access</b>
          </span>
        </li>
        <li>
          <span class="step-num">3</span>
          <span>Come back and start a round again</span>
        </li>
      </ol>
      <p class="prose" style={{ marginTop: 14 }}>
        Using it from the home screen? iOS sometimes remembers a "no" for good. Delete the {STRINGS.appName} icon,
        add it to the home screen again from Safari, and it'll ask fresh.
      </p>
    </Sheet>
  );
}

export function InstallSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const close = () => {
    installDismissed.value = true;
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="Put it on your home screen">
      <p class="prose">
        It runs full screen, works offline, and you don't have to find this tab again at the party.
      </p>
      <ol class="steps">
        <li>
          <span class="step-num">1</span>
          <span>
            Tap Share
            <span class="step-icon">
              <Icon name="export" size={20} />
            </span>
            in Safari's toolbar
          </span>
        </li>
        <li>
          <span class="step-num">2</span>
          <span>
            Scroll down, tap <b>Add to Home Screen</b>
            <span class="step-icon">
              <Icon name="plus-square" size={20} />
            </span>
          </span>
        </li>
        <li>
          <span class="step-num">3</span>
          <span>
            Open <b>{STRINGS.appName}</b> from your home screen
          </span>
        </li>
      </ol>
      <div style={{ height: 16 }} />
      <button class="btn btn-primary press" onClick={close}>
        Got it
      </button>
    </Sheet>
  );
}
