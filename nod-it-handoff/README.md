# nod-it-handoff

Everything Codex needs to rebuild ROEL IT! as **NOD IT!** with a new design. Copy this folder into the new repo as `handoff/` and give Codex `NOD-IT-FULL-PROMPT.md`.

| Path | What |
|---|---|
| `NOD-IT-FULL-PROMPT.md` | The prompt. Start here. |
| `ROEL-IT-FEATURE-INVENTORY.md` | Every screen and behaviour as shipped (v1.4.1) |
| `tuned-constants.json` | Every tuned number |
| `LESSONS-LEARNED.md` | 47 bugs → fixes → rules |
| `decks/` | Deck JSON, byte-for-byte, plus `MANIFEST.md` (counts, SHA-256) |
| `reference-src/` | ROEL IT! source for the hard modules, with tests |
| `reference-tests/e2e/` | Playwright scripts used on ROEL IT! |
| `ORIGINAL-BRIEF-v1.md` | The v1 brief (background only) |
| `scripts/` | `build-handoff.mjs` regenerates `decks/` and the prompt's card list (needs `CREW_CODE` env); `check-handoff.mjs` verifies it (no code needed) |

The SPORRENCESON plain names are in `decks/sporrenceson.json` and the prompt appendix, on purpose. The passcode is not in here anywhere and never should be.
