# ROEL IT!

Phone on your forehead, mates describe the word, you guess. Tilt down to **ROEL IT!**, tilt up to pass. It also listens, and counts the card when someone says the word.

Static PWA built for iPhone (Add to Home Screen). No backend, no accounts, no analytics. Works offline after the first load.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: matching, tilt state machine, round engine
npm run build    # builds to dist/ and copies the finished site to the repo root
npm run preview  # serve the production build
```

No phone handy? Arrow keys work (↓ = ROEL IT!, ↑ = pass), so do taps on the left/right edge of the play screen, and **Settings → Test tilt** has a simulate slider.

## Hosting

The repo root **is** the built site (`index.html`, `assets/`, `sw.js`, …), so any static host can serve the repo as-is with no build step. Source HTML lives in `src/index.html`.

**After changing code, run `npm run build` and commit the regenerated root files**, or the live site won't change.

## Deploy to GitHub Pages

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (one-off).
2. Push to `main`. `.github/workflows/deploy.yml` tests, builds with `BASE_PATH=/<repo-name>/`, and deploys.
3. It lands at `https://<user>.github.io/<repo-name>/`.

Every deploy ships a new service worker. The app checks for it whenever it comes back to the foreground and shows a "New version ready" toast with Reload, so the home-screen app actually updates.

## Install on iPhone

1. Open the Pages URL in **Safari**.
2. Share → **Add to Home Screen**.
3. Launch it from the home screen. It runs full screen. First visit in Safari shows these steps too.

## Tuning tilt

Open **Settings → Test tilt** on the phone. Hold it sideways on your forehead, screen out, tap **Calibrate**, then tilt.

- Big number = degrees from your neutral pose. Down should go positive and say *ROEL IT!*.
- If down says *PASS*, turn on **Flip tilt direction**.
- **Sensitivity**: Low 45°, Med 38°, High 30°. After a trigger the phone has to come back within 18° of neutral, plus a 700 ms lockout, before it fires again.
- Neutral is re-calibrated during every 3-2-1 countdown, so hold it how you'll play.
- The maths is all in `src/tilt.ts`, commented. It uses `deviceorientation` (sensor-fused, ignores shaking) and falls back to `devicemotion` gravity with the iOS/Android sign flip handled.

## Decks

9 built-in decks in `src/decks/`: 8 general decks (90 cards each) plus **The Crew** (inside jokes), which is passcode-locked. Schema:

```json
{ "id": "animals", "name": "Animals", "color": "forest", "icon": "paw-print",
  "description": "optional", "cards": ["Wombat", { "text": "Spider-Man", "aliases": ["Spiderman"] }] }
```

`color` is a palette name (`tomato mustard forest ocean plum clay teal slate ink`) or `#RRGGBB`. `icon` is one of the keys in `ICON_KEYS` (`src/ui/icons.tsx`). Aliases help voice matching.

Custom decks: Decks → New deck. Cards are one per line, aliases after a bar: `Spider-Man | Spiderman, Spider Man`. Export shares the JSON via the iOS share sheet so you can move decks between phones.

## Known iOS limits

- **Voice in home-screen apps is flaky.** iOS has a history of blocking `SpeechRecognition` in standalone PWAs (`service-not-allowed`) or re-asking for permission. If it fails, tilt keeps working, the mic pill says *Voice unavailable*, and Settings explains it. Opening the game in Safari instead usually fixes it. Use **Settings → Test voice** to check.
- Voice uses Apple's recogniser and may need a connection. It's not on-device-only.
- **Haptics on iPhone come from taps only.** iOS Safari has no vibration API; the app uses the native switch's system tick (iOS 18+), which iOS only plays inside a tap. So tilts and voice matches don't buzz on iPhone (they do on Android: two crisp pulses for ROEL IT!, one long thud for pass). Reportedly from iOS 26.5 Apple also blocks multi-tick patterns, so on newer iPhones every tap haptic is one tick. Settings → Game → Haptics turns them off.
- **No orientation lock.** iOS ignores the manifest and `screen.orientation.lock()`. Rotating to portrait mid-round shows "Turn your phone sideways" and pauses the clock.
- Motion permission: iOS asks once (needs a tap). If you said no, Settings → Apps → Safari → Motion & Orientation Access. A home-screen app may need deleting and re-adding to ask again.
- With the mic live, iOS can route sound quieter. Sounds are short to keep it sane.
- In the home-screen app, iOS may re-ask for the mic on every recogniser start. So voice only restarts by itself when the last start came back instantly (no prompt). Otherwise the mic pill says **Tap to resume voice**, so a permission prompt never appears out of nowhere mid-game.

## Recording rounds

Toggle **Record video** on the get-ready screen (or Settings → Game). The front camera films the room, which is the side the screen faces, and the clip gets a burned-in ROEL IT! overlay: the mark, timer, score, the current word in the deck's colour band, green/orange flashes, countdown, and a "Time!" end card. 1280×720 MP4 at 30fps, with sound.

- **Saving:** iOS doesn't let web apps write to Photos on their own; there's no permission for it. The results screen has **Save to Photos**, which opens the share sheet; tap **Save Video**. Leaving without saving asks twice so a good clip isn't lost by accident.
- **Voice detection is off during recorded rounds.** The mic goes to the video, and sharing it with the speech recogniser is the kind of iOS conflict that caused freezes. Tilt and taps still score.
- Ending a round early asks first (**End this round?**, clock paused). The clip is kept and goes to the results screen like a full round; an early end doesn't count towards your best. A REC dot shows on the play screen while recording.
- Code: `src/camera.ts` (stream), `src/recorder.ts` (overlay drawing + MediaRecorder).

## Diagnostics

**Settings → Diagnostics** shows a rolling on-device log (taps that didn't land, main-thread stalls, voice and motion events, errors, screens), including the previous session, so it survives a force-quit. Copy or share it when something misbehaves. It never contains codes or card names. Code: `src/debug.ts`.

## Decisions

- **Preact + signals**: tiny, no UI kit. Hand-rolled iOS controls (sheets, segmented, switches).
- **Anton** for the big card word and deck names. System font (SF Pro) for UI.
- **Phosphor Icons, bold weight**, bundled as SVG strings.
- **Status bar**: `default` style + `theme-color` per screen (paper, near-black in dark, deck colour on game screens). `black-translucent` would force white status text, which disappears on the paper background.
- Sounds are synthesised with Web Audio (no audio files). The app leaves the iOS audio session alone: switching it mid-game was a freeze risk and paused people's music. So sounds follow the silent switch, and music keeps playing.
- Card order is shuffled per deck and persisted, so you won't see repeats across rounds until the deck runs out.
- `start_url`/`scope` are relative (`./`), so the manifest works on any Pages subpath.
- **The Crew is locked.** Its cards are AES-GCM encrypted (key from the code via PBKDF2, 600k rounds) in `src/decks/the-crew.locked.json`, so the repo and live site only hold scrambled data. The code isn't stored anywhere in the repo. Enter it once and the phone remembers it; **Decks → The Crew → Lock again** forgets it. The keypad length follows the code (`codeLength` in the locked file; length only, never the code). A short numeric code can still be brute-forced offline by someone determined; longer is better.
- App icon: flat card-on-head mark drawn in `scripts/icon.svg`, rendered to PNG with resvg.

## Editing The Crew

```bash
node scripts/crew.mjs unlock <code> > crew.json        # decrypt to edit (don't commit crew.json)
node scripts/crew.mjs lock crew.json <code>            # re-encrypt (4-12 digits) into src/decks/the-crew.locked.json
npm run build                                          # then commit the result
```

## Structure

```
src/
  tilt.ts  match.ts  game.ts  voice.ts  audio.ts  storage.ts  wakelock.ts
  state.ts  deck.ts  palette.ts  strings.ts
  decks/        built-in deck JSON
  ui/           screens and controls
public/icons/   generated PNG icons
scripts/        icon source + generator
```
