import { useEffect, useMemo, useRef, useState } from 'react';
import { ImportedSong, TabNote } from '../types';
import { guitarSynth } from '../utils/guitarSynth';
import { micDetector } from '../utils/pitchDetector';
import { advanceLoop, applyWaitGate, expectedMidi, judgeDetectedPitch, loopBoundaries, missedNoteIds, normalizeLoopRange, practiceBars, PracticeLoopRange, PracticeResult, resetLoopPass, singleNoteIds, summarizePractice, TIMING_WINDOW_MS } from '../utils/practiceSession';
import { TabCanvas } from './TabCanvas';

interface Props {
  song: ImportedSong;
  withAudio: boolean;
  tempoPercent: number;
  initialLoopRange?: PracticeLoopRange | null;
  onTempoPercentChange: (percent: number) => void;
  onFinish: (result: PracticeResult) => void;
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function noteName(note: TabNote) {
  const midi = expectedMidi(note);
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function barAt(bars: ReturnType<typeof practiceBars>, playbackMs: number) {
  return bars.find((bar) => playbackMs >= bar.startMs && playbackMs < bar.endMs) || bars.at(-1);
}

export function PlayingStage({ song, withAudio, tempoPercent, initialLoopRange, onTempoPercentChange, onFinish }: Props) {
  const bars = useMemo(() => practiceBars(song), [song]);
  const startingRange = normalizeLoopRange(initialLoopRange || { startBar: 1, endBar: 1 }, bars.length);
  const startingBoundaries = initialLoopRange ? loopBoundaries(bars, startingRange) : null;
  const [notes, setNotes] = useState<TabNote[]>(() => song.notes.map((note) => ({ ...note, hitState: undefined, mistakeCount: undefined })));
  const notesRef = useRef<TabNote[]>(notes);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const [playbackMs, setPlaybackMs] = useState(() => startingBoundaries?.startMs || 0);
  const playbackRef = useRef(startingBoundaries?.startMs || 0);
  const [waitMode, setWaitMode] = useState(false);
  const waitModeRef = useRef(false);
  const [waiting, setWaiting] = useState<TabNote | null>(null);
  const waitingRef = useRef<TabNote | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: 'correct' | 'wrong'; timing?: string; at: number } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(Boolean(initialLoopRange));
  const loopEnabledRef = useRef(Boolean(initialLoopRange));
  const [loopRange, setLoopRange] = useState<PracticeLoopRange>(startingRange);
  const loopRangeRef = useRef<PracticeLoopRange>(startingRange);
  const tempoRef = useRef(tempoPercent / 100);
  const completedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const lastConsumedPluck = useRef(-1);
  const lastFeedbackPluck = useRef(-1);
  const lastHitNote = useRef<TabNote | null>(null);
  const scorableIds = useMemo(() => singleNoteIds(song.notes), [song]);
  const hasChords = scorableIds.size !== song.notes.length;
  const duration = Math.max(song.durationMs, ...song.notes.map((note) => note.timestampMs + Math.max(note.durationMs, TIMING_WINDOW_MS + 100)));

  // Keep the original event-driven detector and scrolling clock, with one owner
  // for a session. Transport state is synchronous so pause cannot award hits.
  const updateNotes = (next: TabNote[]) => { notesRef.current = next; setNotes(next); };
  const setTransport = (next: boolean) => {
    playingRef.current = next;
    setPlaying(next);
    if (!next) guitarSynth.stop();
    else if (!withAudio) guitarSynth.resume();
  };
  const changeWaitMode = () => {
    waitModeRef.current = !waitModeRef.current;
    setWaitMode(waitModeRef.current);
    waitingRef.current = null;
    setWaiting(null);
  };
  const clearLoopPass = (boundaries: NonNullable<ReturnType<typeof loopBoundaries>>) => {
    updateNotes(resetLoopPass(notesRef.current, boundaries));
    waitingRef.current = null;
    setWaiting(null);
    lastConsumedPluck.current = -1;
    lastFeedbackPluck.current = -1;
    lastHitNote.current = null;
    setFeedback(null);
    guitarSynth.stop();
  };
  const restartLoop = (range: PracticeLoopRange) => {
    const boundaries = loopBoundaries(bars, range);
    if (!boundaries) return;
    clearLoopPass(boundaries);
    playbackRef.current = boundaries.startMs;
    setPlaybackMs(boundaries.startMs);
  };
  const changeLoop = () => {
    const nextEnabled = !loopEnabledRef.current;
    loopEnabledRef.current = nextEnabled;
    setLoopEnabled(nextEnabled);
    if (!nextEnabled) return;
    const activeBar = barAt(bars, playbackRef.current)?.index || 1;
    const range = { startBar: activeBar, endBar: activeBar };
    loopRangeRef.current = range;
    setLoopRange(range);
    restartLoop(range);
  };
  const changeLoopRange = (range: PracticeLoopRange) => {
    const nextRange = normalizeLoopRange(range, bars.length);
    loopRangeRef.current = nextRange;
    setLoopRange(nextRange);
    if (loopEnabledRef.current) restartLoop(nextRange);
  };
  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setTransport(false);
    onFinishRef.current(summarizePractice(notesRef.current, Math.round(tempoRef.current * 100), withAudio));
  };

  useEffect(() => { tempoRef.current = tempoPercent / 100; }, [tempoPercent]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);

  useEffect(() => {
    if (!withAudio) return;
    return micDetector.subscribe((result) => {
      if (!micDetector.getIsListening()) {
        setTransport(false);
        setInputError(micDetector.getErrorMessage() || 'We can’t hear your guitar. Check your input device and try again.');
        return;
      }
      if (!result || !playingRef.current || completedRef.current) return;
      if (result.isVoiceLike || (!result.onset && result.confidence < 0.68)) return;
      const judgement = judgeDetectedPitch({
        notes: notesRef.current,
        scorableIds,
        playbackMs: playbackRef.current,
        tempoScale: tempoRef.current,
        inputLatencyMs: micDetector.getEstimatedInputLatencyMs(),
        detected: result,
        waitingNoteId: waitingRef.current?.id,
      });
      if (judgement.kind === 'ignored') return;
      if (judgement.kind === 'wrong') {
        if (result.pluckId !== lastFeedbackPluck.current) {
          lastFeedbackPluck.current = result.pluckId;
          updateNotes(notesRef.current.map((note) => note.id === judgement.expected.id
            ? { ...note, mistakeCount: (note.mistakeCount || 0) + 1 }
            : note
          ));
          setFeedback({ text: `Wrong note · play ${noteName(judgement.expected)}`, kind: 'wrong', at: performance.now() });
        }
        return;
      }
      const matched = judgement.note;
      // A sustained note cannot satisfy another pick. Retain legato support.
      if (result.pluckId === lastConsumedPluck.current &&
          !(lastHitNote.current && (matched.isHammerOn || matched.isPullOff) && expectedMidi(matched) !== expectedMidi(lastHitNote.current))) return;
      lastConsumedPluck.current = result.pluckId;
      lastHitNote.current = matched;
      updateNotes(notesRef.current.map((note) => note.id === matched.id ? { ...note, hitState: 'hit', timingOffsetMs: judgement.timingOffsetMs } : note));
      waitingRef.current = null;
      setWaiting(null);
      setFeedback({ text: 'Correct note', kind: 'correct', timing: judgement.timing === 'on-time' ? undefined : judgement.timing.toUpperCase(), at: performance.now() });
    });
  }, [withAudio, scorableIds]);

  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previousTime;
      previousTime = now;
      if (playingRef.current && !completedRef.current) {
        const previous = playbackRef.current;
        let next = Math.min(duration, previous + elapsed * tempoRef.current);
        const activeLoop = loopEnabledRef.current ? loopBoundaries(bars, loopRangeRef.current) : null;
        const loopAdvance = activeLoop && advanceLoop(next, activeLoop);
        const wrapped = loopAdvance?.wrapped || false;
        if (loopAdvance) next = loopAdvance.playbackMs;
        if (wrapped && activeLoop) clearLoopPass(activeLoop);
        if (waitModeRef.current && withAudio) {
          const gated = applyWaitGate(notesRef.current, scorableIds, next);
          next = gated.playbackMs;
          if (waitingRef.current?.id !== gated.waitingNote?.id) {
            waitingRef.current = gated.waitingNote;
            setWaiting(gated.waitingNote);
          }
        }
        if (withAudio && !waitModeRef.current && !wrapped) {
          const missedIds = missedNoteIds(notesRef.current, scorableIds, next, tempoRef.current);
          if (missedIds.size > 0) {
            const judged = notesRef.current.map((note) => missedIds.has(note.id) ? { ...note, hitState: 'miss' as const } : note);
            updateNotes(judged);
            setFeedback({ text: 'Missed note', kind: 'wrong', at: now });
          }
        }
        if (!withAudio && !wrapped) {
          for (const note of song.notes) {
            if (note.timestampMs >= previous && note.timestampMs < next) guitarSynth.playGuitarNote(note.string, note.fret, note);
          }
        }
        playbackRef.current = next;
        setPlaybackMs(next);
        if (next >= duration && !loopEnabledRef.current) finish();
      }
      if (!completedRef.current) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); guitarSynth.stop(); };
  }, [song, bars, duration, withAudio, scorableIds]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('button, input, select, textarea, [contenteditable]')) return;
      if (event.code === 'Space') { event.preventDefault(); if (!inputError) setTransport(!playingRef.current); }
      if (event.key.toLowerCase() === 'w' && withAudio && !inputError) changeWaitMode();
    };
    const onVisibility = () => { if (document.hidden) setTransport(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', onVisibility); };
  }, [withAudio, inputError]);

  const recentFeedback = feedback && performance.now() - feedback.at < 1200 ? feedback : null;
  const currentNote = [...notes].reverse().find((note) => note.timestampMs <= playbackMs);
  const currentBar = barAt(bars, playbackMs)?.index || currentNote?.measureIndex || 1;

  return (
    <main className="practice-screen" aria-labelledby="practice-heading">
      <header className="practice-header">
        <div><span className="wordmark">GuitarCoach</span><h1 id="practice-heading">{song.title}</h1></div>
        <button className="text-button" onClick={finish}>Finish practice</button>
      </header>
      <div className="practice-controls" aria-label="Playback controls">
        <button className="primary-button play-button" onClick={() => setTransport(!playingRef.current)} disabled={Boolean(inputError)}>{playing ? 'Pause' : 'Play'}</button>
        <label className="tempo-control">Tempo<select aria-label="Tempo" value={tempoPercent} onChange={(event) => onTempoPercentChange(Number(event.target.value))}>{[50, 70, 80, 90, 100].map((percent) => <option key={percent} value={percent}>{percent}%</option>)}</select></label>
        <button className="toggle-button" aria-pressed={loopEnabled} onClick={changeLoop} disabled={Boolean(inputError)}>Loop <span>{loopEnabled ? 'On' : 'Off'}</span></button>
        {loopEnabled && <div className="loop-range" aria-label="Loop range">
          <label>From bar<select aria-label="Loop from bar" value={loopRange.startBar} onChange={(event) => changeLoopRange({ startBar: Number(event.target.value), endBar: loopRange.endBar })}>{bars.map((bar) => <option key={bar.index} value={bar.index}>{bar.index}</option>)}</select></label>
          <label>To bar<select aria-label="Loop to bar" value={loopRange.endBar} onChange={(event) => changeLoopRange({ startBar: loopRange.startBar, endBar: Number(event.target.value) })}>{bars.map((bar) => <option key={bar.index} value={bar.index}>{bar.index}</option>)}</select></label>
        </div>}
        {withAudio && <button className="toggle-button" aria-pressed={waitMode} onClick={changeWaitMode} disabled={Boolean(inputError)} title="Wait for each correct note before continuing">Wait Mode <span>{waitMode ? 'On' : 'Off'}</span></button>}
        <span className="bar-position">{loopEnabled ? `Loop ${loopRange.startBar}–${loopRange.endBar}` : `Bar ${currentBar} / ${bars.length}`}</span>
      </div>
      <div className="practice-status">
        <p className={inputError ? 'error-message' : recentFeedback?.kind || ''} role="status">
          {inputError || (!playing ? 'Paused' : recentFeedback?.text || (waiting ? `Waiting for ${noteName(waiting)}` : withAudio ? 'Listening · play along' : 'Playback only · audio input is off'))}
          {playing && !waiting && recentFeedback?.timing && <span className="timing-feedback">{recentFeedback.timing}</span>}
        </p>
        {waitMode && <span className="muted">Playback waits until you play the correct note.</span>}
      </div>
      <TabCanvas notes={notes} playbackMs={playbackMs} tempo={song.tempo} waitingId={waiting?.id} />
      <progress className="practice-progress" max={duration} value={playbackMs} aria-label="Song progress" />
      <footer className="practice-footer"><span>{withAudio ? 'Your guitar audio is processed locally.' : 'Connect an input when loading a tab to get feedback.'}</span>{hasChords && <span>Single-note feedback only · chords are not scored.</span>}</footer>
    </main>
  );
}
