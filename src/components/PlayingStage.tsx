import { useEffect, useMemo, useRef, useState } from 'react';
import { ImportedSong, TabNote } from '../types';
import { guitarSynth } from '../utils/guitarSynth';
import { micDetector } from '../utils/pitchDetector';
import { expectedMidi, PracticeResult, singleNoteIds, summarizePractice } from '../utils/practiceSession';
import { TabCanvas } from './TabCanvas';

interface Props {
  song: ImportedSong;
  withAudio: boolean;
  tempoPercent: number;
  onTempoPercentChange: (percent: number) => void;
  onFinish: (result: PracticeResult) => void;
}

const TIMING_WINDOW_MS = 240;
const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function noteName(note: TabNote) {
  const midi = expectedMidi(note);
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function PlayingStage({ song, withAudio, tempoPercent, onTempoPercentChange, onFinish }: Props) {
  const [notes, setNotes] = useState<TabNote[]>(() => song.notes.map((note) => ({ ...note, hitState: undefined })));
  const notesRef = useRef<TabNote[]>(notes);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const [playbackMs, setPlaybackMs] = useState(0);
  const playbackRef = useRef(0);
  const [waitMode, setWaitMode] = useState(false);
  const waitModeRef = useRef(false);
  const [waiting, setWaiting] = useState<TabNote | null>(null);
  const waitingRef = useRef<TabNote | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: 'correct' | 'wrong'; timing?: string; at: number } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const tempoRef = useRef(tempoPercent / 100);
  const completedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const lastConsumedPluck = useRef(-1);
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
      const effectiveTime = playbackRef.current - micDetector.getEstimatedInputLatencyMs() * tempoRef.current;
      const windowMs = TIMING_WINDOW_MS * tempoRef.current;
      const candidates = waitingRef.current ? [waitingRef.current] : notesRef.current.filter((note) =>
        scorableIds.has(note.id) && !note.hitState && Math.abs(note.timestampMs - effectiveTime) <= windowMs
      ).sort((a, b) => Math.abs(a.timestampMs - effectiveTime) - Math.abs(b.timestampMs - effectiveTime));
      if (!candidates.length) return;
      const matched = candidates.find((note) => result.midiNumber === expectedMidi(note) && Math.abs(result.cents) <= 46);
      if (!matched) {
        if (result.pluckId !== lastConsumedPluck.current) {
          setFeedback({ text: `Wrong note · play ${noteName(candidates[0])}`, kind: 'wrong', at: performance.now() });
        }
        return;
      }
      // A sustained note cannot satisfy another pick. Retain legato support.
      if (result.pluckId === lastConsumedPluck.current &&
          !(lastHitNote.current && (matched.isHammerOn || matched.isPullOff) && expectedMidi(matched) !== expectedMidi(lastHitNote.current))) return;
      lastConsumedPluck.current = result.pluckId;
      lastHitNote.current = matched;
      const offset = waitingRef.current ? 0 : Math.round((effectiveTime - matched.timestampMs) / tempoRef.current);
      updateNotes(notesRef.current.map((note) => note.id === matched.id ? { ...note, hitState: 'hit', timingOffsetMs: offset } : note));
      waitingRef.current = null;
      setWaiting(null);
      setFeedback({ text: 'Correct note', kind: 'correct', timing: Math.abs(offset) > 80 ? offset < 0 ? 'EARLY' : 'LATE' : undefined, at: performance.now() });
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
        if (waitModeRef.current && withAudio) {
          const target = notesRef.current.find((note) => scorableIds.has(note.id) && !note.hitState && note.timestampMs <= next);
          if (target) {
            next = target.timestampMs;
            if (waitingRef.current?.id !== target.id) { waitingRef.current = target; setWaiting(target); }
          }
        }
        if (withAudio && !waitModeRef.current) {
          let missed = false;
          const judged = notesRef.current.map((note) => {
            if (scorableIds.has(note.id) && !note.hitState && next - note.timestampMs > TIMING_WINDOW_MS * tempoRef.current) {
              missed = true;
              return { ...note, hitState: 'miss' as const };
            }
            return note;
          });
          if (missed) {
            updateNotes(judged);
            setFeedback({ text: 'Missed note', kind: 'wrong', at: now });
          }
        }
        if (!withAudio) {
          for (const note of song.notes) {
            if (note.timestampMs >= previous && note.timestampMs < next) guitarSynth.playGuitarNote(note.string, note.fret, note);
          }
        }
        playbackRef.current = next;
        setPlaybackMs(next);
        if (next >= duration) finish();
      }
      if (!completedRef.current) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); guitarSynth.stop(); };
  }, [song, duration, withAudio, scorableIds]);

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
  const currentBar = currentNote?.measureIndex || 1;

  return (
    <main className="practice-screen" aria-labelledby="practice-heading">
      <header className="practice-header">
        <div><span className="wordmark">GuitarCoach</span><h1 id="practice-heading">{song.title}</h1></div>
        <button className="text-button" onClick={finish}>Finish practice</button>
      </header>
      <div className="practice-controls" aria-label="Playback controls">
        <button className="primary-button play-button" onClick={() => setTransport(!playingRef.current)} disabled={Boolean(inputError)}>{playing ? 'Pause' : 'Play'}</button>
        <label className="tempo-control">Tempo<select aria-label="Tempo" value={tempoPercent} onChange={(event) => onTempoPercentChange(Number(event.target.value))}>{[50, 70, 80, 90, 100].map((percent) => <option key={percent} value={percent}>{percent}%</option>)}</select></label>
        {withAudio && <button className="toggle-button" aria-pressed={waitMode} onClick={changeWaitMode} disabled={Boolean(inputError)} title="Wait for each correct note before continuing">Wait Mode <span>{waitMode ? 'On' : 'Off'}</span></button>}
        <span className="bar-position">Bar {currentBar} / {song.measures}</span>
      </div>
      <div className="practice-status">
        <p className={inputError ? 'error-message' : recentFeedback?.kind || ''} role="status">
          {inputError || (!playing ? 'Paused' : waiting ? `Waiting for ${noteName(waiting)}` : recentFeedback?.text || (withAudio ? 'Listening · play along' : 'Playback only · audio input is off'))}
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
