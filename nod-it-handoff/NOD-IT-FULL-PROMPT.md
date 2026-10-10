# NOD IT! — build prompt for Codex

You are rebuilding a working party-game PWA from scratch under a new name and a new look. The game logic is already proven: it shipped as **ROEL IT!** and was tuned on real iPhones. Your job is to rebuild it **with the same behaviour** and a **completely new visual identity**. Don't reinvent anything you aren't told to. Read this whole file before you write code.

Everything you need is in the `handoff/` folder (copy of `nod-it-handoff/` from the ROEL IT! repo). If this prompt and a handoff file disagree, this prompt wins. If a handoff file and `ORIGINAL-BRIEF-v1.md` disagree, the handoff file wins (the v1 brief is history: it describes what was asked for, not what shipped).

| File in `handoff/` | What it is | How to use it |
|---|---|---|
| `NOD-IT-FULL-PROMPT.md` | This file | The spec |
| `ROEL-IT-FEATURE-INVENTORY.md` | Screen-by-screen audit of the shipped app | Parity checklist. Every bullet must exist in NOD IT! (renamed and re-skinned) unless this prompt says otherwise |
| `tuned-constants.json` | Every tuned number | Use the values exactly. Changing one needs a test that proves it and a line in `DECISIONS.md` |
| `LESSONS-LEARNED.md` | 47 real bugs, each with its fix and a rule | Do-not-regress list. Every rule must hold |
| `decks/*.json` + `decks/MANIFEST.md` | The deck content, byte for byte | Import verbatim. **Never write, rewrite, reorder or "improve" cards** |
| `reference-src/` | ROEL IT! source for the hard modules, with their tests | Port these. Logic stays identical, only names/strings/colours change |
| `reference-tests/e2e/` | Playwright scripts used to test ROEL IT! | Port them to `tests/e2e/` against the new selectors |
| `ORIGINAL-BRIEF-v1.md` | The first prompt ROEL IT! came from | Background only |
| `scripts/` | Tools that built and check this handoff | Not needed for the app. Leave in `handoff/` |

---

## 1. Mission and non-negotiables

Build **NOD IT!**, a Heads Up-style party game as a static, installable PWA. One person holds the phone on their forehead in landscape, a word shows, their mates describe it. Tilt down = correct ("NOD IT!"), tilt up = pass. The mic can also mark it correct when someone says the word.

Non-negotiables:

1. **Static only.** No backend, no database, no login, no accounts, no analytics, no external requests at runtime. All state in `localStorage`, every access in try/catch.
2. **Deploys to GitHub Pages under a sub-path** (`https://<user>.github.io/<repo>/`). Every URL is relative or uses Vite `base`. Manifest `id`, `start_url` and `scope` are `./`. It must also work served from a domain root.
3. **Offline after first load.** Service worker precaches the app shell, fonts, icons and decks.
4. **iOS home-screen PWA is the primary target** (iPhone, Safari, standalone mode). Android Chrome and desktop browsers must work too (desktop with keyboard/tap fallbacks).
5. **No CDN at runtime.** Fonts and icons are bundled.
6. **Stack:** Vite 7 + TypeScript (strict) + Preact 10 + `@preact/signals` + `vite-plugin-pwa`. Vitest for unit tests, Playwright for e2e. Keep dependencies tiny. No UI kit, no CSS framework.
7. **Don't ask questions.** Decide, write it down in `DECISIONS.md` (date, decision, why, alternatives), move on.

## 2. Name and branding

- The app is **NOD IT!**: always caps, always with the exclamation mark. `name` and `short_name` in the manifest are `NOD IT!`. `apple-mobile-web-app-title` is `NOD IT!`.
- A correct guess is **"NOD IT!"** everywhere (flash, hints, test tilt, recording overlay). Never "Correct". Past tense in results is **"Nod'd"** (lists: "NOD'D · N", summary: "Nod'd 5 cards" / "Nod'd 1 card", overlay chip: "N NOD'D"). Pass stays **PASS** / **Passed**.
- All of these live in one file, `src/strings.ts`, the same way `reference-src` does it. No user-facing app name or action label anywhere else.
- Rename everything else too: `localStorage` prefix `nodit:`, haptic kind `roel` → `nod`, package name `nodit`, file names, CSS classes, comments, test names, log lines. Rename the inside-joke deck constant `CREW_*` → `SPORRENCESON_*`, but keep its deck **id** as `the-crew` (see §8).
- **Zero leftover ROEL strings.** `grep -riE "roel|roe'?l'?d" --exclude-dir=handoff --exclude-dir=node_modules .` must return nothing. Put that grep in CI (§10).
- Don't use the name "Heads Up", Ellen/Warner Bros branding, their deck names, colours or art.

## 3. Feature spec (parity with ROEL IT! v1.4.1)

`ROEL-IT-FEATURE-INVENTORY.md` is the detailed spec, down to the copy. Build every item in it. The summary below is the minimum and tells you where NOD IT! differs.

**Shell.** Three tabs (Play, Decks, Settings) in a bottom tab bar with safe-area padding, horizontal in short landscape. Each tab has its own scroll with a large title that collapses into a sticky compact nav bar after 36 px. Full-screen flows sit above the tabs (Pre-round, Round, Results, Test tilt), with the tab shell kept mounted. Bottom sheets portal to `<body>` and support drag-to-dismiss, scrim tap and a tall variant. The first Safari visit on an iPhone shows the install help sheet. A "New version ready · Reload" toast, an error boundary, viewport snap-back, an app-wide tap haptic and an on-device diagnostics log are all included.

**Play tab.** Wordmark title, a one-line lede, then a masonry grid of solid-colour deck tiles (2 columns in portrait, 4 in wide landscape, heights from the tile rhythm in `tuned-constants.json` → `layout`). Tapping a tile opens the Deck sheet (hero, round-length segmented control, Start). Tapping the locked deck opens the passcode sheet first.

**Passcode lock.** The SPORRENCESON deck ships encrypted and opens with a numeric code on a keypad (§8). Keys act on pointerdown. A wrong code shakes the dots, plays a sound and fires a haptic. The right code opens the deck, and the code is remembered on the device. "Lock again" forgets the code and the saved deal order.

**Pre-round.** A full-bleed deck colour screen with a motion permission step (iOS), a mic step (voice on, never asked, not recording), and a ready step. The ready step has the illustration or live camera preview, the status line, the Record video toggle and Start. Auto-start follows `autoStart` exactly: 2.5 s grace on open, a tap pauses it for 3 s and disarms it, it arms only after the phone has been seen not-upright, then it needs 1 s held upright with a progress bar. Permission prime happens inside the Start tap, and never fires two prompts at once.

**Round.** Landscape design in full-bleed deck colour, with:
- Progress bar, end-round X, score, REC dot and a big `m:ss` timer.
- 3-2-1 countdown with calibration.
- The fitted word.
- Bottom hints and the mic pill.

Inputs are tilt, voice (correct only), left and right 24 % tap zones, arrow keys and Escape. A mark gives a 650 ms full-bleed flash with the label and the word, plus sound and haptic, and the clock keeps running during the flash. Portrait shows an overlay and pauses the clock. Ending early goes through a confirm that pauses the clock. Time-up gives a buzzer and the "Time!" screen for 1.4 s; an early end shows "Ended" for 0.7 s and doesn't count toward best. A wake lock is held during the round. Backgrounding pauses the round and stops voice.

**Recording.** This is optional, toggled on Pre-round or in Settings. Front camera and mic are drawn to a 1280×720 canvas with the branded overlay, then saved through `MediaRecorder`. It starts with the countdown and ends after the end card. Results shows the clip and a **Save to Photos** button, which uses the share sheet with a download fallback. Leaving without saving warns once. Voice is off while recording.

The overlay is re-skinned in the NOD IT! design system: same layout and information, new colours and display face. Video orientation learning and Flip recorded video are ported as-is from `reference-src/videoOrientation.ts`.

**Results.** Shows:
- Big score.
- Deck name (plus " · ended early" if it ended early).
- Summary line.
- "New best" chip, shown only when beating a previous best above 0.
- Clip card.
- Two lists: Nod'd and Passed.
- Bottom bar with Change deck and Play again.

**Decks tab.** Has:
- Your custom decks, plus New deck and Import from file.
- Built-in decks, each opening a preview sheet with Export, Play and the card list. The locked deck also gets Lock again.
- Editor sheet with name, colour swatches, icon grid, cards textarea and live count, using the `Text | alias, alias` syntax. Export and two-tap delete appear in edit mode.
- Import with the exact validation errors listed in the inventory.

**Settings tab.** Sections:
- **Game:** round length, sound, haptics, record video, flip recorded video.
- **Tilt:** sensitivity, flip tilt direction, Test tilt.
- **Voice:** voice detection, accent AU/UK/US, Test voice.
- **Appearance:** theme Auto/Light/Dark.
- **About:** Add to Home Screen, version + build stamp, Diagnostics, two-tap Reset all data.
- Footer line.

**Test tilt.** Full-screen live angle readout, state line, meter with zones, simulate slider, Calibrate / Enable motion and Done.

**Sounds and haptics.** Web Audio synth only, values in `tuned-constants.json` → `sounds`. Haptics follow `reference-src/haptics.ts`: full patterns on Android, and on iOS a single tick inside a real tap.

### Things you must NOT change

- The tilt maths and state machine (`reference-src/tilt.ts`): down-vector, pitch formula, filter, thresholds, hysteresis, lockout, hold, calibration, sensor ref-counting.
- The matcher (`reference-src/match.ts`) and voice wrapper (`reference-src/voice.ts`), including the one-recogniser gate, restart and backoff rules, standalone restart rule, start watchdog, and the blocked-vs-paused states.
- The vault crypto (`reference-src/vault-crypto.ts`). The same locked file must open with the same code.
- The card queue (no repeats until exhausted, persisted order, no same card across reshuffle).
- The deck JSON schema and validator behaviour (§8).
- Every rule in `LESSONS-LEARNED.md`.

### Things that change

- Name, strings and storage prefix (§2).
- The entire visual design (§6).
- The app icon and brand assets (§7).
- Deck colour keys map to the new palette (§6.3). Old keys must still be accepted.
- New, opt-in features behind Labs (§9).

## 4. Tuned constants (use exactly)

Full list with sources: `handoff/tuned-constants.json`. Headline values:

| Area | Constant | Value |
|---|---|---|
| Defaults | round length / choices | 60 s / 30, 60, 90, 120 |
| Defaults | sensitivity, voice, sound, haptics, theme, record | medium, on, on, on, system, off |
| Defaults | voice language / choices | en-AU / en-AU, en-GB, en-US |
| Tilt | threshold low / medium / high | 45° / 38° / 30° |
| Tilt | neutral band to re-arm | ±18° |
| Tilt | lockout after a trigger | 700 ms |
| Tilt | must stay past threshold | 60 ms |
| Tilt | low-pass τ (orientation / motion) | 60 ms / 110 ms, dt clamp 200 ms |
| Tilt | prefer `deviceorientation` if seen within | 400 ms |
| Tilt | motion sample accepted if \|g\| in | 0.75–1.25 g |
| Tilt | "upright" when \|down.x\| > | 0.8 |
| Tilt | baseline clamp | ±25° |
| Tilt | detector starts | disarmed (must pass through neutral first) |
| Auto-start | grace / tap pause / hold | 2500 / 3000 / 1000 ms |
| Round | countdown | 3-2-1, 1000 ms steps |
| Round | flash | 650 ms |
| Round | engine tick | 50 ms |
| Round | hurry (pulse + tick sound) | last 10 s |
| Round | "Time!" / "Ended" screen | 1400 / 700 ms |
| Voice | continuous, interim, maxAlternatives | true, true, 3 |
| Voice | words considered / debounce after card change | 12 / 800 ms |
| Voice | restart backoff | 250 ms base, doubles if session < 1 s, max 4000 ms, network error ≥ 2000 ms |
| Voice | give up after instant deaths | 4 |
| Voice | start confirm timeout / wait for previous recogniser | 5000 / 1500 ms |
| Match | Levenshtein | ≤ 1 edit if target ≥ 5 letters and heard ≥ 4; exact if target ≤ 2; numbers exact |
| Match | multi-word window | max(6, tokens + 3) words |
| Word fit | line height / max lines / usable width | 0.95 / 3 / 93 % |
| Sheet | transition / drag dismiss | 420 ms / 30 % of height or 40 px at 0.6 px/ms |
| Motion | spring ease / ease-out | `cubic-bezier(0.2, 0.8, 0.2, 1)` / `cubic-bezier(0.16, 1, 0.3, 1)` |
| Motion | press | scale 0.97, opacity 0.86, release 260 ms |
| Recording | canvas / fps / video bitrate / audio bitrate / timeslice | 1280×720 / 30 / 3 Mbps / 128 kbps / 1000 ms |
| Recording | mime preference | mp4 avc1 → mp4 → webm vp9 → vp8 → webm |
| Vault | KDF / cipher | PBKDF2-SHA256 600 000 iterations, 16 B salt / AES-GCM 256, 12 B IV |
| Vault | check timeout | 10 s |
| Diagnostics | log lines / stall heartbeat / stall report | 400 / 500 ms / late by 1200 ms |
| PWA | register / update checks | `prompt` / on every return to visible (online) + every 30 min |
| PWA | status bar style | `default` (see LESSONS #45) |
| Layout | tap zone width / min tap target / gutter | 24 % / 44 pt / 16 px |
| Colour | text on a fill | relative luminance > 0.33 → dark text, else light |

## 5. Do-not-regress list

All 47 items in `LESSONS-LEARNED.md` are binding. The ones that bite hardest:

1. Never `preventDefault` on `touchend` to stop zoom (it swallows quick second taps). Use `touch-action` and `gesturestart` instead.
2. A closed or closing sheet root has `pointer-events: none`. Sheets portal to `<body>`. Cancel every `requestAnimationFrame` you start.
3. The window must never stay scrolled. Snap back to 0,0 on `scroll`, `resize`, `visualViewport` resize, `focusout` and `orientationchange` (`reference-src/main.tsx`).
4. Any document-level `touchmove` blocker is removed in a `finally`.
5. Passcode and any fast-tapped keypad act on `pointerdown`. Read state from a ref, not the last render.
6. Error boundary around the app.
7. Tilt uses the down-vector, not raw Euler angles. The side comes from the vector, not `screen.orientation`. Handle the iOS-vs-Android accelerometer sign.
8. Sensors are ref-counted (acquire/release). No listeners outside rounds, Pre-round and Test tilt.
9. Never fire two permission prompts at once. Motion permission is requested only inside a tap.
10. Only one `SpeechRecognition` exists at a time. In standalone, auto-restart only if mic permission is known granted or the last start reached `onstart` fast. "Blocked" is never persisted.
11. Match lookups use own-property checks (`'constructor' in {}` is true).
12. Clear the voice buffer on every card change, and debounce for 800 ms.
13. Never touch `navigator.audioSession`.
14. Clear the "Time!" → results timer on unmount.
15. Ending early keeps the video. An early end doesn't count toward best.
16. Keep the recorder's hidden `<video>` and `<canvas>` in the DOM (2 px, opacity 0.01). Draw a frame before `start()`.
17. Saving goes through the share sheet only. Never promise a silent save to Photos.
18. The Decks tab renders the live deck list, so an unlock shows up there at once.
19. Relocking removes `queue:the-crew`, because it holds card text.
20. An imported deck can't take a built-in id.
21. Status bar style is `default`, not `black-translucent`.
22. Fit words with canvas `measureText` and never break inside a word. Re-fit after `document.fonts.ready`. With a new display face, re-check the fit on the longest cards in every deck (`MANIFEST.md` lists the decks; write a test that renders the 20 longest cards).

## 6. Design system

The ROEL IT! look (warm paper, Anton, muted earth palette) is retired. NOD IT! gets a cooler, brighter, confident identity. It still has to read as hand-designed and iOS-native.

### 6.1 Rules (unchanged and non-negotiable)

- **Banned:**
  - neon, glow, glassmorphism, blur blobs
  - gradients as style, gradient text
  - "galaxy/cyber/aurora" vibes, drop-shadow glows
  - emoji as icons, sparkle icons
  - AI-generated icons, illustrations or UI art
  - generic centred-hero layouts, rounded-everything card soup, identical purple primary buttons
  - lorem ipsum, marketing copy
- **Flat solid colour fields.** Each deck is a big solid colour.
- **iOS-native feel:**
  - large titles, inset grouped lists, bottom sheets, segmented controls, iOS-style switches
  - 44 pt targets, safe areas everywhere, `viewport-fit=cover`
  - spring easing, instant press states
  - no tap highlight, no hover-only states, `overscroll-behavior: none`
  - respect `prefers-reduced-motion`
- **Copy:** short, dry, Aussie. No exclamation-mark spam (the app name is the exception).
- **Icons:** Phosphor, **bold weight only**, bundled as raw SVG (port `reference-src`'s approach). Same 32 deck icon keys as ROEL IT! so imported decks keep their icons: `cards, paw-print, film-slate, microphone-stage, fork-knife, person-simple-run, map-trifold, storefront, hard-hat, users-three, beer-bottle, house, car, soccer-ball, music-notes, game-controller, airplane, heart, lightning, globe, book-open, pizza, briefcase, star, flag, tree-palm, waves, coffee, television, guitar, ghost, rocket`.

### 6.2 Palette

Core (fixed):

| Token | Hex | Role |
|---|---|---|
| `ink` | `#0F1B2D` | Text on light, dark-mode base, ink surfaces (overlays, "Time!") |
| `cobalt` | `#2748E8` | Accent: active tab, links, primary buttons, focus |
| `sky` | `#7FB2F0` | Secondary accent, dark-mode accent |
| `butter` | `#F4D35E` | Highlight: "New best" chip, timer hurry state |
| `coral` | `#F26A5B` | **PASS flash**, destructive actions, REC dot |
| `mint` | `#34B58A` | Success text/icons (e.g. "Heard it", "Saved") |
| `lilac` | `#9C8CF0` | Deck colour, decoration |
| `cloud` | `#F4F5F7` | Light-mode background |
| `slate` | `#5B6677` | Secondary text, Test tilt background |

Derived tokens you must define and document (exact values are yours to tune by eye, then lock in `design/tokens`):

- `nod` (the **NOD IT! flash**): a deep mint around `#1E8E68`. It must be clearly a "go" green and clearly different from `coral`, and white text on it must pass 4.5:1.
- Light surfaces: `bg = cloud`, `surface = #FFFFFF`, `separator`, `fill-secondary`, `label`, `label-secondary = slate`, `label-tertiary`.
- Dark mode: designed, not inverted. `bg` is a deep navy-ink (around `#0A1220`), `surface` one step up (around `#152238`), `label` near-cloud, accent `sky`. Ink deck tiles get a 1 px inset hairline in dark mode.
- On-colour text: luminance > 0.33 → `ink`, else white. Keep the `onColor()` rule.

### 6.3 Deck colours and backwards compatibility

Deck files reference colours by **key** (or `#RRGGBB`). ROEL IT! keys must keep working, because built-in decks and user exports use them. Map every old key to a NOD IT! colour:

| Old key (in JSON) | NOD IT! token | Suggested hex | Used by |
|---|---|---|---|
| `tomato` | `apricot` | `#F59E45` | Act It Out |
| `mustard` | `butter` | `#F4D35E` | Food & Drink |
| `forest` | `pine` | `#24735A` | Animals |
| `ocean` | `cobalt` | `#2748E8` | Famous People |
| `plum` | `lilac` | `#9C8CF0` | Movies & TV |
| `clay` | `berry` | `#B04A7A` | Around Australia |
| `teal` | `lagoon` | `#1F8A93` | Jobs & Trades |
| `slate` | `slate` | `#5B6677` | Brands & Apps |
| `ink` | `ink` | `#0F1B2D` | SPORRENCESON |

Rules:

- `resolveColor(key)` accepts old keys, new token names and `#RRGGBB`. Unknown values fall back to `slate` (same as ROEL IT!).
- Never edit the deck JSON to use new keys. The mapping lives in code (`src/palette.ts`).
- The custom-deck colour picker shows the NOD IT! swatches and saves new token names. A NOD IT! export that ROEL IT! imports falls back to slate there. That's fine and expected; note it in `DECISIONS.md`.
- No two built-in decks share a colour.
- No deck colour can be confused with a flash. Write `scripts/check-colours.mjs`: CIEDE2000 ΔE between every deck colour and `nod`/`coral` must be ≥ 12, and between built-in deck colours ≥ 10. Run it in CI. If a suggested hex fails, tune it and log the change.

### 6.4 Type

- **UI:** system stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`).
- **Display face** (wordmark, deck names, card word, countdown, score, flashes): pick **one** new heavy display face, self-hosted with `@fontsource`. Not Anton, not Barlow Condensed, and not Inter, Space Grotesk or Poppins. It must:
  - read from 2 m away when uppercase
  - stay legible on multi-word cards at 3 lines
  - have a latin subset under ~60 KB in woff2
  - have tabular digits, or fall back to the system font for the timer

  Candidates: Bricolage Grotesque 800, Unbounded 800, Archivo Black, Familjen Grotesk 700. Render the 20 longest cards in each finalist at 844×390 and 390×844, look at the screenshots, choose one and log why in `DECISIONS.md`.
- Re-tune word-fit only if the new face measures very differently. Keep the algorithm.

### 6.5 Tokens

Put the design tokens in `design/tokens/`:

- `tokens.json`: source of truth (colour, dark overrides, deck map, radius, spacing, type scale, motion, z-index).
- `tokens.css`: generated CSS custom properties, with `:root` light, `@media (prefers-color-scheme: dark)` and `[data-theme=light|dark]` overrides.
- `tokens.ts`: generated typed exports used by `src/palette.ts`.
- `README.md`: what each token is for.

`npm run tokens` regenerates the CSS and TS files from the JSON. CI fails if the generated files are stale.

Theme colour (`<meta name="theme-color">`) follows the screen: `bg` on tabs, the deck colour on Pre-round and Round, `ink` on overlays. ROEL IT! does this; port it.

### 6.6 Look and feel targets

- The Play tab should feel like a stack of bold colour cards, not a template grid. Keep the masonry rhythm, and pick a tile radius and spacing that suit the new face.
- The Round screen is one giant word on one flat colour. Nothing else competes with it.
- Flashes are full-bleed `nod` / `coral` with the label in the display face and the word under it.
- Sheets, lists and switches should sit next to native iOS 18 apps without looking off.
- Light and dark both get their own screenshots and review (§11).

## 7. Brand assets (ChatGPT image generation pipeline)

The owner will generate the brand artwork in ChatGPT (image generation) and drop the results into the repo. You set up the pipeline, the prompts and a vector fallback so the app ships before any art exists.

The general "no AI art" rule still applies to UI icons (always Phosphor) and to anything that looks generated. The **app icon and brand mark** may come from ChatGPT only if they meet `ART-DIRECTION.md`: flat, solid colours, geometric, no gradients, glow or texture. When in doubt, use the SVG.

Create:

1. **`design/ART-DIRECTION.md`**. Contents:
   - The mark: a simple flat head-on-card or nodding-arrow motif.
   - Palette tokens allowed in art (§6.2).
   - Banned list (§6.1).
   - Composition rules (centred mark, 10 % safe margin, maskable safe zone = central 80 % circle).
   - Backgrounds per asset.
   - Do/don't examples described in words.
2. **`design/ASSET_PROMPTS.md`**. One copy-paste ChatGPT prompt per asset, each with:
   - exact size
   - background colour hex
   - "flat vector style, solid fills, no gradients, no shadows, no texture, no text unless stated"
   - the output file name

   Assets:
   - app icon master 1024×1024
   - maskable icon master 1024×1024 with the mark inside the safe zone
   - monochrome/favicon mark
   - iOS splash/launch background colour (no image)
   - social/OG card 1200×630 (wordmark + mark)
   - optional empty-state spot illustration, flat, 2–3 colours

   Each prompt should be usable on its own.
3. **`design/source/`**. Where the owner drops the ChatGPT PNGs, plus `design/source/icon.svg`: your own hand-built SVG mark using the palette, which is the default.
4. **`scripts/gen-icons.mjs`** (port `reference-src/scripts/gen-icons.mjs`). Behaviour:
   - If `design/source/app-icon-1024.png` exists, it's the master; otherwise render `icon.svg` with `@resvg/resvg-js`.
   - Output to `public/icons/`: `apple-touch-icon.png` 180, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (art scaled to fit the safe zone, from `maskable-1024.png` if present), `favicon-32.png`, `favicon.svg`.
   - Use `sharp` or resvg for resizing.
   - Flatten every PNG with no alpha on the apple-touch-icon.
5. **`npm run icons`** runs it. Commit the generated icons.

Check every icon at real size in a screenshot of a fake home screen (60×60 and 180×180) before you call it done.

## 8. Deck data

### 8.1 Import, don't write

Copy `handoff/decks/*.json` to `src/decks/` **byte for byte**. The only exception is that `sporrenceson.json` (plaintext) is **never** bundled (see 8.3).

| File | Name | id | Colour key | Icon | Cards |
|---|---|---|---|---|---|
| `animals.json` | Animals | `animals` | forest | paw-print | 90 |
| `movies-tv.json` | Movies & TV | `movies-tv` | plum | film-slate | 90 |
| `famous-people.json` | Famous People | `famous-people` | ocean | microphone-stage | 90 |
| `food-drink.json` | Food & Drink | `food-drink` | mustard | fork-knife | 90 |
| `act-it-out.json` | Act It Out | `act-it-out` | tomato | person-simple-run | 90 |
| `around-australia.json` | Around Australia | `around-australia` | clay | map-trifold | 90 |
| `brands-apps.json` | Brands & Apps | `brands-apps` | slate | storefront | 90 |
| `jobs-trades.json` | Jobs & Trades | `jobs-trades` | teal | hard-hat | 90 |
| `sporrenceson.locked.json` | SPORRENCESON | `the-crew` | ink | users-three | 54 (encrypted) |

Built-in order on the Play tab and in Decks is the order above.

- **Never** add, remove, reorder, reword, re-case or "fix" a card, alias, name, description, id, colour key or icon key.
- `npm test` includes a test that hashes every `src/decks/*.json` and compares it with the SHA-256 in `handoff/decks/MANIFEST.md`.
- Never ask a model (including yourself) to generate cards. New content is the owner's job.

### 8.2 Schema (must stay backwards-compatible)

```ts
type Card = string | { text: string; aliases?: string[] };
type Deck = {
  id: string;          // slug; built-in ids are fixed
  name: string;        // ≤ 40 chars
  color: string;       // palette key (old ROEL IT! key, new NOD IT! token) or #RRGGBB
  icon: string;        // one of the 32 deck icon keys
  description?: string; // ≤ 140 chars
  cards: Card[];       // 1..1000
};
// Locked file:
type LockedDeck = Omit<Deck, 'cards'> & {
  count: number; codeLength: number;
  sealed: { v: 1; iter: number; salt: string; iv: string; data: string }; // base64
};
```

Port `reference-src/deck.ts` and its `validateDeck` exactly (same error copy, same fallbacks: unknown colour → `slate`, unknown icon → `cards`, id slugged from name, aliases trimmed, internal flags stripped on export). A deck exported from ROEL IT! must import into NOD IT! unchanged, and a NOD IT! export must import into ROEL IT!. Add a test with a real ROEL IT! export fixture (use `handoff/decks/animals.json`).

### 8.3 SPORRENCESON (the inside-joke deck)

ROEL IT! ships this deck **bundled, encrypted and passcode-locked**. NOD IT! does the same:

- Bundle `sporrenceson.locked.json` verbatim. Its metadata (name, id `the-crew`, colour, icon, description, count 54, codeLength) shows on the tile. The cards decrypt only with the code.
- The code is **not** in this handoff and must never be committed, logged, put in tests or written to `DECISIONS.md`. The owner knows it. The same code that unlocks ROEL IT! unlocks this file.
- Tests that need the code read it from `process.env.SPORRENCESON_CODE` and skip when it's unset (`reference-tests` use `CREW_CODE`; rename it).
- `handoff/decks/sporrenceson.json` is the plaintext, for reference only (and for the hash check against the list below). Never import it from app code. Add a build check: `dist/` must not contain any card text from it (grep the built JS for the 10 longest cards).
- Port `reference-src/scripts/crew.mjs` as `scripts/sporrenceson.mjs` (lock/unlock, 4–12 digit code, writes `src/decks/sporrenceson.locked.json`). Re-locking makes a new salt and IV, which is fine, but the shipped file stays the handoff copy unless the owner re-locks it.
- Keep the deck id `the-crew` so remembered state and exports stay compatible. The storage keys move to the `nodit:` prefix, which means NOD IT! starts fresh. That's expected.

The plaintext list is reproduced in Appendix A, generated from the JSON by script. If they ever differ, the JSON wins.

## 9. Expansion backlog (Labs)

Add **Settings → Labs** with a master switch (off by default) and one switch per experiment. Everything in Labs is off by default, opt-in, and must not change behaviour when off. Ship parity first (§12). Only then build Labs items, one per milestone, in this order. Skip any that would break a §5 rule.

1. **Team mode:** two teams take turns, with a running total and a "pass the phone" interstitial.
2. **Round history:** the last 20 rounds stored locally (deck, score, date, words). No card text from SPORRENCESON once it's relocked.
3. **Skip limit:** optional max passes per round (3/5/unlimited).
4. **Bonus card:** one random card per round worth 2, shown with a `butter` frame.
5. **Shake to undo:** undo the last mark within 2 s (`devicemotion` spike, uses the existing sensor ref-count).
6. **Deck mixer:** start a round from several decks at once.
7. **Share deck via link:** encode a small custom deck in the URL hash (no server), with an import prompt on open.
8. **Bigger text mode:** accessibility, re-runs word-fit with a higher minimum size.

Each Labs item gets a `DECISIONS.md` entry, unit tests for its pure logic, and a screenshot.

## 10. Repo, AGENTS.md, scripts, CI

### Structure

```
handoff/                 copied from nod-it-handoff/ (read-only reference, keep in repo)
design/                  ART-DIRECTION.md, ASSET_PROMPTS.md, source/, tokens/
public/                  icons/, fonts if not via @fontsource
scripts/                 gen-icons.mjs, tokens.mjs, check-colours.mjs, sporrenceson.mjs, check-strings.mjs
src/
  index.html  main.tsx  strings.ts  palette.ts  styles.css
  tilt.ts match.ts game.ts voice.ts audio.ts haptics.ts wakelock.ts storage.ts
  camera.ts recorder.ts videoOrientation.ts vault-crypto.ts vault.ts deck.ts debug.ts state.ts
  decks/ (*.json, sporrenceson.locked.json, index.ts)
  ui/ (App, PlayTab, DecksTab, SettingsTab, PreRound, RoundScreen, Results, TiltTest,
       Passcode, HelpSheets, Diagnostics, Illustration, controls, fit, icons, router, services, Labs)
tests/e2e/               Playwright specs (ported from handoff/reference-tests/e2e)
.github/workflows/deploy.yml
AGENTS.md  README.md  DECISIONS.md
```

The Vite root is `src/`, and the build goes to `dist/`. Don't copy the build to the repo root (ROEL IT! did that only for a host that skipped the build; NOD IT! deploys through Actions).

### AGENTS.md (write exactly this, then keep it current)

```md
# NOD IT!

Heads Up-style party game, installable iOS PWA. Static, no backend, offline.

## Run
npm install · npm run dev · npm test · npm run test:e2e · npm run build · npm run icons · npm run tokens

## Rules
- Name is NOD IT! (caps + !). A correct guess is "NOD IT!", never "Correct". Strings live in src/strings.ts.
- Never use neon, glow, gradients, glassmorphism, emoji as icons, AI-generated icons/art, gradient text.
- Flat solid colours from design/tokens only. Phosphor bold icons only.
- iOS feel: large titles, inset lists, bottom sheets, 44pt targets, safe areas, spring easing cubic-bezier(0.2, 0.8, 0.2, 1).
- Copy: short, dry, Aussie. No marketing voice.
- Deck JSON is imported verbatim from handoff/decks. Never write or edit cards.
- The SPORRENCESON code is never committed, logged or put in tests (env SPORRENCESON_CODE only).
- handoff/LESSONS-LEARNED.md rules are binding. tuned-constants.json values are binding.
- Don't use the "Heads Up" name, branding, deck names or colours.

## Architecture
tilt.ts sensor mapping + TiltDetector (pure, tested) · match.ts speech matching (pure, tested) ·
game.ts Round + CardQueue (tested) · voice.ts Web Speech wrapper, never throws into a round ·
audio.ts synth sounds · haptics.ts · recorder.ts/camera.ts/videoOrientation.ts recording ·
vault*.ts locked deck · debug.ts on-device log · state.ts persisted signals · ui/* screens.
```

### Scripts (`package.json`)

- `dev`, `build` (`tsc --noEmit && vite build`), `preview`, `typecheck`
- `test` (vitest), `test:e2e` (playwright)
- `icons`, `tokens`
- `check` (strings + colours + deck hashes + tokens-fresh)
- `lint` (`tsc` is enough. Add ESLint only if it stays tiny.)

### CI (`.github/workflows/deploy.yml`)

- Triggers: `push` to `main` and `workflow_dispatch` only. No PR previews, no other branches.
- Steps:
  1. Node 22, `npm ci`
  2. `npm run typecheck`, `npm test`, `npm run check`
  3. `npm run build` with `BASE_PATH=/${{ github.event.repository.name }}/`
  4. Playwright e2e against `vite preview` (Chromium, iPhone 13 profile + 844×390)
  5. Upload `dist`, deploy to Pages
- Any failure blocks the deploy.
- `scripts/check-strings.mjs` runs the zero-ROEL grep and fails on any hit outside `handoff/`.

### README.md

Cover:
- What the app is.
- How to run, deploy (enable Pages → GitHub Actions) and install on an iPhone.
- How to tune tilt (Test tilt, sensitivity, flip).
- Known iOS limits:
  - voice in standalone is flaky; tilt and taps always work
  - no orientation lock
  - haptics only on taps
  - no silent save to Photos
- How to lock/unlock SPORRENCESON.
- How to regenerate icons and tokens.

## 11. Test plan

**Unit (Vitest), all must pass:**

- Port every test in `reference-src/*.test.ts` unchanged except for names/strings: `match`, `tilt`, `game`, `voice` (fake recogniser), `vault-crypto`, `videoOrientation`. That's 65 tests at minimum, all green.
- New tests:
  - `deck` validator (each error message, fallbacks, ROEL IT! export fixture round-trip, old colour keys resolve, unknown → slate)
  - `palette` (old key map, `onColor` contrast, ΔE check)
  - `strings` (no "Correct", no ROEL)
  - deck hashes vs `MANIFEST.md`
  - SPORRENCESON locked file metadata matches `MANIFEST.md` (count 54)
  - unlock test that runs only with `SPORRENCESON_CODE` set
  - word-fit on the 20 longest cards per deck (no overflow, no mid-word break, ≤ 3 lines)
  - Labs features off = no behaviour change

**E2E (Playwright, Chromium with the iPhone 13 profile; also 844×390):** port each `handoff/reference-tests/e2e/*.mjs` to a spec:

| Area | What it checks |
|---|---|
| Deep (`deep`) | Taps and sheets everywhere, fast second taps, sheet close then immediate tap |
| Monkey (`monkey`) | 2 minutes of random taps with health probes |
| Freeze (`freeze`) | Viewport snap-back after keyboard and rotation; no dead taps |
| Tilt (`orient`) | Synthetic `deviceorientation` in both landscape directions: down = NOD IT!, up = PASS, no double-fire |
| Auto-start (`autostart`) | Grace, tap-disarm, arm on lift |
| Voice | Scriptable fake `SpeechRecognition`: match → NOD IT!, restarts, blocked vs paused, standalone rules |
| Passcode (`lock`, `fastpin`) | Fast typing, wrong/right, remembered, lock again (code from env; skip if unset) |
| Recording (`camera`) | Fake camera via `--use-fake-device-for-media-stream`: overlay frames, file size/dimensions, save path, unsaved warning, early exit keeps the clip |
| Exit (`exit`) | End-round confirm pauses the clock, early end not counted toward best |
| Haptics (`haptic`) | Android patterns, iOS switch path |
| Integration (`integ2`) | Full flow: Play → deck → Pre-round → round → Results → Play again |
| Offline | Build, preview, load once, go offline, reload, play a round |
| Sub-path | Build with `BASE_PATH=/nodit/` and load under it: manifest, SW, icons all resolve |
| Console | Zero console errors and zero page errors across all specs |

**Visual review (you, every milestone):** screenshot 390×844 and 844×390 in light **and** dark mode for:
- Play
- Deck sheet
- Passcode
- Pre-round (each step)
- Countdown
- Round (short word, longest word)
- NOD IT! flash and PASS flash
- Portrait overlay
- End confirm
- Time!
- Results (with and without clip)
- Decks
- Preview
- Editor
- Import result
- Settings (all sections)
- Test tilt
- Install sheet
- Diagnostics

Open each screenshot, look at it, and fix anything that looks templated, cramped, off-palette or un-iOS. Keep the final set in `design/screens/`.

**Real-device checklist (for the owner, put it in README):**
- Install to the home screen.
- Tilt in both directions.
- Voice in Safari vs standalone.
- Record a round, rotate both ways, save to Photos.
- Haptics.
- Offline.
- Update after a redeploy.

## 12. Definition of Done

- [ ] Every bullet in `ROEL-IT-FEATURE-INVENTORY.md` works in NOD IT! (re-skinned, renamed). Tick them off in `PARITY.md`.
- [ ] Every rule in `LESSONS-LEARNED.md` holds. List each one in `PARITY.md` with the test or check that covers it.
- [ ] Constants equal `tuned-constants.json` (or are logged in `DECISIONS.md` with the proving test).
- [ ] Zero "ROEL" strings outside `handoff/`. Name, labels and storage prefix are NOD IT!.
- [ ] Deck files are byte-identical to `handoff/decks` (hash test green). SPORRENCESON ships locked, opens with the owner's code, and no plaintext is in `dist/`.
- [ ] ROEL IT! deck exports import cleanly, and old colour keys render in the new palette.
- [ ] The new design system is in `design/tokens`, light and dark both reviewed, the display face is chosen and logged, and the ΔE check passes.
- [ ] `design/ART-DIRECTION.md`, `design/ASSET_PROMPTS.md`, `design/source/icon.svg` exist, `npm run icons` produces every size, and the icons have been looked at, real size.
- [ ] `npm run typecheck`, `npm test`, `npm run check`, `npm run build` and `npm run test:e2e` are all green locally and in CI. No console errors.
- [ ] It deploys to GitHub Pages under the repo sub-path, installs, works offline, and updates on redeploy (the toast appears).
- [ ] Lighthouse installability passes.
- [ ] Screenshots are reviewed and saved in `design/screens/`.
- [ ] README, AGENTS.md, DECISIONS.md and PARITY.md are written.
- [ ] Labs exists with its master switch off. Labs items are optional and come after everything above.

## 13. How to work

1. **Plan first.** Write `PLAN.md` with milestones before code. Suggested order:
   1. Scaffold, tokens and fonts.
   2. Port the pure modules plus their tests (tilt, match, game, vault-crypto, videoOrientation, deck, voice).
   3. Shell, tabs and sheets.
   4. Play tab and decks.
   5. Pre-round and Round.
   6. Results.
   7. Decks tab: editor and import/export.
   8. Settings and Test tilt.
   9. Passcode.
   10. Recording.
   11. Haptics, sounds and diagnostics.
   12. PWA, icons and asset pipeline.
   13. e2e port.
   14. Visual polish pass, light and dark.
   15. CI and deploy.
   16. Labs.
2. **Small milestones, commit often.** One logical change per commit, with a clear message. Never commit a red test suite.
3. **Run the tests after every change.** Keep `npm test` green at all times. Run e2e at the end of every UI milestone.
4. **Look at what you built.** Take screenshots with Playwright at both sizes and both themes, and open them. If something looks wrong, fix it before moving on.
5. **Port, don't rewrite.** For any module in `reference-src/`, start from that file. Change names, strings and colours, not logic. If you think the logic is wrong, write a failing test first, then log the fix in `DECISIONS.md`.
6. **Never ask questions.** Make the call, log it in `DECISIONS.md`, keep going.
7. **Never generate deck content.** Never commit the SPORRENCESON code.
8. **Fix before moving on.** A known bug isn't a TODO for later.
9. When everything in §12 is ticked, write a short `HANDOFF-REPORT.md`: what's done, what you changed from ROEL IT! and why, and anything the owner must check on a real iPhone.

---

## Appendix A — SPORRENCESON card list

This list is generated from `handoff/decks/sporrenceson.json` by `handoff/scripts/build-handoff.mjs`, and `handoff/scripts/check-handoff.mjs` verifies it matches exactly. It's here for reference and for the owner. It is **not** app content: the app ships only the encrypted file.

<!-- SPORRENCESON:START -->
1. Chris Martin
2. Sheahan Perera
3. Gurinderpal Virk
4. Rie Mohr
5. Navin Kumar
6. Doug Mohr
7. Jack Kellet
8. Connor Dougherty
9. Ayush Kumar
10. Neelam Kumar
11. Nidhi Kumar
12. Jason Umstad
13. Dominic Goodwin
14. Lawrence Goodwin
15. Jackie Goodwin
16. Daisy Nate
17. Roel Nate
18. Josh Angulo
19. Juan Angulo
20. Mathias Sua
21. Vashon Sua
22. Tusitala Sua
23. Reilly Welch
24. Melanie Welch
25. Melissa Umstad
26. Paul Welch
27. Rodge Nate
28. Marian Moraes
29. Ramandeep Mann
30. Noah Martinago
31. Jack Umstad
32. Aithan Perera
33. Kingston Rowe
34. Ryder Ayre
35. Adam Ayre
36. Amber Ayre
37. Corban Martin
38. Sollei Martin
39. Mitchell Holland
40. Beverly Dougherty
41. Terrance Dougherty
42. Baba Ali
43. Ramish Rahimi
44. Leo Jenkins
45. Shourya
46. Darla Westerlund
47. Bowie Westerlund
48. Ava De Byl
49. Arin Ozdemir
50. MV
51. Torkino
52. Andrew Steels
53. Amanda Steels
54. Michael Parker
<!-- SPORRENCESON:END -->
