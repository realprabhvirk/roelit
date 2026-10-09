# ROEL IT!

Heads Up-style party game as an installable iOS PWA. Static, no backend.

## Stack
Vite + TypeScript + Preact (+ @preact/signals). vite-plugin-pwa (Workbox) for offline.
Anton (self-hosted via @fontsource) for big display type, system font for UI.
Phosphor Icons, **bold weight only**, bundled as raw SVG in `src/ui/icons.tsx`.

## Run
- `npm install`, `npm run dev`, `npm test`, `npm run build`
- `npm run icons` regenerates `public/icons/*` from `scripts/icon.svg`
- Desktop testing: arrow keys (↓ ROEL IT!, ↑ pass), tap screen edges, Settings → Test tilt has a simulate slider.

## Architecture
- `src/tilt.ts` sensor mapping + `TiltDetector` state machine (pure, tested)
- `src/match.ts` speech → card matching (pure, tested)
- `src/game.ts` `Round` state machine + `CardQueue` (tested)
- `src/voice.ts` Web Speech wrapper, never throws into a round
- `src/audio.ts` Web Audio synth sounds, `src/wakelock.ts`, `src/storage.ts` (try/catch localStorage)
- `src/state.ts` persisted signals (settings, custom decks, best scores)
- `src/ui/*` screens; `router.ts` holds tab + full-screen flow
- `src/strings.ts` app name and action labels. A correct guess is always "ROEL IT!", never "Correct".
- Decks: `src/decks/*.json`. The Crew deck lives in `examples/` and is imported in-app, never bundled.

## Design rules (non-negotiable)
- Never use neon, glow, gradients, glassmorphism, emoji as icons, AI-generated icons/art, gradient text.
- Flat solid colours from the palette in `src/palette.ts` / CSS vars in `src/styles.css`.
- iOS-native feel: large titles, inset grouped lists, bottom sheets, 44pt targets, safe areas, spring easing `cubic-bezier(0.2, 0.8, 0.2, 1)`.
- Copy: short, dry, Aussie. No exclamation-mark spam, no marketing voice.
- Don't use "Heads Up" name, branding, deck names or colours.
