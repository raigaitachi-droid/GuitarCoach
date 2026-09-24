# GuitarCoach

Practice any Guitar Pro tab with instant feedback.

**Load tab → Play → Get feedback → Find weak section → Practice it again.**

GuitarCoach is a desktop-first browser practice tool for guitarists who already
use Guitar Pro tabs. Chrome and Edge desktop are the primary targets. No account,
API key, desktop installation, or audio upload is required.

## Current checkpoint: Stages 1-5

The active app has three screens:

1. **Start:** drop a Guitar Pro file or try the bundled demo, select an input, and
   start practicing. `Find inputs` requests browser permission so device names
   become available. Playback without audio is available if an input cannot be used.
2. **Practice:** the scrolling tab fills the screen. Play/Pause, tempo presets,
   and the existing Wait Mode are the only practice controls. `Finish practice`
   ends the session; a song also ends naturally. Space toggles playback and W
   toggles Wait Mode when focus is outside a form control.
3. **Result:** accuracy from assessed single notes, Play again, and Load another
   tab. Playback without audio never generates an accuracy score. Unplayed notes
   after an early stop do not count as misses. Audio capture stops on completion.

This is not the finished feedback MVP. Loop
selection and the weakest-section recommendation are deliberately absent until
Stages 6 and 7. There are no placeholder scores or nonfunctional recommendation
buttons.

## Run locally

Use Node.js 22.12+ (Node 24 also works).

```sh
npm ci
npm run dev
```

Open `http://localhost:3000`. Localhost is allowed to access browser audio. Deployed
instances need HTTPS. For a static production build:

```sh
npm run build
npm run preview
```

The default development command runs Vite only. The retained `server.ts` and
legacy AI components are outside the active application; no AI service runs or
receives practice data.

## Verify

```sh
npm run lint
npx playwright install chromium
npm test
```

The browser tests build and serve the production app. They cover demo playback,
file failures and a generated real GP file, pause/replay, natural completion,
input selection, denied permission, the wait gate, scoring silence, and capture
cleanup. A synthetic pitched tone passes through the real worklet and detector
to release Wait Mode and produce a measured result. Tests also check partial-session
accuracy and exclusion of simultaneous chords. `CHROMIUM_EXECUTABLE_PATH` can point
to an already-installed Chromium.

Synthetic browser inputs verify the application lifecycle, **not real-guitar
pitch accuracy**. USB cable/interface/microphone testing on Chrome and Edge is a
required later checkpoint.

## Repository audit and decisions

The repository already contained a React/TypeScript/Vite web app, an alphaTab
Guitar Pro importer, Web Audio capture with an AudioWorklet, a monophonic pitch
detector, a custom scrolling tab canvas, note matching, and Wait Mode. Its old
README described an unrelated Python desktop layout.

Keep the web foundation, importer, audio worklet, pitch detector, synthesizer,
scrolling note geometry, and useful session data. Simplify their connections
before replacing working behavior.

Removed from the active flow: AI chat and adaptive coaching, catalog browsing,
tuner screens, technique-map drawers, manual simulated hits, score multipliers,
stars, streaks, fullscreen/settings panels, and automatic endless replay. Legacy
UI components remain unreferenced and are not shipped in the active JavaScript
entry. The old automatic section and technique-analysis heuristics have been
removed from the importer because they do not support the practice loop.

Stage 1 also stops crediting every note in a chord from a single detected pitch.
Simultaneous notes remain visible but are excluded from scoring and the wait gate.

## Exact MVP implementation plan

Each stage must pass TypeScript, a production build, and the relevant focused
checks before the next stage starts.

| Stage | Implementation | Acceptance check |
|---|---|---|
| 1 — Flow | Minimal Start → Practice → Result; device selection; real session summary; replay; remove competing surfaces. | Demo and imported tab can complete, stop, and replay; errors recover; no fabricated scores or audio leaks. |
| 2 — GP loading and playback | Done: retain alphaTab's expanded playback ticks, select a non-percussion stringed track, preserve note durations, repeats, tempo changes, time signatures, and exact playback bars. | A generated GP7 fixture verifies note timing, MIDI pitches, and bar boundaries; the full browser suite passes. |
| 3 — Audio | Done in-browser: input selection, disconnect recovery, human errors, local worklet capture, onset/confidence filtering, and a sustainable analysis rate. | Browser lifecycle tests pass. Real USB cable/interface/microphone validation remains required. |
| 4 — Matching | Done: compare detected pitch to the sounding score pitch on the playback clock; account for capture latency and tempo; distinguish wrong, missed, early, and late notes without repeat credits. | Deterministic tests cover latency, cents tolerance, timing boundaries, silence, repeated plucks, and miss deadlines. |
| 5 — Wait Mode | Done: gate the playback clock at the first unresolved single note; release once per valid note; ignore duplicate feedback from one pluck. | Silence and wrong notes hold; the right note advances once; no unintended credits. |
| 6 — Loop and tempo | Select an inclusive bar range directly from the score; enable loop; preserve exact boundaries and percentage presets. | Repeated loops do not drift, skip first/last notes, or leak scores between passes. |
| 7 — Weak section | Collect errors by played bar and scan short contiguous windows; require enough attempts, rank by mistake concentration, and break ties consistently. Recommend only observed sections. CTA selects that range, enables loop, reduces tempo when useful, and starts practice. | Sparse/unplayed regions never win; clustered mistakes do; CTA starts the exact recommended range. |
| 8 — Polish | Remove remaining dead code/dependencies; check focus, readable feedback, loading/error recovery, and desktop layout; verify hosting asset paths and Chrome/Edge. | A guitarist can load, connect, play, understand feedback, and repeat a weak section without instructions. |

## Known limits at this checkpoint

- alphaTab parses the file and its MIDI generator supplies the playback timeline;
  a simplified canvas displays the resulting notes. The app chooses the first
  non-percussion stringed track, preferring six strings. It does not yet offer a
  track picker, and extension recognition does not mean every file variant is verified.
- Input capture runs in an AudioWorklet; pitch analysis currently runs on the
  browser's main thread. The matching rules are covered by synthetic tests, but
  detector accuracy and timing calibration still need real hardware validation.
- Monophonic feedback only. Chords are displayed without scoring. Harmonics and
  other techniques require validation before their feedback can be relied on.
- Practice audio is not monitored through the speakers. Playback-only mode uses
  the existing synth.
- A disconnected input pauses practice. Finish and reconnect from Start; direct
  in-session recovery is Stage 3 work.
- The existing GitHub Pages deployment configuration is retained. Verify its base
  path in Stage 8 before deploying from a repository subdirectory.

## Attribution

The prior README identified the project's roots in
[Artemarius/PickHero](https://github.com/Artemarius/PickHero) and described it as
MIT-licensed. That attribution and repository history are preserved. This change
updates the web product flow; it does not establish a new license or erase the
upstream history.
