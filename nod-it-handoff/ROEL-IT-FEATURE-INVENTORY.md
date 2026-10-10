# ROEL IT! feature inventory (as shipped, v1.4.1, commit `97e4e92`)

Audit of the real app, used as the parity checklist for NOD IT!. Where this disagrees with `ORIGINAL-BRIEF-v1.md`, this file wins. Tuned numbers are in `tuned-constants.json`; bugs and their rules are in `LESSONS-LEARNED.md`.

## Platform

- Static PWA. Vite 7 + TypeScript 5.9 + Preact 10 + `@preact/signals`. `vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'prompt'`).
- Vite `root` is `src/` (`src/index.html`); `npm run build` → `dist/`, then `scripts/publish.mjs` copies `dist/` to the repo root, so hosts that serve the repo without building still work. (Live host: Cloudflare Pages serving the repo root. A GitHub Actions → GitHub Pages workflow also exists and builds with `BASE_PATH=/<repo>/`.)
- Display face: Anton (`@fontsource/anton`, latin 400), self-hosted. UI: system font stack.
- Icons: Phosphor **bold** only, imported as raw SVG strings (`src/ui/icons.tsx`).
- App icon: flat card-on-head mark (`scripts/icon.svg`) rendered to PNGs with `@resvg/resvg-js` (`apple-touch-icon` 180, 192, 512, maskable 512 with art scaled to 80 %).
- All state in `localStorage` under prefix `roelit:` (try/catch everywhere). Keys: `settings`, `customDecks`, `best`, `lastDeck`, `motionPerm`, `micAsked`, `installDismissed`, `crewCode` (remembered deck code), `frameMode`, `queue:<deckId>`, `log`, `log:prev`. (`voiceHealth` is deliberately not persisted; old value is deleted on start.)
- Version shown in Settings as `<package version> · <build stamp MM-DD HH:MM>`.

## Shell

- Three tabs in a bottom tab bar: **Play**, **Decks**, **Settings** (Phosphor `play`, `stack`, `gear-six`). Active tab = accent colour. Tab bar has safe-area padding; in short landscape it's a 44 px row with icon + label inline.
- Each tab is its own scroll container with a sticky compact nav bar that shows the title (and a hairline) once scrolled 36 px; the large title (34 px bold; Play uses the display face at 44 px as the wordmark) scrolls with content.
- Full-screen flows sit on top of the tab shell (shell stays mounted): Pre-round, Round, Results, Test tilt. Screens are keyed by a navigation nonce so re-entering remounts fresh.
- Bottom sheets (portal to body): grabber + optional header (left action, centred title, right action), drag-to-dismiss on grabber/header, scrim tap closes (unless `modal`), `tall` variant, rubber-band when dragged up.
- First visit in Safari on an iPhone (not standalone): Install sheet after 900 ms ("Put it on your home screen": 1 Tap Share [export icon] in Safari's toolbar, 2 Tap [plus-square] Add to Home Screen, 3 Open the app from your home screen; "Got it"). Dismissal remembered. Also reachable from Settings → About → Add to Home Screen (hidden when standalone).
- "New version ready · Reload" toast above the tab bar when an update is waiting (tabs only).
- Error boundary: "Something broke" + Reload.
- Viewport snap-back, global tap haptics, diagnostics, audio unlock on first `pointerdown`, `gesturestart` blocked, empty `touchstart` listener so iOS applies `:active`.

## Play tab

- Large wordmark title, lede: "Pick a deck. Phone on your forehead. Your mates do the talking."
- Masonry grid of solid-colour deck tiles (2 columns portrait, 4 in wide landscape), tiles distributed round-robin, heights from the rhythm `[212,156,184,232,164,200,148,220]` offset per column. Tile: icon top-left (lock icon if the deck is locked), card count top-right, deck name in the display face bottom-left, "Best N" under it if set. Ink tiles get a 1 px inset hairline in dark mode.
- Tap a tile → **Deck sheet**: coloured hero block (icon, "N cards", "Best N", big name, description), "Round length" segmented control (30s/60s/90s/120s, writes the setting), primary **Start**. Start runs the permission prime in the tap (see Pre-round), stores last deck, opens Pre-round.
- Tap a locked tile → **Passcode sheet** → on success the Deck sheet opens.

## Passcode lock (the inside-joke deck)

- The deck ships encrypted (`the-crew.locked.json`: id, name, colour, icon, description, `count`, `codeLength`, `sealed {v, iter, salt, iv, data}`); cards decrypt with PBKDF2-SHA256 600k + AES-GCM. Plain card text is not in the bundle.
- Sheet titled with the deck name, "Enter the code", a row of dots (one per digit, `codeLength`; smaller and tighter when > 6), 3×4 keypad (1–9, blank, 0, backspace icon). Keys act on pointerdown. On the last digit it checks (busy, 10 s cap). Wrong: dots turn red and shake 420 ms, pass sound, error haptic, reset. Right: correct sound, success haptic, sheet closes, Deck sheet opens. Desktop digits/Backspace work.
- The code is remembered on the device; on launch the remembered code is tried silently (and forgotten if it fails). Decks → deck → **Lock again** forgets it and removes the deck's saved deal order.
- Tile shows lock icon and the real card count while locked; Decks row sub reads "Locked · 54 cards".
- `scripts/crew.mjs lock <plain.json> <code>` / `unlock <code>` re-encrypts or decrypts (4–12 digits).

## Pre-round ("Put it on your forehead")

- Full-bleed deck colour, theme-color set to it. Close X top-left (stops pending voice and the camera). Portrait: stacked; landscape: illustration | text | actions column.
- Steps, in order:
  1. **Motion** (iOS, not yet granted): title "Tilt needs motion", "iOS asks once. Say yes and tilting the phone does the scoring." → **Enable motion** / "Not now, use taps". If denied: "Motion is off" → **How to turn it on** (Motion help sheet) / "Play with taps".
  2. **Mic** (voice on, supported, never asked, not recording): "Want it to listen?" "When someone says the word, it counts. iOS will ask for the mic." → **Allow microphone** / "Skip voice".
  3. **Ready**: title "Put it on your forehead", sub "Tilt down to ROEL IT!, tilt up to pass", status line with icon: "Turn your phone sideways" (portrait) / "Tap Start, or lift it onto your forehead" → "Hold still…" → "Starting…" with a progress bar / or (no sensor) "Tap right edge for ROEL IT! Left edge to pass." Actions: **Record video** toggle (if camera recording is supported; states "Record video" / "Starting camera…" / "Recording on" + red dot) and **Start**.
- Illustration: flat SVG head + shoulders (on-colour 28 % alpha), phone in landscape on the forehead (rotated −4°), two curved tilt arrows. When recording is on and the camera is live, the illustration is replaced by a mirrored live camera preview (16:9, 14 px radius).
- Notes under the status: recording on → "Recording starts with the countdown. Voice is off while recording: the mic's on the video."; camera denied → "Camera's blocked. Settings → Apps → Safari → Camera, then try again."; camera error → "Couldn't start the camera…".
- Auto-start rules: see `tuned-constants.json` → `autoStart`. Enter/Space start, Escape closes (desktop).
- Permission prime (in the Start tap): if motion was granted before, re-request it (silent) → then start camera (if recording) or the voice recogniser (if voice wanted and mic already asked). Never two prompts at once.

## Round (play screen)

- Full-bleed deck colour; landscape design. Top: 4 px progress bar (on-colour), X (End round), score (check icon + number), optional REC (red dot, blinking) and big timer `m:ss` (system bold 34 px, tabular), pulses each second in the last 10 s.
- Countdown 3-2-1 (display face, huge, pop animation, beep each step, go tone). Calibration runs during the countdown.
- Word: display face, uppercase, fitted (see `wordFit`), enter animation per card.
- Bottom row: "↶ Pass" hint left, mic pill centre, "ROEL IT! ✓" hint right. Mic pill: "Voice off" / "Starting mic" / "Listening" (blinking dot) / "Voice offline" / "Voice unavailable" / "Voice paused"; when paused and resumable it becomes a button "Tap to resume voice".
- Invisible tap zones: left 24 % = pass, right 24 % = correct (from 60 px below the top).
- Input: tilt (detector), voice match (correct), tap zones, arrow keys (↓ correct, ↑ pass), Escape (End round confirm).
- Mark → full-bleed flash 650 ms: correct = forest `#2F6B4F` with "ROEL IT!" + the word under it; pass = tomato `#D8452E` with "PASS" + word. Sound + haptic. Next card after the flash; the clock keeps running during the flash.
- Portrait during a round: ink overlay "Turn your phone sideways · Clock's paused until you do." + End round (goes through the confirm).
- End round confirm: scrim + ink card "End this round?", "The clock is paused." (+ "Your video so far gets kept." when recording), **Keep playing** / **End round** (coral/tomato).
- End: buzzer + error haptic, ink "Time!" screen 1.4 s (early end: "Ended" 0.7 s, no buzzer), then Results. Best score recorded (not for early ends).
- Wake lock held for the round (re-acquired on visibility). Backgrounding pauses the round and stops voice; returning resumes (if landscape) and restarts voice quietly.

## Recording (front camera with branded overlay)

- Toggle on Pre-round (and Settings → Game → Record video). Camera + mic via `getUserMedia({ video: { facingMode: 'user', 1280×720, 30 fps }, audio: true })`.
- Each frame drawn on a 1280×720 canvas: camera (rotated upright, cover-fit, true view) + overlay: top-left ink chip with the wordmark; top-right timer chip (ink, tomato in the last 10 s) and score chip (deck colour, "N ROEL'D"); bottom 176 px band in the deck colour with an 8 px progress strip, deck name label and the fitted word (max 2 lines, ≤ 120 px); flash bands (forest "ROEL IT!", tomato "PASS"); countdown ("GET READY" + number); "PAUSED" (ink); end card (ink band, "TIME!" or "ENDED" left, score + "ROEL'D · DECK" right).
- `canvas.captureStream(30)` + mic track → `MediaRecorder` (mp4 preferred, 3 Mbps, 128 kbps audio, 1 s timeslice). Starts with the countdown, finishes after the end card (+900 ms).
- Results shows the clip (video with controls, thumbnail at 1 s) and **Save to Photos** (share sheet → Save Video; download fallback), then "Saved". Note: "Tap Save to Photos, then Save Video. iOS doesn't let web apps save on their own." Leaving unsaved warns once.
- Voice detection is off in recorded rounds.

## Results

- Full-screen, scrolls. Close X (= Change deck). Big score in the display face, deck name (+ " · ended early"), "Roel'd N cards" / "Roel'd 1 card" / "Tough room." for 0, "New best" chip (trophy) only when beating a previous best > 0, else "Best N".
- Clip card when a recording exists (see above).
- Two grouped lists (side by side ≥ 640 px wide): "ROEL'D · N" (check icon rows) and "PASSED · N" (arrow-bend-up-right rows, dimmed). Empty states: "Nothing this time" / "No passes. Respect."
- Fixed bottom bar: **Change deck** (secondary) and **Play again** (primary, counter-clockwise arrow). Play again re-runs the permission prime and goes to Pre-round. Enter/Escape on desktop.

## Decks tab

- Large title "Decks". Group "Yours" (foot: "Make your own, or import a deck file from a mate."): custom deck rows, **New deck** (plus), **Import from file** (download icon; hidden `<input type=file accept=application/json,.json>`).
- Group "Built in": every built-in deck row (colour swatch with icon, name, "N cards" or "Locked · N cards", chevron).
- Built-in row → Preview sheet (tall): hero, **Export** (share sheet with a `.json` file; download fallback) and **Play**, "Lock again" for the locked deck, two-column card list.
- Custom row / New deck → Editor sheet (tall, modal): Cancel / "New deck" or "Edit deck" / Save (disabled until name + ≥ 1 card). Fields: name (max 40), colour swatches (palette names), icon grid (32 curated Phosphor icons), cards textarea (one per line, aliases after a bar: `Spider-Man | Spiderman, Spider Man`), live count, help text. Edit mode adds Export deck and Delete deck ("Tap again to delete", 3.5 s).
- Import validates (clear errors: not JSON, not an object, missing name, name > 40, missing cards, bad card N, bad aliases, no cards, > 1000 cards); unknown colour → `slate`, unknown icon → `cards`, re-import of the same id replaces it; result sheet "Deck imported/updated · N cards. It's on the Play tab now." + **Play it**.

## Settings tab

- **Game**: Round length (segmented 30s/60s/90s/120s), Sound (switch), Haptics (switch, if supported), Record video (switch, if supported; sub "Front camera with the ROEL IT! overlay"), Flip recorded video (switch; "Only if your clips come out upside down").
- **Tilt** (foot: "Less sensitive needs a bigger nod. If tilting down passes, flip it."): Sensitivity (Low/Med/High), Flip tilt direction (switch), Test tilt (→ screen).
- **Voice** (foot explains state or the real iOS reason): Voice detection (switch; sub "Not available here"/"Blocked"), Accent (AU/UK/US), Test voice (→ sheet: say "Kangaroo", live transcript, green "Heard it. Voice works." on match, Start/Stop, error explanation with code).
- **Appearance**: Theme (Auto/Light/Dark).
- **About**: Add to Home Screen (browser only), Version, Diagnostics (sheet: Copy log / Share / log view / Clear log), Reset all data (two-tap, wipes `roelit:*` and reloads).
- Footer: "ROEL IT! · settings, custom decks and scores stay on this phone."

## Test tilt

- Full-screen slate background (`touch-action: manipulation`). Big angle readout (`+23°`), state line ("No sensor yet" / "Would ROEL IT!" / "Would PASS" / "Neutral · ready" / "Back to neutral" / flashes "ROEL IT!"/"PASS" with the screen going forest/tomato for 650 ms and the sound), meter (±90°, neutral band, pass zone tomato, correct zone forest, needle), labels "Up · PASS", "±N° to fire", "Down · ROEL IT!", help copy, a simulate slider (−90..90, springs back to 0), **Calibrate** (or **Enable motion**), **Done**.

## Sounds and haptics

- Web Audio synth only (see `tuned-constants.json` → `sounds`). Unlocked on first tap. Sounds follow the silent switch.
- Haptics: app-wide tap tick (select for tabs/switches/segments), correct/pass/success/error patterns; Android full, iPhone taps only.

## Decks shipped

- 8 built-in decks of 90 cards each + the encrypted inside-joke deck (54 cards, name `SPORRENCESON`, id `the-crew`, colour `ink`, icon `users-three`, description "Inside jokes. If you know, you know."). Counts and hashes in `decks/MANIFEST.md`.

## Tests in the ROEL IT! repo

- Vitest, 65 tests: `match` (normalising, numbers, folding, stemming, fuzzy, word boundaries, compounds, multi-word windows, filler words, aliases, prototype-name words), `tilt` (clean down/up, jitter, spike, hold/wobble double-fire, return-to-neutral, lockout, starts tilted, blocked, sensitivity, both landscape sides end-to-end, iOS vs Android motion sign, shake rejection), `game` (shuffle, no repeats, countdown, flash input lock, pause), `voice` with a fake recogniser (blocked vs paused, instant deaths, healthy restarts, one recogniser at a time, timeout fallback, standalone restart rules, tap to resume, start watchdog), `vault-crypto`, `videoOrientation`.
- Playwright scripts (`reference-tests/e2e/`): taps/sheets, random-tap monkey with health probes, tilt via synthetic `deviceorientation` in both directions, auto-start rules, voice with a scriptable fake recogniser (browser + standalone), passcode (fast typing, wrong/right, remembered, lock again), recording with a fake camera (overlay frames, file size/dimensions, save, unsaved warning, early exit keeps clip), orientation learning/rotation, haptics (Android patterns + iOS switch path), end-round confirm, diagnostics, viewport snap-back.
