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

## Follow-up: one pick counted repeatedly

The 128-sample attack detector confused the rising parts of low-frequency string cycles with new picks. A deterministic damped low-E signal produced 16 separate pick IDs at 44.1 kHz. Advancing the expected string also lowered the old detector's thresholds, allowing the same ringing signal to retrigger.

Browser and native capture now aggregate attack energy over approximately 24 ms, require a rise relative to the preceding energy window, and keep the attack threshold independent of the expected tab string. Fast attack notifications are emitted only for confirmed picks. Pitch snapshots cannot be emitted before the first confirmed pick, avoiding an initial unconfirmed/confirmed duplicate.

Regression coverage includes ringing notes at 82.41–329.63 Hz; sample rates 44.1/48/96 kHz; quiet DI signals; a second pick over a ringing tail; rapid 150 ms repeated picks; and a browser session with consecutive identical notes and a sustained input. The same signal cases are tested against the native Rust processor. Real guitar/interface validation remains necessary.

### Microphone ringing follow-up

The capture fix alone did not prevent false wrong-note penalties when microphone-like amplitude ripples generated new attack IDs. A browser regression with a single modulated, decaying E2 produced **six wrong penalties** with the previous scoring guard. The new guard leaves that counter at zero and still accepts a subsequent genuinely different wrong tone.

Capture now supplies the windowed energy-rise ratio and elapsed time since the detected attack with every pitch packet. Wrong-note scoring is limited to the first 140 ms after an attack, allowing a pitch estimate to settle while rejecting later estimates from stale attack IDs. Scoring retains the previously judged pitch across attack notifications and requires a stronger energy rise (1.4×) before another wrong-note penalty for the same pitch or its likely overtones. Distinct pitches retain normal wrong-note feedback; correct-note and legato matching remain available. This intentionally favors avoiding false wrong penalties from room ringing, at the cost of potentially ignoring a very soft repeat of the same wrong tone over its tail. The browser regression also checks that a subsequent, separate A2 generates exactly one wrong penalty.
