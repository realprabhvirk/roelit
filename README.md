# ROEL IT!

Phone on your forehead, mates describe the word, you guess. Tilt down to **ROEL IT!**, tilt up to pass. It also listens, and counts the card when someone says the word.

Static PWA built for iPhone (Add to Home Screen). No backend, no accounts, no analytics. Works offline after the first load.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest: matching, tilt state machine, round engine
npm run build    # outputs dist/
npm run preview  # serve the production build
```

No phone handy? Arrow keys work (↓ = ROEL IT!, ↑ = pass), so do taps on the left/right edge of the play screen, and **Settings → Test tilt** has a simulate slider.

## Deploy to GitHub Pages

1. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions** (one-off).
2. Push to `main`. `.github/workflows/deploy.yml` tests, builds with `BASE_PATH=/<repo-name>/`, and deploys.
3. It lands at `https://<user>.github.io/<repo-name>/`.

Every deploy ships a new service worker. The app checks for it whenever it comes back to the foreground and shows a "New version ready" toast with Reload, so the home-screen app actually updates.

## Deploy to Cloudflare Pages

Workers & Pages → Create → Pages → connect the repo, then:

- Framework preset: **None** (or Vite)
- Build command: **`npm run build`**
- Build output directory: **`dist`**
- Node: picked up from `.node-version` (22). Vite 7 needs 20.19+.

Leave `BASE_PATH` unset: Cloudflare serves from the domain root. If you see a blank screen, the build didn't run and Pages is serving the raw source.

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

9 built-in decks in `src/decks/`: 8 general decks (90 cards each) plus **The Crew** (inside jokes). Schema:

```json
{ "id": "animals", "name": "Animals", "color": "forest", "icon": "paw-print",
  "description": "optional", "cards": ["Wombat", { "text": "Spider-Man", "aliases": ["Spiderman"] }] }
```

`color` is a palette name (`tomato mustard forest ocean plum clay teal slate ink`) or `#RRGGBB`. `icon` is one of the keys in `ICON_KEYS` (`src/ui/icons.tsx`). Aliases help voice matching.

Custom decks: Decks → New deck. Cards are one per line, aliases after a bar: `Spider-Man | Spiderman, Spider Man`. Export shares the JSON via the iOS share sheet so you can move decks between phones.

## Known iOS limits

- **Voice in home-screen apps is flaky.** iOS has a history of blocking `SpeechRecognition` in standalone PWAs (`service-not-allowed`) or re-asking for permission. If it fails, tilt keeps working, the mic pill says *Voice unavailable*, and Settings explains it. Opening the game in Safari instead usually fixes it. Use **Settings → Test voice** to check.
- Voice uses Apple's recogniser and may need a connection. It's not on-device-only.
- **No haptics.** iOS Safari has no `navigator.vibrate`. Feedback is the full-screen colour flash + sound.
- **No orientation lock.** iOS ignores the manifest and `screen.orientation.lock()`. Rotating to portrait mid-round shows "Turn your phone sideways" and pauses the clock.
- Motion permission: iOS asks once (needs a tap). If you said no, Settings → Apps → Safari → Motion & Orientation Access. A home-screen app may need deleting and re-adding to ask again.
- With the mic live, iOS can route sound quieter. Sounds are short to keep it sane.

## Decisions

- **Preact + signals**: tiny, no UI kit. Hand-rolled iOS controls (sheets, segmented, switches).
- **Anton** for the big card word and deck names. System font (SF Pro) for UI.
- **Phosphor Icons, bold weight**, bundled as SVG strings.
- **Status bar**: `default` style + `theme-color` per screen (paper, near-black in dark, deck colour on game screens). `black-translucent` would force white status text, which disappears on the paper background.
- Sounds are synthesised with Web Audio (no audio files). On iOS 16.4+ the audio session is set to `playback` when the mic is off so sounds play through the silent switch.
- Card order is shuffled per deck and persisted, so you won't see repeats across rounds until the deck runs out.
- `start_url`/`scope` are relative (`./`), so the manifest works on any Pages subpath.
- The Crew ships as a built-in deck (public in the build and the repo).
- App icon: flat card-on-head mark drawn in `scripts/icon.svg`, rendered to PNG with resvg.

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
