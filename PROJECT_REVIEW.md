# GuitarCoach review — 2026-10-01

## How the app works

- `App.tsx` owns the start → practice → result flow and audio capture lifetime.
- `StartScreen.tsx` renders real HTML controls above the MP4/poster stage background.
- `guitarProImporter.ts` uses alphaTab to import notes, tuning, techniques, tempo changes and repeat-expanded bar timing.
- `PlayingStage.tsx` owns the transport, wait/loop/coach modes, pitch judgements and live feedback.
- `practiceSession.ts` holds the pure matching, timing, loop and result calculations.
- `NoteHighway.tsx` renders the road, notes, digits, pads, glow and atmosphere in Three.js. `TabCanvas.tsx` draws the scrolling tab in Canvas 2D.
- `pitchDetector.ts` selects browser AudioWorklet or native Tauri/cpal capture. Basic Pitch runs in a worker; captured audio is processed locally.
- The Pages workflow builds the browser app. Native Windows packaging is a separate target.

## Fixes in this pass

- Key visible note objects by note ID, keeping the same object when its judgement changes.
- Share contact geometry and floor-glow textures; dispose per-note materials when notes leave the view. Loops no longer retain a new geometry/material/texture for each repeated note.
- Refresh note appearance and pad feedback after a wrong note is corrected, and after subsequent wrong attempts.
- Dispose bloom resources explicitly when leaving practice.
- Suspend highway and tab rendering while the document is hidden, and resume rendering when visible.
- Expire temporary gameplay feedback with a timer, including while paused.
- Clear pending chord attacks on loop restarts.
- Ignore lingering samples from an already accepted pick when evaluating wrong attempts on the next note; keep the existing legato matching path.
- Show the first bar during the introductory lead-in, rather than the last bar.
- Calculate song duration once using a reduction, avoiding a large spread and repeated full-song allocation.
- Repair ambiguous file-input selectors and broken text encoding in browser tests. Add a retry regression and check feedback expiration while paused.

## Remaining work worth prioritizing

1. **Unify accuracy semantics.** The HUD counts wrong attempts as separate events; the final result counts judged notes. Correcting a note can therefore yield different percentages. Decide which metric to present and label both consistently.
2. **Complete chord practice.** Wait Mode gates single notes, and automatic miss assignment also uses single-note IDs. Unplayed chords need an explicit policy; Coach Mode likewise assesses single notes. Chord matching currently allows ±1 semitone and awards the whole chord after a 50% match. These are product decisions needing real-guitar validation.
3. **Technique scoring.** Bends are drawn as arrows but the matcher does not evaluate a continuous bend pitch trajectory. Visual support is not complete technique assessment.
4. **Audio calibration.** Validate timing, false hits and quiet DI input on real microphones/USB interfaces; synthetic browser tones do not replace hardware testing. Attack pitch matching deliberately tolerates one semitone.
5. **Loading/performance.** The initial JS bundle includes Three.js; alphaTab and TensorFlow are sizable additional bundles. Profile on a modest laptop before claiming steady 60 fps; consider loading the practice screen on demand.
6. **Native release verification.** Build/test the Windows installer separately. Existing local Tauri configuration/build artifacts were outside this change.

This is a source review plus automated browser validation, not a hardware certification or a claim that all gameplay edge cases are complete.
