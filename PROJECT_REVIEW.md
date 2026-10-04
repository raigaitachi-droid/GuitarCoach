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
2. **Complete chord practice.** Wait Mode now gates every unresolved chord tone; game-mode automatic misses still use single-note IDs. Game chord matching allows ±1 semitone and awards the whole chord after a 50% match. Wait Mode requires exact pitches and retains unresolved tones after partial recognition. Real-guitar chord validation remains necessary.
3. **Technique scoring.** Bends are drawn as arrows but the matcher does not evaluate a continuous bend pitch trajectory. Visual support is not complete technique assessment.
4. **Audio calibration.** Validate timing, false hits and quiet DI input on real microphones/USB interfaces; synthetic browser tones do not replace hardware testing. Game-mode attack matching tolerates one semitone; Wait Mode does not.
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

### Toolbar update and Coach Mode removal

Removed Coach Mode UI, state, automatic tempo changes, and its unused loop-assessment helper. Manual tempo, loop selection, and Wait Mode remain. The transport now uses SVG icons, consistent 44px controls, a connected tempo group, and restrained teal active states. Verified actual rendered screens with and without microphone input. Type checking and production build pass. The browser suite passed 51 of 52 checks; the polyphonic-preview check timed out in the full run, isolated rerun, and a comparison using the previous committed production code. That existing failure remains unresolved and is not hidden or skipped.

### Wait Mode and pitch recognition correction — 2026-10-04

Wait Mode now confirms the expected pitch without wrong penalties, combo, accuracy or early/late judgements. Results show practiced-note counts. Every chord tone is gated, with individual picking supported; partial polyphonic readings only confirm their exact matched tones. Selected loops no longer wait for unresolved notes preceding the loop.

The detector previously selected the absolute correlation maximum among several repeating periods. With identical guitar-like test signals, the old detector misidentified 17 of 33 note/sample-rate combinations (including E4 as A2 at 48 kHz). Selecting the first sufficiently strong local peak resolves all 33 combinations across three phases. Low E at 96 kHz also exceeded the old half-window period limit; analysis now uses the available overlapping samples.

Validation covers 44.1/48/96 kHz, real browser worklet capture, quiet input, repeated notes, ringing tails, exact chord tones, loop selection, and restoration of game feedback when Wait Mode is disabled. The wider run excludes the previously documented Basic Pitch preview timeout; this unrelated limitation remains unresolved. Synthetic input does not certify recognition on every physical microphone/guitar.

### Audio responsiveness and render workload — 2026-10-04

Moved the unchanged monophonic pitch analysis into a lightweight dedicated module worker. Capture transfers its buffer rather than running correlation on the render thread. There is at most one newest pending analysis window, preserving onset flags and rejecting prior generations after a hit/reset. Worker failures fall back to the same analyser; finishing practice terminates it. Old onset estimates preceding a newer attack are rejected.

Basic Pitch is only started for songs with chords, avoiding TensorFlow startup/inference for single-note riffs. The 140 ms post-attack blanket delay is replaced by a 40 ms settle interval (capture already requires a complete post-attack window); the held-pitch cooldown is 90 ms instead of 180 ms. Pluck-ID deduplication and ringing guards remain.

The tab panel caches measure starts and next-string-note references, then uses binary search and visits only visible notes instead of repeated full-song filters/finds per frame. The highway reuses frame-local maps/sets. These changes retain the existing visual resolution and materials.

Validation: type checking/build, all 89 non-preview checks, then eight targeted checks after the bounded-queue change. The browser fixture confirms the mono worker is used and terminated; single-note songs do not create a polyphonic worker. One measured synthetic low-E response in a chord practice fixture was 122 ms. This is not a hardware latency/FPS guarantee. The existing Basic Pitch preview timeout remains excluded from the broad run.

### Seventh-fret harmonic recognition — 2026-10-04

Reproduced natural harmonics on strings B and G being reported as open B3/G3 instead of sounding F-sharp5/D5 when a weak residual open-string vibration accompanies the harmonic. The generic 98%-of-best correlation peak criterion preferred the waveform's full repeating period.

For score-marked harmonics only, the mono analyser now checks a measured local correlation peak within 50 cents of the expected sounding pitch and requires actual spectral energy at that measured frequency. It does not blindly substitute the expected note or accept an octave above it. Ordinary-note analysis remains unchanged. The target travels with each browser/native worker packet and is cleared outside harmonic targets and on input shutdown. Import now resolves alphaTab's numeric harmonic enum to its named type; alphaTab's sounding MIDI value remains authoritative.

Validation: type checking and production build; 48 detector/import tests, including 44.1/48/96 kHz, residual open-string amplitudes 20–40%, detuning +/-35 cents, and rejection of open-string, normally fretted seventh-fret, and upper-octave tones. Three browser worklet regressions pass: quiet input, ringing-tail protection, and sequential B/G seventh-fret harmonics with residual vibration. The latter rejects a regular seventh-fret note and confirms both harmonics with correct practice counts. Physical microphone/guitar validation remains necessary; synthetic signals cannot cover every acoustic mixture. The previously documented Basic Pitch preview limitation is unchanged.
