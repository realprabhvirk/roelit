# Lessons learned: ROEL IT! bugs, fixes, and do-not-regress rules

Every item below is a real problem that happened while building ROEL IT! (commit history `171cbc7` → `97e4e92`). Each ends with a **Rule** for NOD IT!. Where a reference implementation exists, it is in `reference-src/`.

## Hosting and deploy

1. **Blank white screen on the host.** The host (Cloudflare Pages) published the repo without running the build, so `index.html` loaded `/src/main.tsx` as raw TypeScript (served as `application/octet-stream`) and the browser refused it. A "successful" deploy just meant files were uploaded. A `wrangler.toml` pointing at `dist` then made builds *fail* because no build ran.
   **Rule:** the deployed `index.html` must reference built `/assets/*.js`. CI must assert that (grep the built `index.html`). Use the GitHub Actions → Pages workflow with `BASE_PATH=/<repo>/`. Add a 4-second "didn't load, check the build ran" fallback message inside `index.html` so a broken deploy is never a silent blank page.
2. **Sub-path deploys.** All asset, manifest and service-worker URLs must work under `/<repo>/`. Manifest `id`, `start_url`, `scope` are `./`. Icon links in `index.html` are relative.
   **Rule:** test a production build served from a sub-path (`/nod-it/`) in Playwright, not just `/`.
3. **Home-screen apps don't update.** Standalone PWAs rarely reload, so a new deploy sat unused.
   **Rule:** `registerType: 'prompt'`, call `registration.update()` on every `visibilitychange` to visible (when online) and every 30 min, and show a "New version ready · Reload" toast that calls `updateSW(true)`.
4. **Branch/preview confusion.** The owner wants one branch (`main`) and no preview deploys. Keep the workflow on `push: main` + `workflow_dispatch` only.

## Taps, sheets and "random freezes"

5. **Second tap within 320 ms swallowed.** A `touchend` `preventDefault` "stop double-tap zoom" hack cancelled the click of any quick second tap.
   **Rule:** never `preventDefault` on `touchend` globally. Use `touch-action: manipulation` (on `html, body, button`) to kill double-tap zoom.
6. **Taps eaten right after closing a sheet.** The closing sheet's invisible full-screen root stayed hit-testable for its 420 ms exit animation.
   **Rule:** `.sheet-root:not(.open) { pointer-events: none; }`.
7. **Sheets rendered under the tab bar.** A sheet inside an animated, scrolling tab view was trapped in that view's stacking context.
   **Rule:** portal every sheet to `document.body`.
8. **Sheet flashing back open.** Opening used two nested `requestAnimationFrame`s and only the outer one was cancelled on close.
   **Rule:** cancel both frames. Also wrap `setPointerCapture` in try/catch (it throws if iOS already cancelled the pointer), and give the scrim `cursor: pointer` (iOS only sends clicks to elements it thinks are clickable).
9. **Window left scrolled → every tap lands off its button until relaunch.** After the keyboard closes or the phone rotates, iOS can leave the layout viewport nudged while `position: fixed` UI stays put.
   **Rule:** the document never scrolls (only inner containers do). On `scroll`, `resize` (+250 ms), `orientationchange` (+400 ms), `visualViewport.resize` and `focusout` (+100 ms), `scrollTo(0, 0)` unless a text input or textarea is focused. Log it.
10. **Leaked `touchmove` blocker.** The play screen adds a non-passive `touchmove` `preventDefault` on `document`. If cleanup threw before removing it, scrolling died app-wide.
    **Rule:** in cleanup, remove document/window listeners *first*, then run every other teardown step in its own try/catch.
11. **Passcode stopped after two digits / keypad wedged.** Keys relied on `click`, which iOS may drop on fast tapping; state was read from the last render.
    **Rule:** keypad keys act on `pointerdown` (with `preventDefault`), keep `click` only for keyboard activation (`detail === 0`); update a live ref of the digits immediately, not on next render; race the unlock check against a 10 s timeout so busy can't stick.
12. **Crashes leave a dead UI.** A render error in Preact without a boundary leaves a frozen half-tree.
    **Rule:** wrap the app in an error boundary that logs the error and shows "Something broke · Reload". If a round's deck is missing or empty (e.g. relocked), leave the round instead of throwing.
13. **No way to see what happened on a phone.**
    **Rule:** ship the on-device diagnostics log (Settings → Diagnostics): rolling 400 lines, persisted every 800 ms, previous session kept, taps that didn't produce a click within 700 ms (with the element under the finger and viewport state), main-thread stalls (heartbeat 500 ms, report if > 1200 ms late), errors, screen/sheet/tab changes, voice/motion/camera events. Never log codes or card text.

## Tilt

14. **Euler angles break at the neutral pose.** In landscape the neutral pose sits at gamma ≈ ±90°, exactly where gamma wraps and beta jumps by 180°.
    **Rule:** compute a gravity "down" vector in device coordinates and derive pitch from it: `down = (sinγ·cosβ, −sinβ, −cosβ·cosγ)` from `deviceorientation`, `pitch = atan2(down.z, side·down.x)`. Positive = screen towards the floor = correct.
15. **Landscape-left vs landscape-right sign flip.** `screen.orientation` is inconsistent on iOS.
    **Rule:** read the side from the vector itself (`side = sign(down.x)` of the calibration average). Before calibration, follow the side whenever `|down.x| > 0.5`.
16. **iOS vs Android accelerometer sign.** Spec/Android report `accelerationIncludingGravity` as the upward reaction (+9.81 face-up); iOS reports gravity (−9.81 face-up).
    **Rule:** prefer `deviceorientation` (sensor-fused, immune to shaking); use `devicemotion` only if no orientation event arrived in the last 400 ms, mapping iOS `down = +a`, others `down = −a`, and drop samples whose magnitude isn't within 0.75–1.25 g. Keep a "Flip tilt direction" setting.
17. **Double-fires and jitter.**
    **Rule:** the detector starts disarmed; it arms only when `|pitch| ≤ 18°` and the 700 ms lockout has passed; the tilt must stay past the threshold for 60 ms; it never fires while blocked (flash, pause, portrait, end-round confirm). Low-pass the vector (τ 60 ms orientation, 110 ms motion, dt clamped to 200 ms).
18. **Calibration.**
    **Rule:** average samples over the whole 3-2-1 countdown; clamp the baseline to ±25° so a bad pose can't eat the threshold.
19. **Sensors running forever.** Once a round had started, gyro listeners kept firing at 60 Hz in the menus.
    **Rule:** reference-count the sensor (`acquire()` on mount of pre-round, round and test tilt; `release()` on unmount) and stop listeners at zero. Re-attach after motion permission is granted.
20. **Round auto-started while you were still setting up.** Holding the phone sideways to read the get-ready screen looked like holding it on your forehead.
    **Rule:** 2.5 s grace on open; any tap pauses auto-start for 3 s *and* disarms it; it only arms after a non-upright sample (lifting the phone onto the forehead); then it needs 1 s held upright with a visible "Starting…" progress bar; it waits if the camera is still starting. Manual Start always works.
21. **Test tilt slider wouldn't drag.** The full-screen `touch-action: none` blocked it.
    **Rule:** the tilt test screen uses `touch-action: manipulation`.

## Permissions

22. **Two permission prompts at once.** Motion re-request and mic start fired in the same tap.
    **Rule:** never fire two permission prompts together. On Start: motion request first (if previously granted, re-request inside the tap; it resolves silently), then camera *or* voice after it settles.
23. **Motion denied.**
    **Rule:** a sheet explaining Settings → Apps → Safari → Motion & Orientation Access, and that a home-screen app may need deleting and re-adding to ask again. Offer "Play with taps".

## Voice

24. **"Blocked" stuck forever.** A blocked state was persisted; toggling voice never cleared it.
    **Rule:** voice health is session-only, reset when voice is toggled on, the accent changes, or Test voice starts. Show iOS's real reason with the error code (e.g. `service-not-allowed` → check Dictation is on; in a home-screen app, try Safari).
25. **Refused auto-restart treated as blocked.**
    **Rule:** `not-allowed`/`service-not-allowed` on the very first start = blocked (session). After a session has worked = "paused" with a "Tap to resume voice" pill. `audio-capture` = paused.
26. **Restart loops and surprise mic prompts (felt like freezes).** iOS home-screen apps may re-ask for the mic on every `start()`.
    **Rule:** cap instant deaths at 4 (session < 1 s), back off 250 ms ×2 up to 4 s (≥ 2 s after `network`). In standalone, auto-restart only if the Permissions API says `granted` or the last start reached `onstart` in < 800 ms; otherwise pause and wait for a tap. Never start while the page is hidden.
27. **Two recognisers at once → dead mic.**
    **Rule:** one recogniser per page: a new start waits for the previous one's `end` (or 1.5 s). Abort is asynchronous.
28. **Start that never reports back.**
    **Rule:** 5 s watchdog → abort, status paused, error `start-timeout`.
29. **Matcher crash on odd words.** `'constructor' in UNITS` is true for plain objects.
    **Rule:** own-property lookups only (also for palette names, best scores, icon keys). Wrap the result handler in try/catch. Voice must never throw into a round.
30. **Old word re-triggering.**
    **Rule:** on every card change, record the result index/word count and only match words after it; ignore matches for 800 ms; clear the card before firing the match.

## Audio and haptics

31. **Audio session switching froze/stalled and paused music.**
    **Rule:** never touch `navigator.audioSession`. Sounds follow the silent switch; the room's music keeps playing. Recreate the `AudioContext` if it's `closed`; `resume()` if not running.
32. **iOS has no vibration API.** The only web haptic is the native `<input type="checkbox" switch>` tick (iOS 18+), only inside a real tap. Reportedly from iOS 26.5 programmatic `label.click()` no longer ticks and multi-tick patterns play only the first tick; only a real tap on a switch works.
    **Rule:** tilt and voice can't buzz on iPhone; say so in README/Settings. Android uses `navigator.vibrate` patterns (correct `[14,55,14]`, pass `[45]`). One app-wide tap haptic via a capture-phase click listener; per-control override with `data-haptic` (`none` on round tap zones so a mark doesn't double-buzz). The hidden switch must never keep focus, never scroll, and be excluded from the tap tracer.

## Rounds and results

33. **Stale timer yanked you to results.** The "Time!" → results timeout wasn't cleared on unmount.
    **Rule:** clear every timer on unmount.
34. **Exiting early lost everything.**
    **Rule:** X / End round opens "End this round?" (clock paused, scoring blocked) with Keep playing / End round. Ending early finishes the round properly: end card "Ended", recording kept, results screen labelled "ended early", not counted for best. Ending with nothing played and no recording goes straight back.

## Recording

35. **Saving to Photos.** No web API saves silently to Photos.
    **Rule:** results screen shows the clip with **Save to Photos** → `navigator.share({ files })` → "Save Video". Leaving with an unsaved clip warns once ("Video's not saved. Tap again to leave without it."). Download fallback elsewhere.
36. **Mic contention.**
    **Rule:** voice detection is off in recorded rounds (the mic goes to the video). Stop the pending voice recogniser and wait for it to be idle before `getUserMedia`.
37. **Upside-down recordings in one landscape direction.**
    **Rule:** learn how the phone delivers frames by comparing frame shape with how the phone is held (20 consistent readings): `follows` (no rotation), `landscapeRaw` (rotate 180 at angle 270), `portraitRaw` (270 at 90, 90 at 270). Rotate each frame on the canvas every frame (flipping mid-round fixes itself). Overlay always upright. Manual "Flip recorded video" adds 180. Preview mirrored, recording true view.
38. **Black first frame on the clip thumbnail.** Seek the results `<video>` to 1 s on `loadedmetadata`.
39. **Save button below the fold in landscape.** Put video and actions side by side when `orientation: landscape and max-height: 500px`.
40. **Canvas capture quirks.** Keep the hidden `<video>` and `<canvas>` attached to the DOM (2 px, opacity 0.01), draw a frame before `MediaRecorder.start(1000)`.

## Data and privacy

41. **Decks tab didn't reflect an unlock.** It listed the static built-in decks instead of the live list.
    **Rule:** every deck list reads from the one computed `allDecks`.
42. **Plain-text names left behind after relock.** The per-deck deal order (`queue:<id>`) stored card text.
    **Rule:** "Lock again" also removes the deck's queue key.
43. **Public repo.** Anything committed is public, and the host serves the repo root. Old Cloudflare preview deployments keep serving old builds.
    **Rule:** ship the passcode deck encrypted only; never commit a code.
44. **Imported deck colliding with a built-in id.**
    **Rule:** a custom deck whose id matches a built-in is kept under `<id>-custom`.

## Layout and look

45. **Status bar text invisible.** `black-translucent` forces white status text on a light background.
    **Rule:** `apple-mobile-web-app-status-bar-style: default`, and set `theme-color` per screen (page background normally; the deck colour on full-bleed game screens).
46. **Word overflow.** Fit with canvas `measureText`, 93 % of the box width, line-height 0.95, max 3 lines, balanced; never break inside a word; re-fit after `document.fonts.ready` and on resize.
47. **Landscape tab bar.** In short landscape (`max-height: 500px`) the tab bar goes horizontal (icon + label in a row), 44 px tall.
