# ROEL IT!

Heads Up-style party game as an installable iOS PWA. Static, no backend.

## Stack
Vite + TypeScript + Preact (+ @preact/signals). vite-plugin-pwa (Workbox) for offline.
Anton (self-hosted via @fontsource) for big display type, system font for UI.
Phosphor Icons, **bold weight only**, bundled as raw SVG in `src/ui/icons.tsx`.

## Run
- `npm install`, `npm run dev`, `npm test`, `npm run build`
- Vite root is `src/` (source HTML: `src/index.html`). `npm run build` also copies `dist/` to the repo root, so the repo is a ready-to-serve static site. Always rebuild and commit the root build files after code changes.
- `npm run icons` regenerates `public/icons/*` from `scripts/icon.svg`
- Desktop testing: arrow keys (↓ ROEL IT!, ↑ pass), tap screen edges, Settings → Test tilt has a simulate slider.

## Architecture
- `src/tilt.ts` sensor mapping + `TiltDetector` state machine (pure, tested)
- `src/match.ts` speech → card matching (pure, tested)
- `src/game.ts` `Round` state machine + `CardQueue` (tested)
- `src/voice.ts` Web Speech wrapper, never throws into a round
- `src/audio.ts` Web Audio synth sounds, `src/wakelock.ts`, `src/storage.ts` (try/catch localStorage)
- `src/camera.ts` front camera + mic stream; `src/recorder.ts` draws the branded overlay on a canvas and records it (MediaRecorder). Voice is off in recorded rounds (one mic user at a time). Clips save via the share sheet; iOS has no silent save-to-Photos.
- `src/debug.ts` on-device log (Settings → Diagnostics). Use `log()` for anything worth knowing after a freeze; never log codes or card text.
- iOS rules learned the hard way: one SpeechRecognition at a time (voice.ts gates it); never fire two permission prompts at once; no surprise mic restarts in standalone; don't touch `navigator.audioSession`; the window must never stay scrolled (main.tsx snaps it back).
- `src/state.ts` persisted signals (settings, custom decks, best scores)
- `src/ui/*` screens; `router.ts` holds tab + full-screen flow
- `src/strings.ts` app name and action labels. A correct guess is always "ROEL IT!", never "Correct".
- Decks: `src/decks/*.json`, registered in `src/decks/index.ts`.
- The Crew is passcode-locked: only `src/decks/the-crew.locked.json` (encrypted) exists in the repo. `src/vault-crypto.ts` + `src/vault.ts` handle it; `scripts/crew.mjs` locks/unlocks. **Never commit the plaintext names or the passcode.**

## Design rules (non-negotiable)
- Never use neon, glow, gradients, glassmorphism, emoji as icons, AI-generated icons/art, gradient text.
- Flat solid colours from the palette in `src/palette.ts` / CSS vars in `src/styles.css`.
- iOS-native feel: large titles, inset grouped lists, bottom sheets, 44pt targets, safe areas, spring easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Copy: short, dry, Aussie. No exclamation-mark spam, no marketing voice.
- Don't use "Heads Up" name, branding, deck names or colours.
