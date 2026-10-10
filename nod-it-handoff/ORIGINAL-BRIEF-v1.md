# ORIGINAL BRIEF (v1, renamed)

> Starting point only. The audit (`ROEL-IT-FEATURE-INVENTORY.md`, `tuned-constants.json`, `LESSONS-LEARNED.md`) and `NOD-IT-FULL-PROMPT.md` override it where the shipped code differs. Reproduced unchanged from the owner's Part B (already renamed to NOD IT!).

ORIGINAL BRIEF (v1, the prompt ROEL IT! was started from): "NOD IT!" — a Heads Up-style party game as an installable iOS web app

You are building a static, installable web app (PWA) that plays like the "Heads Up!" party game. One person holds the phone to their forehead, a word shows on screen, their friends act or describe it, and they guess. Tilt the phone down = correct. Tilt up = pass. Also: the app listens through the mic and auto-marks correct when the guesser says the word.

The owner will install it to the iPhone home screen ("Add to Home Screen") so it runs full-screen like a native app. iOS Safari / iOS standalone PWA is the primary target. Everything below is written with that in mind. Read the whole brief before writing code.

The app is called NOD IT! (always written in caps with the exclamation mark; keep the name and the action labels in one config/strings file). It's an inside joke: a correct guess is called "nodding it", because you nod the phone down. Do NOT use the name "Heads Up", Ellen/Warner Bros branding, their deck names, their colours or their art. Same game mechanic, our own identity and content.

## 0. Hard constraints

* Static only. No backend, no database, no login, no accounts, no analytics. All state lives in `localStorage` (wrapped in try/catch).
* Lives in a GitHub repo, built and deployed to GitHub Pages by a GitHub Actions workflow. Pages serves from a repo subpath, so use relative paths / correct `base` everywhere (manifest `start_url` and `scope` too).
* Must work offline after first load (service worker, precache everything).
* Stack: Vite + TypeScript. Keep dependencies tiny. A small UI lib (Preact) is fine, or plain TS. No heavy framework, no UI kit that makes it look generic. Use `vite-plugin-pwa` or hand-roll the service worker, your call.
* No CDN at runtime. Fonts and icons are bundled so the app works offline.
* Ask nothing, decide sensibly, note decisions in the README.

## 1. Design (ORIGINAL ROEL IT! DIRECTION — SUPERSEDED, see Part A §4 for the NOD IT! direction; the rules below still apply, the palette/type choices do not)

The owner has been burned by AI-looking apps. It must look like a small studio designed it by hand and an iOS dev shipped it. Hard rules:

Banned (any of these = fail):

* Neon, glow, glassmorphism blobs, purple/blue/pink gradients, "galaxy"/"cyber" vibes, aurora backgrounds, drop-shadow glows.
* Gradients as a general style. Use flat, solid colours. (A very subtle gradient is OK only if it does a real job, e.g. a status-bar scrim.)
* Emoji as icons. AI-generated/illustrated icons or art. Sparkle ✨ icons. Gradient text.
* Generic centered-hero layouts, rounded-everything card soup, identical purple "primary" buttons.
* Placeholder lorem ipsum, or UI copy that sounds like marketing ("Unleash the fun!").

Do this instead:

* Colour: a warm, slightly muted, grown-up palette with real personality, solid fills. Each deck gets its own solid colour (this is also how the real game feels, big bold colour fields). Suggested starting palette, adjust by eye:
  * Paper `#F3EDE2`, Ink `#1E1B18`, Tomato `#D8452E`, Mustard `#E3A52A`, Forest `#2F6B4F`, Ocean `#2D5E8C`, Plum `#7A3E6B`, Clay `#B8603C`, Teal `#2A7F7A`, Slate `#46505C`.
  * Correct = deep green screen, Pass = tomato/orange screen. Full-bleed colour flash, not a toast.
  * Support light and dark mode via `prefers-color-scheme` (dark = warm near-black, not blue-black). Define colours as CSS variables.
* Type: UI uses the system font (`-apple-system`, SF Pro) so it feels native. The big word on the card uses one self-hosted heavy condensed face (e.g. Anton, Barlow Condensed 800/900, or Archivo Narrow/Black) via `@fontsource`, set huge, uppercase, tight. Pick one, commit. Don't use Inter/Space Grotesk/Poppins as a "look".
* Icons: use a real, existing icon set bundled locally as inline SVG, Phosphor Icons (bold or regular weights, one weight only across the whole app) or Lucide. Do not hand-draw or generate icons. For the app icon (home screen), make a simple, flat, typographic/geometric mark (e.g. a bold "N" or a simple head-on-card shape in one solid colour on a solid background) generated from an SVG source into PNGs with a script (`sharp` or `resvg`). 180×180 apple-touch-icon, 192, 512, maskable 512. No AI art.
* Layout feel = iOS native:
  * Bottom tab bar (Play, Decks, Settings) with safe-area padding, large-title headers that collapse on scroll, grouped "inset list" settings rows, bottom sheets for modals/pickers with drag-to-dismiss, segmented controls, switches that look like iOS switches.
  * 44×44pt minimum tap targets. Spring-style easing (`cubic-bezier` ~ `0.2, 0.8, 0.2, 1`) with short durations, interruptible. Press states = slight scale/opacity, instant.
  * Respect `env(safe-area-inset-*)` everywhere, `viewport-fit=cover`.
  * Kill web-isms: `-webkit-tap-highlight-color: transparent`, `user-select: none` on UI (not on the custom-deck text inputs), `overscroll-behavior: none`, no rubber-band on the game screen, no 300ms delay, no text-size-adjust surprises, no hover-only states.
  * Respect `prefers-reduced-motion`.
* Deck cards on the home screen: a grid of solid-colour tiles, each with an icon (from the icon set), the deck name in the heavy condensed face, and a card count. Slightly different tile heights or a deliberate asymmetric layout is welcome, it should not look like a uniform template grid.
* Copy is short, casual, Australian-friendly, a bit dry. No exclamation-mark spam.

After building, open it in a browser at iPhone sizes (390×844 and landscape 844×390) and actually look at it. Fix anything that looks templated. Compare against how a native iOS app looks.

## 2. Game flow and screens

1. Home / Play: horizontal or grid picker of decks (solid colour tiles). Tap a deck → Deck sheet (name, card count, round length picker, "Start").
2. Pre-round: one-time permission flow if needed (see §3 and §4), then a screen: "Put it on your forehead" with a short instruction line, "Tilt down to NOD IT!, tilt up to pass", and a landscape illustration (simple flat SVG, not AI art). Round auto-starts after a 3-2-1 countdown once the phone is in landscape and tilted roughly upright (face-out). Also a big manual "Start" for testing.
3. Play screen (landscape, full-screen, solid deck colour):
   * Giant word centred, auto-fit to the box (never overflows, never wraps mid-word; multi-word cards wrap to max 2–3 lines and scale down).
   * Timer top-right (big, tabular numbers) + thin progress bar. Score count top-left (small).
   * Tilt down / voice match → full-screen green flash + "NOD IT!" (this replaces the word "CORRECT" everywhere in the UI) (~600–700ms), then next card. Tilt up → full-screen orange/tomato flash + "PASS", next card. Play a short sound for each (§5).
   * Last 10 seconds: subtle pulse on the timer + a ticking sound.
   * Round ends with a buzzer sound and a "Time!" screen.
4. Results: score big, two lists (words you NOD'd, with a check icon, ↷ passed words) using the icon set not emoji, "Play again" and "Change deck". Remember best score per deck locally.
5. Decks tab: list all decks (built-in + custom). Create custom deck: name, colour (pick from the palette), icon (pick from a small curated set), cards (paste one per line). Edit/delete custom decks. Import/Export deck as JSON (file picker + share/download) so decks can be moved between devices without a backend. Store in `localStorage`/IndexedDB.
6. Settings tab: round length (30/60/90/120 s), tilt sensitivity (3 steps), voice detection on/off, sound on/off, "Flip tilt direction" toggle, "Test tilt" screen (live angle readout + shows what a tilt would register as, labelled NOD IT! or PASS), dark/light/system, reset data. About row with version.
7. Landscape handling: iOS ignores manifest `orientation` and `screen.orientation.lock()` doesn't work on iOS. So: design the Play screen for landscape; if the device is in portrait during a round, show a clean "Turn your phone sideways" overlay and pause the timer. Menus work in portrait and landscape.

## 3. Tilt controls (the core feature, must feel right)

* Use `DeviceMotionEvent` / `DeviceOrientationEvent`.
* iOS 13+ requires an explicit permission prompt triggered by a user tap: call `DeviceMotionEvent.requestPermission()` (and `DeviceOrientationEvent.requestPermission()` if used) inside a click handler. Do it from a clear "Enable motion" button the first time, remember the result, and handle `denied` with a helpful sheet explaining how to re-enable it (Settings → Safari → Motion & Orientation Access, and that a home-screen app may need to be deleted and re-added to re-prompt). Needs HTTPS (GitHub Pages is fine).
* Gesture model (phone in landscape, screen facing outward against the forehead):
  * Neutral = screen roughly vertical, facing forward.
  * Tilt down (screen turns toward the floor) past ~35–40° from neutral → NOD IT! (correct).
  * Tilt up (screen turns toward the ceiling) past ~35–40° → PASS.
  * Use the gravity component (`accelerationIncludingGravity`) or orientation beta/gamma, whichever gives a stable, orientation-independent signal for landscape-left AND landscape-right. Handle both landscape directions (the sign flips) using `screen.orientation.angle` / `window.orientation`.
  * Calibrate: sample the neutral pose during the 3-2-1 countdown and measure tilt relative to that baseline, so it works whatever way the person holds it.
  * State machine with hysteresis: after a trigger, require the phone to return to within ±15–20° of neutral before another trigger can fire, plus a ~700ms lockout. Low-pass filter the signal so jitter and shaking don't fire it. Never fire during the flash animation. Never fire while in portrait.
  * Tilt sensitivity setting changes the threshold.
* Handle iOS vs Android sign differences on the accelerometer axes defensively and put the mapping in one well-commented module. Add the "Flip tilt direction" setting and the "Test tilt" screen because the owner will tune this on a real phone.
* Fallbacks/dev mode: on-screen buttons (swipe or tap left/right edge: tap right = correct, tap left = pass), and on desktop, arrow keys (↓ correct, ↑ pass) and an optional "simulate tilt" slider. This lets the app be tested in a desktop browser where there is no motion sensor.
* Request a Screen Wake Lock during a round (`navigator.wakeLock`) so the screen doesn't dim; re-acquire on `visibilitychange`. Feature-detect, fail silently.

## 4. Voice detection ("when the word is said, it says yes")

Goal: while a round is running, listen through the mic. When the target word is heard, trigger NOD IT! (correct) exactly as if the phone had been tilted down.

* Use the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) with `continuous = true`, `interimResults = true`, language `en-AU` (setting for en-US/en-GB too).
  * Note: on iOS this is Apple's built-in recogniser (Safari), not a bundled model, and it may need an internet connection. Don't promise "fully on-device" anywhere in the UI. Just call it "Voice detection".
* Matching logic (put in its own tested module):
  * Normalise: lowercase, strip punctuation/diacritics, collapse whitespace, and convert number words/digits sensibly.
  * Match against interim and final results so it reacts fast, and only look at the newest words since the last card (clear the buffer on every card change so the previous word doesn't re-trigger).
  * Single-word card: word-boundary match, allow simple plural/tense variants and small edit-distance tolerance (e.g. Levenshtein ≤ 1 for words ≥ 5 letters) to cope with recogniser mistakes.
  * Multi-word card ("Harry Potter"): all tokens must appear in order within a short window (last ~6 words).
  * Optional per-card `aliases` array in deck data (e.g. "Spiderman" / "Spider-Man" / "Spider Man").
  * Debounce: ignore matches for ~800ms after a card change.
* Mic UX: small mic status pill on the play screen (listening / not available / off), and a one-time pre-round "Allow microphone" tap (user gesture). The recogniser stops by itself every so often, so auto-restart it on `end` for the whole round, with a short backoff, and stop it cleanly at round end and when the app is backgrounded.
* Be defensive: iOS standalone (home-screen) PWAs have a history of flaky/blocked `SpeechRecognition` (permission errors like `service-not-allowed`, repeated permission prompts). So:
  1. Feature-detect, and run a real "Test voice" check in Settings (say a word, see if it hears it).
  2. If it fails in standalone mode, degrade gracefully: tilt keeps working, the mic pill shows "Voice unavailable", and the Settings screen explains what's going on in one plain sentence, plus a hint that voice works when opened in Safari rather than from the home screen icon.
  3. Voice must never be able to crash or block a round.
* Playing audio and listening at the same time on iOS can fight over the audio session. Test that the correct/pass sounds still play while recognition is active and keep sounds short.

## 5. Sound, haptics, polish

* Short, tasteful sound effects (correct = rising two-note tick, pass = soft low thud, countdown beeps, end buzzer). Generate with the Web Audio API (oscillators/envelopes) or small bundled files; unlock the audio context on the first tap. No cheesy sounds.
* iOS Safari has no `navigator.vibrate`, so don't rely on haptics. The big colour flash + sound is the feedback. (Optionally use the `<input type="checkbox" switch>` trick for a light haptic on toggles, only if it works reliably, otherwise skip.)
* Card order: shuffle (Fisher–Yates) per round, never repeat a card until the deck is exhausted, then reshuffle.
* Add subtle, real transitions between screens (slide/fade ~220ms). No parallax, no confetti cannons. Keep the end-of-round result simple and confident.

## 6. PWA + iOS specifics (checklist)

* `manifest.webmanifest`: name, short_name, `display: "standalone"`, `start_url`/`scope` relative for GH Pages subpath, `background_color`/`theme_color` matching the palette, icons incl. maskable.
* In `<head>`: `<meta name="apple-mobile-web-app-capable" content="yes">`, `apple-mobile-web-app-status-bar-style` (`black-translucent` with safe-area padding, or `default`, choose and test), `apple-mobile-web-app-title`, `<link rel="apple-touch-icon" href="...180.png">`, `viewport` with `viewport-fit=cover, user-scalable=no`, `theme-color` for light/dark.
* Service worker precaches the app shell + fonts + deck data, versioned cache, "update available" toast that reloads cleanly. Make sure a new deploy actually updates the home-screen app.
* Disable pinch-zoom, double-tap zoom, long-press callouts (`-webkit-touch-callout: none`) on the game UI.
* Persist: settings, custom decks, best scores, last used deck.
* An "Install" help sheet shown on first visit in Safari (not when already standalone): 3 simple steps with the Share icon → Add to Home Screen. Detect standalone via `navigator.standalone` / `display-mode: standalone`.

## 7. Content: decks (JSON files in `/src/decks/`)

Schema: `{ id, name, color, icon, description?, cards: [ "Word" | { text, aliases?: string[] } ] }`. Ship ~8 built-in decks, 60–100 cards each, written by you, original and varied, mixed difficulty, Aussie-aware where it fits:

1. Animals
2. Movies & TV (mix of global and well-known Aussie things)
3. Famous People (athletes, musicians, internet people, historical)
4. Food & Drink (include Aussie stuff: Vegemite, snag, Tim Tam, chicko roll…)
5. Act It Out (verbs/actions you can mime)
6. Around Australia (places, slang, brands, sports, things you'd know growing up in Queensland)
7. Brands & Apps
8. Jobs & Trades

Plus one special deck, the inside-joke deck. (v1 called it "The Crew" and listed the old jokes here. That list is obsolete and has been removed on purpose. The deck was later renamed Sporrenceson and the old jokes were replaced with new ones. The real, current contents are in the repo; see Part A §2.)

The importer must validate the JSON and show a clear error if it's bad.

## 8. Repo, structure, delivery

* Repo structure: `src/` (app, game engine, tilt, voice, audio, storage, ui), `src/decks/`, `public/` (icons, manifest), `scripts/` (icon generation), `.github/workflows/deploy.yml` (build + deploy to Pages), `README.md`, `AGENTS.md` (short: stack, how to run, architecture notes, the design rules from §1, and "never use neon/gradients/emoji/AI icons").
* Keep modules small and separate: `tilt.ts` (sensor + state machine), `voice.ts` (recogniser wrapper), `match.ts` (pure matching functions with unit tests via Vitest), `game.ts` (round state machine), `audio.ts`, `storage.ts`.
* Unit-test `match.ts` and the tilt state machine (feed it fake angle sequences: clean tilt down, clean tilt up, jitter, double-trigger, landscape-left vs landscape-right).
* README: how to run, how to deploy to Pages, how to install on iPhone, how to tune tilt, known iOS limits (speech in standalone, no haptics, no orientation lock).
* Commit in small logical steps with clear messages.

## 9. Definition of done

* [ ] Installs to iPhone home screen, launches full-screen with correct icon and name, status bar looks right, safe areas respected.
* [ ] Motion permission flow works on iOS; tilt down = correct, tilt up = pass, in both landscape directions, no double-fires, no firing when shaking or walking.
* [ ] Voice marks a card correct when the word is said (tested), restarts itself through a full 120s round, and fails gracefully if unavailable.
* [ ] Works offline after first load; updates on redeploy.
* [ ] 8 built-in decks + custom deck create/edit/delete/import/export; Sporrenceson deck present (imports or bundled, same as ROEL IT!).
* [ ] Screenshots at 390×844 and 844×390 reviewed by you. Nothing looks neon, gradient-heavy, emoji-based or AI-generated. Looks like a human designer made it and could sit next to native iOS apps.
* [ ] Lighthouse PWA/installability passes. No console errors.
