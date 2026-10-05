import { useEffect, useMemo, useRef, useState } from 'react';
import { ImportedSong, TabNote } from '../types';
import { guitarSynth } from '../utils/guitarSynth';
import { micDetector, PitchResult } from '../utils/pitchDetector';
import { advanceLoop, applyWaitGate, expectedMidi, judgeDetectedChord, judgeDetectedPitch, loopBoundaries, missedNoteIds, noteLoopBoundaries, noteLoopRangeForBars, NoteLoopRange, normalizeLoopRange, normalizeNoteLoopRange, practiceBars, PracticeLoopRange, PracticeResult, resetLoopPass, shouldSuppressRepeatedWrongPitch, shouldSuppressStalePitchAfterAttack, shouldSuppressSustainedPitchDuringCooldown, singleNoteIds, summarizePractice, SUSTAINED_PITCH_COOLDOWN_MS, TIMING_WINDOW_MS } from '../utils/practiceSession';
import { TabCanvas } from './TabCanvas';
import { NoteHighway } from './NoteHighway';
import { SpeedControl } from './SpeedControl';
import { isLinkedLegato } from '../utils/practiceSession';
import { TIMING_FEEDBACK_THRESHOLD_MS } from '../utils/practiceSession';
import { POLY_COLLECTION_MS } from '../utils/polyphonicStream';

interface Props {
  song: ImportedSong;
  withAudio: boolean;
  tempoPercent: number;
  initialLoopRange?: PracticeLoopRange | null;
  onTempoPercentChange: (percent: number) => void;
  onFinish: (result: PracticeResult) => void;
}

interface LiveFeedbackStats {
  combo: number;
  bestCombo: number;
  attempted: number;
  correct: number;
  wrong: number;
  early: number;
  late: number;
  onTime: number;
}

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
function noteName(note: TabNote) {
  const midi = expectedMidi(note);
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function midiName(midi: number) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function barAt(bars: ReturnType<typeof practiceBars>, playbackMs: number) {
  if (bars.length && playbackMs < bars[0].startMs) return bars[0];
  return bars.find((bar) => playbackMs >= bar.startMs && playbackMs < bar.endMs) || bars.at(-1);
}

function loopNoteLabel(notes: TabNote[], noteId: string | undefined) {
  const index = notes.findIndex((note) => note.id === noteId);
  return index < 0 ? '—' : `Note ${index + 1}`;
}

function nearestChordTimestamp(notes: TabNote[], playbackMs: number): number | null {
  const groups = new Map<number, { count: number; unresolved: boolean }>();
  for (const note of notes) {
    const group = groups.get(note.timestampMs);
    if (group) { group.count++; group.unresolved ||= !note.hitState; }
    else groups.set(note.timestampMs, { count: 1, unresolved: !note.hitState });
  }
  let nearest: number | null = null;
  for (const [timestamp, group] of groups) {
    if (group.count > 1 && group.unresolved &&
        (nearest === null || Math.abs(timestamp - playbackMs) < Math.abs(nearest - playbackMs))) nearest = timestamp;
  }
  return nearest;
}

const emptyLiveStats = (): LiveFeedbackStats => ({
  combo: 0,
  bestCombo: 0,
  attempted: 0,
  correct: 0,
  wrong: 0,
  early: 0,
  late: 0,
  onTime: 0,
});

export function PlayingStage({ song, withAudio, tempoPercent, initialLoopRange, onTempoPercentChange, onFinish }: Props) {
  const bars = useMemo(() => practiceBars(song), [song]);
  const startingRange = normalizeLoopRange(initialLoopRange || { startBar: 1, endBar: 1 }, bars.length);
  const startingBoundaries = initialLoopRange ? loopBoundaries(bars, startingRange) : null;
  const startingNoteRange = startingBoundaries ? noteLoopRangeForBars(song.notes, startingBoundaries) : null;
  const initialNoteBoundaries = startingNoteRange ? noteLoopBoundaries(song.notes, startingNoteRange) : null;
  const [notes, setNotes] = useState<TabNote[]>(() => song.notes.map((note) => ({ ...note, hitState: undefined, mistakeCount: undefined })));
  const notesRef = useRef<TabNote[]>(notes);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const [playbackMs, setPlaybackMs] = useState(() => initialNoteBoundaries?.startMs || 0);
  const playbackRef = useRef(initialNoteBoundaries?.startMs || 0);
  // For live input, waiting is the safer default: browser/device latency should
  // never turn an otherwise playable note into an immediate missed note.
  const [waitMode, setWaitMode] = useState(withAudio);
  const waitModeRef = useRef(withAudio);
  const [waiting, setWaiting] = useState<TabNote | null>(null);
  const waitingRef = useRef<TabNote | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; kind: 'correct' | 'wrong'; timing?: string; at: number } | null>(null);
  const [liveStats, setLiveStats] = useState<LiveFeedbackStats>(() => emptyLiveStats());
  const [quickOnsetVisible, setQuickOnsetVisible] = useState(false);
  const [heardPitch, setHeardPitch] = useState<Pick<PitchResult, 'noteName' | 'frequency' | 'confidence'> | null>(null);
  const [heardChord, setHeardChord] = useState<number[]>([]);
  const [polyphonicError, setPolyphonicError] = useState<string | null>(null);
  const [chordTiming, setChordTiming] = useState<{ expectedToReadingMs: number; attackToReadingMs: number; workerMs: number | null } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(Boolean(startingNoteRange));
  const loopEnabledRef = useRef(Boolean(startingNoteRange));
  const [loopRange, setLoopRange] = useState<NoteLoopRange | null>(startingNoteRange);
  const loopRangeRef = useRef<NoteLoopRange | null>(startingNoteRange);
  const [selectingLoop, setSelectingLoop] = useState(false);
  const selectingLoopRef = useRef(false);
  const tempoRef = useRef(tempoPercent / 100);
  const completedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  const lastConsumedPluck = useRef(-1);
  const lastFeedbackPluck = useRef(-1);
  const lastHitNote = useRef<TabNote | null>(null);
  const lastJudgedAttack = useRef<{ midiNumber: number; pluckId: number } | null>(null);
  const pendingAttackAudioTime = useRef<number | null>(null);
  const sustainedPitchCooldownUntil = useRef(-Infinity);
  const chordAttackTarget = useRef<number | null>(null);
  const chordAttacks = useRef<{ audioTimeMs: number; expectedTimestampMs: number; timingOffsetMs: number; expiresAt: number }[]>([]);
  const lastHeardPitchUpdate = useRef(0);
  const quickOnsetTimer = useRef<number | null>(null);
  const scorableIds = useMemo(() => singleNoteIds(song.notes), [song]);
  const waitNoteIds = useMemo(() => new Set(song.notes.map((note) => note.id)), [song]);
  const hasChords = scorableIds.size !== song.notes.length;
  const duration = useMemo(() => song.notes.reduce((end, note) =>
    Math.max(end, note.timestampMs + Math.max(note.durationMs, TIMING_WINDOW_MS + 100)), song.durationMs
  ), [song]);
  const liveAccuracy = liveStats.attempted ? Math.round(liveStats.correct / liveStats.attempted * 100) : null;

  // Keep the original event-driven detector and scrolling clock, with one owner
  // for a session. Transport state is synchronous so pause cannot award hits.
  const updateNotes = (next: TabNote[]) => { notesRef.current = next; setNotes(next); };
  const registerCorrect = (timing: 'early' | 'on-time' | 'late', count = 1) => {
    if (waitModeRef.current) return;
    setLiveStats((current) => {
      const combo = current.combo + count;
      return {
        ...current,
        combo,
        bestCombo: Math.max(current.bestCombo, combo),
        attempted: current.attempted + count,
        correct: current.correct + count,
        early: current.early + (timing === 'early' ? count : 0),
        late: current.late + (timing === 'late' ? count : 0),
        onTime: current.onTime + (timing === 'on-time' ? count : 0),
      };
    });
  };
  const registerWrong = (count = 1) => {
    if (waitModeRef.current) return;
    setLiveStats((current) => ({
      ...current,
      combo: 0,
      attempted: current.attempted + count,
      wrong: current.wrong + count,
    }));
  };
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
    setFeedback(null);
    setLiveStats(emptyLiveStats());
    chordAttacks.current = [];
    chordAttackTarget.current = null;
    micDetector.clearPolyphonicHistory();
  };
  const clearLoopPass = (boundaries: NonNullable<ReturnType<typeof loopBoundaries>>) => {
    micDetector.clearPolyphonicHistory();
    updateNotes(resetLoopPass(notesRef.current, boundaries));
    waitingRef.current = null;
    setWaiting(null);
    lastConsumedPluck.current = -1;
    lastFeedbackPluck.current = -1;
    lastHitNote.current = null;
    lastJudgedAttack.current = null;
    pendingAttackAudioTime.current = null;
    chordAttacks.current = [];
    chordAttackTarget.current = null;
    sustainedPitchCooldownUntil.current = -Infinity;
    setFeedback(null);
    setLiveStats(emptyLiveStats());
    guitarSynth.stop();
  };
  const restartLoop = (range: NoteLoopRange) => {
    const boundaries = noteLoopBoundaries(song.notes, range);
    if (!boundaries) return;
    clearLoopPass(boundaries);
    playbackRef.current = boundaries.startMs;
    setPlaybackMs(boundaries.startMs);
  };
  const retryPractice = () => {
    const activeLoop = loopEnabledRef.current && loopRangeRef.current
      ? noteLoopBoundaries(song.notes, loopRangeRef.current)
      : null;
    const startMs = activeLoop?.startMs ?? initialNoteBoundaries?.startMs ?? 0;
    updateNotes(song.notes.map((note) => ({
      ...note,
      hitState: undefined,
      timingOffsetMs: undefined,
      mistakeCount: undefined,
    })));
    playbackRef.current = startMs;
    setPlaybackMs(startMs);
    completedRef.current = false;
    waitingRef.current = null;
    setWaiting(null);
    lastConsumedPluck.current = -1;
    lastFeedbackPluck.current = -1;
    lastHitNote.current = null;
    lastJudgedAttack.current = null;
    pendingAttackAudioTime.current = null;
    chordAttacks.current = [];
    chordAttackTarget.current = null;
    sustainedPitchCooldownUntil.current = -Infinity;
    setFeedback(null);
    setLiveStats(emptyLiveStats());
    setHeardPitch(null);
    setHeardChord([]);
    setChordTiming(null);
    setQuickOnsetVisible(false);
    if (quickOnsetTimer.current) {
      window.clearTimeout(quickOnsetTimer.current);
      quickOnsetTimer.current = null;
    }
    micDetector.clearPitchHistory();
    micDetector.clearPolyphonicHistory();
    guitarSynth.stop();
    setTransport(!inputError);
  };
  const changeLoop = () => {
    const nextEnabled = !loopEnabledRef.current;
    loopEnabledRef.current = nextEnabled;
    setLoopEnabled(nextEnabled);
    if (!nextEnabled) {
      selectingLoopRef.current = false;
      setSelectingLoop(false);
      return;
    }
    loopRangeRef.current = null;
    setLoopRange(null);
    selectingLoopRef.current = true;
    setSelectingLoop(true);
    setTransport(false);
  };
  const beginLoopSelection = () => {
    if (!loopEnabledRef.current) return;
    loopRangeRef.current = null;
    setLoopRange(null);
    selectingLoopRef.current = true;
    setSelectingLoop(true);
    setTransport(false);
  };
  const selectLoopNotes = (start: TabNote, end: TabNote) => {
    if (!loopEnabledRef.current || !selectingLoopRef.current) return;
    const range = normalizeNoteLoopRange(song.notes, { startNoteId: start.id, endNoteId: end.id });
    if (!range) return;
    const boundaries = noteLoopBoundaries(song.notes, range);
    if (!boundaries) return;
    loopRangeRef.current = range;
    setLoopRange(range);
    selectingLoopRef.current = false;
    setSelectingLoop(false);
    restartLoop(range);
  };
  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    setTransport(false);
    onFinishRef.current(summarizePractice(notesRef.current, Math.round(tempoRef.current * 100), withAudio, waitModeRef.current));
  };

  useEffect(() => { tempoRef.current = tempoPercent / 100; }, [tempoPercent]);
  useEffect(() => { onFinishRef.current = onFinish; }, [onFinish]);
  useEffect(() => {
    micDetector.setPolyphonicEnabled(withAudio && hasChords);
    return () => micDetector.setPolyphonicEnabled(false);
  }, [withAudio, hasChords]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1200);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!withAudio) {
      micDetector.setExpectedString(null);
      micDetector.setExpectedHarmonicMidi(null);
      return;
    }
    const unresolved = notes.filter((note) => (waitMode ? waitNoteIds : scorableIds).has(note.id) && !note.hitState);
    const expected = waiting || unresolved.sort((a, b) =>
      Math.abs(a.timestampMs - playbackMs) - Math.abs(b.timestampMs - playbackMs)
    )[0];
    micDetector.setExpectedString(expected?.string ?? null);
    micDetector.setExpectedHarmonicMidi(expected?.isHarmonic ? expectedMidi(expected) : null);
  }, [withAudio, notes, playbackMs, waiting, scorableIds, waitMode, waitNoteIds]);

  useEffect(() => {
    if (!withAudio) return;
    return micDetector.subscribe((result) => {
      if (!micDetector.getIsListening()) {
        setTransport(false);
        setHeardPitch(null);
        setInputError(micDetector.getErrorMessage() || 'We can’t hear your guitar. Check your input device and try again.');
        return;
      }
      if (!result || !playingRef.current || completedRef.current) return;
      if (result.quickOnset) {
        pendingAttackAudioTime.current = result.audioTimeMs;
        const expectedTimestampMs = nearestChordTimestamp(notesRef.current, playbackRef.current);
        if (expectedTimestampMs !== null && Math.abs(expectedTimestampMs - playbackRef.current) <= TIMING_WINDOW_MS * tempoRef.current) {
          if (chordAttackTarget.current !== expectedTimestampMs) {
            micDetector.beginPolyphonicAttack(result.audioTimeMs);
            chordAttackTarget.current = expectedTimestampMs;
          }
          chordAttacks.current.push({
              audioTimeMs: result.audioTimeMs,
              expectedTimestampMs,
              expiresAt: performance.now() + POLY_COLLECTION_MS + 100,
              timingOffsetMs: Math.round((playbackRef.current - expectedTimestampMs) / tempoRef.current - micDetector.getEstimatedInputLatencyMs()),
            });
          if (chordAttacks.current.length > 16) chordAttacks.current.shift();
        }
        setHeardPitch(null);
        setHeardChord([]);
        setQuickOnsetVisible(true);
        if (quickOnsetTimer.current) window.clearTimeout(quickOnsetTimer.current);
        quickOnsetTimer.current = window.setTimeout(() => setQuickOnsetVisible(false), 180);
        return;
      }
      if (result.polyphonicError) {
        setPolyphonicError(result.polyphonicError);
        return;
      }
      if (result.polyphonicMidiNumbers) {
        setHeardChord(result.polyphonicMidiNumbers);
        const fresh = result.polyphonicFreshMidiNumbers || [];
        if (!fresh.length) return;
        // Bind every progressive reading to its original attack, not to a newer
        // transient that arrived while the worker was analysing the audio.
        const attackTime = result.polyphonicAttackAudioTimeMs ?? result.audioTimeMs;
        const pending = [...chordAttacks.current].reverse().find((attack) => attack.audioTimeMs <= attackTime + 1);
        if (pending && attackTime - pending.audioTimeMs < 250) {
          const timing = {
            expectedToReadingMs: Math.round(playbackRef.current - pending.expectedTimestampMs),
            attackToReadingMs: Math.round(result.audioTimeMs - pending.audioTimeMs),
            workerMs: result.polyphonicRoundTripMs === undefined ? null : Math.round(result.polyphonicRoundTripMs),
          };
          setChordTiming(timing);
          console.info('[GuitarCoach chord timing]', { ...timing, midiNumbers: result.polyphonicMidiNumbers });
          const chord = judgeDetectedChord(
            notesRef.current,
            pending.expectedTimestampMs,
            fresh,
            waitModeRef.current ? 0 : undefined
          );
          if (chord.kind === 'resolved') {
            const group = notesRef.current.filter(note => note.timestampMs === pending.expectedTimestampMs);
            const totalHits = group.filter(note => note.hitState === 'hit' || note.hitState === 'close').length + chord.matched.length;
            const complete = totalHits === group.length;
            if (complete) {
              micDetector.finishPolyphonicAttack(attackTime);
              chordAttacks.current = chordAttacks.current.filter(attack => attack.audioTimeMs > result.audioTimeMs);
            }
            if (waitModeRef.current) {
              // Practice each unresolved chord tone; a partial reading must
              // never mark the remaining strings missed or award them for free.
              if (waitingRef.current?.timestampMs === pending.expectedTimestampMs && chord.matched.length) {
                lastConsumedPluck.current = Math.max(lastConsumedPluck.current, result.pluckId);
                micDetector.clearPitchHistory();
                const matchedIds = new Set(chord.matched.map((note) => note.id));
                updateNotes(notesRef.current.map((note) => matchedIds.has(note.id)
                  ? { ...note, hitState: 'hit', timingOffsetMs: undefined } : note));
                if (matchedIds.has(waitingRef.current.id)) {
                  waitingRef.current = null;
                  setWaiting(null);
                }
                setFeedback({ text: 'Correct note', kind: 'correct', at: performance.now() });
              }
              return;
            }
            if (chord.matched.length) lastConsumedPluck.current = Math.max(lastConsumedPluck.current, result.pluckId);
            const hitIds = new Set(chord.matched.map((note) => note.id));
            const wrongId = chord.matched.length ? null : chord.expected[0]?.id;
            updateNotes(notesRef.current.map((note) => {
              if (hitIds.has(note.id)) return { ...note, hitState: 'hit', timingOffsetMs: pending.timingOffsetMs };
              return note.id === wrongId ? { ...note, mistakeCount: (note.mistakeCount || 0) + 1 } : note;
            }));
            micDetector.clearPitchHistory();
            const chordTimingLabel = pending.timingOffsetMs < -TIMING_FEEDBACK_THRESHOLD_MS ? 'early'
              : pending.timingOffsetMs > TIMING_FEEDBACK_THRESHOLD_MS ? 'late' : 'on-time';
            setFeedback({
              text: complete
                ? `Correct chord · ${totalHits}/${group.length}`
                : `Chord · ${totalHits}/${group.length}`,
              kind: chord.matched.length ? 'correct' : 'wrong',
              timing: complete && chordTimingLabel !== 'on-time' ? chordTimingLabel.toUpperCase() : undefined,
              at: performance.now(),
            });
            if (chord.matched.length) registerCorrect(chordTimingLabel, chord.matched.length);
          }
        }
        return;
      }
      if (shouldSuppressStalePitchAfterAttack(
        pendingAttackAudioTime.current,
        result.audioTimeMs,
        result.onset
      )) return;
      if (shouldSuppressSustainedPitchDuringCooldown(
        sustainedPitchCooldownUntil.current,
        result.audioTimeMs,
        result.onset
      )) return;
      if (result.onset) pendingAttackAudioTime.current = null;
      // A small live readout makes hardware issues observable without adding a
      // separate tuner or diagnostic screen. Throttle re-renders to 8 Hz.
      if (performance.now() - lastHeardPitchUpdate.current >= 125) {
        lastHeardPitchUpdate.current = performance.now();
        setHeardPitch({ noteName: result.noteName, frequency: result.frequency, confidence: result.confidence });
      }
      // Correct notes can be accepted from a quieter pick transient. A wrong
      // note needs a cleaner pitch estimate so background noise cannot produce
      // distracting false-red feedback.
      if (result.isVoiceLike || (!result.onset && result.confidence < 0.56)) return;
      if (waitModeRef.current && !waitingRef.current) return;
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
        if (waitModeRef.current) return;
        // A previously accepted pick may still ring while Wait Mode advances
        // to the next note. It must not create a wrong attempt for that note.
        if (result.pluckId <= lastConsumedPluck.current || shouldSuppressRepeatedWrongPitch(lastJudgedAttack.current, result)) return;
        if (result.confidence < 0.68) return;
        if (result.pluckId !== lastFeedbackPluck.current) {
          lastFeedbackPluck.current = result.pluckId;
          lastJudgedAttack.current = { midiNumber: result.midiNumber, pluckId: result.pluckId };
          updateNotes(notesRef.current.map((note) => note.id === judgement.expected.id
            ? { ...note, mistakeCount: (note.mistakeCount || 0) + 1 }
            : note
          ));
          setFeedback({ text: `Wrong note · play ${noteName(judgement.expected)}`, kind: 'wrong', at: performance.now() });
          registerWrong();
        }
        return;
      }
      const matched = judgement.note;
      // A mono estimate from a mixed window may be an old ringing string.
      // Chord tones (including individually picked Wait Mode strings) must
      // pass the polyphonic worker's per-tone fresh-energy check.
      if (!scorableIds.has(matched.id)) return;
      // A sustained note cannot satisfy another pick. Retain legato support.
      if (result.pluckId <= lastConsumedPluck.current &&
          !isLinkedLegato(lastHitNote.current, matched)) return;
      lastConsumedPluck.current = result.pluckId;
      lastJudgedAttack.current = { midiNumber: result.midiNumber, pluckId: result.pluckId };
      lastHitNote.current = matched;
      sustainedPitchCooldownUntil.current = result.audioTimeMs + SUSTAINED_PITCH_COOLDOWN_MS;
      micDetector.clearPitchHistory();
      updateNotes(notesRef.current.map((note) => note.id === matched.id ? { ...note, hitState: 'hit', timingOffsetMs: waitModeRef.current ? undefined : judgement.timingOffsetMs } : note));
      waitingRef.current = null;
      setWaiting(null);
      setFeedback({ text: 'Correct note', kind: 'correct', timing: waitModeRef.current || judgement.timing === 'on-time' ? undefined : judgement.timing.toUpperCase(), at: performance.now() });
      registerCorrect(judgement.timing);
    });
  }, [withAudio, scorableIds]);

  useEffect(() => () => {
    if (quickOnsetTimer.current) window.clearTimeout(quickOnsetTimer.current);
  }, []);

  useEffect(() => {
    let frame = 0;
    let previousTime = performance.now();
    const tick = (now: number) => {
      const elapsed = now - previousTime;
      previousTime = now;
      if (playingRef.current && !completedRef.current) {
        const previous = playbackRef.current;
        let next = Math.min(duration, previous + elapsed * tempoRef.current);
        const activeLoop = loopEnabledRef.current && !selectingLoopRef.current && loopRangeRef.current
          ? noteLoopBoundaries(song.notes, loopRangeRef.current)
          : null;
        const loopAdvance = activeLoop && advanceLoop(next, activeLoop);
        const wrapped = loopAdvance?.wrapped || false;
        if (loopAdvance) next = loopAdvance.playbackMs;
        if (wrapped && activeLoop) {
          clearLoopPass(activeLoop);
        }
        if (waitModeRef.current && withAudio) {
          const gated = applyWaitGate(notesRef.current, waitNoteIds, next, activeLoop?.startMs);
          next = gated.playbackMs;
          if (waitingRef.current?.id !== gated.waitingNote?.id) {
            waitingRef.current = gated.waitingNote;
            setWaiting(gated.waitingNote);
          }
        }
        if (withAudio && !waitModeRef.current && !wrapped) {
          const missedIds = missedNoteIds(notesRef.current, waitNoteIds, next, tempoRef.current);
          // The attack was inside the existing timing window. Allow its
          // bounded audio collection/worker delivery to finish before a miss,
          // even when later strum strings arrive after the transport deadline.
          if (missedIds.size) {
            for (const note of notesRef.current) {
              if (missedIds.has(note.id) && chordAttacks.current.some(attack =>
                attack.expectedTimestampMs === note.timestampMs && now < attack.expiresAt)) missedIds.delete(note.id);
            }
          }
          if (missedIds.size > 0) {
            const judged = notesRef.current.map((note) => missedIds.has(note.id) ? { ...note, hitState: 'miss' as const } : note);
            updateNotes(judged);
            setFeedback({ text: 'Missed note', kind: 'wrong', at: now });
            registerWrong(missedIds.size);
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
  }, [song, bars, duration, withAudio, scorableIds, waitNoteIds]);

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
  const accuracyLabel = liveAccuracy === null ? '--' : `${liveAccuracy}%`;

  return (
    <main className="practice-screen" aria-labelledby="practice-heading">
      <header className="practice-header">
        <div><span className="wordmark">GuitarCoach</span><h1 id="practice-heading">{song.title}</h1></div>
        <div className="practice-header-actions">
          <button className="retry-button" onClick={retryPractice} aria-label="Retry practice" title="Retry practice">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.8 9.2a7.2 7.2 0 1 0 .2 5.1" />
              <path d="M18.9 4.8v4.7h-4.7" />
            </svg>
          </button>
          <button className="text-button" onClick={finish}>Finish practice</button>
        </div>
      </header>
      <div className="practice-controls" aria-label="Playback controls">
        <button className="primary-button play-button" onClick={() => setTransport(!playingRef.current)} disabled={Boolean(inputError)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{playing ? <path d="M8 6v12M16 6v12" /> : <path d="m9 6 9 6-9 6Z" />}</svg>
          {playing ? 'Pause' : 'Play'}
        </button>
        <SpeedControl originalBpm={song.tempo} percent={tempoPercent} disabled={Boolean(inputError)} onChange={percent => {
          tempoRef.current = percent / 100;
          onTempoPercentChange(percent);
        }} />
        <button className="toggle-button" aria-pressed={loopEnabled} onClick={changeLoop} disabled={Boolean(inputError)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10V7h15m-3-3 3 3-3 3M20 14v3H5m3 3-3-3 3-3" /></svg>
          Loop <span>{loopEnabled ? 'On' : 'Off'}</span>
        </button>
        {loopEnabled && <div className="loop-range" aria-label="Loop range">
          <button className="text-button" onClick={beginLoopSelection}>{selectingLoop ? 'Drag across notes' : 'Select notes'}</button>
          {!selectingLoop && loopRange && <span>{loopNoteLabel(song.notes, loopRange.startNoteId)} → {loopNoteLabel(song.notes, loopRange.endNoteId)}</span>}
        </div>}
        {withAudio && <button className="toggle-button" aria-pressed={waitMode} onClick={changeWaitMode} disabled={Boolean(inputError)} title="Wait for each correct note before continuing">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 7v5l3 2" /></svg>
          Wait Mode <span>{waitMode ? 'On' : 'Off'}</span>
        </button>}
        <span className="bar-position">{loopEnabled ? selectingLoop ? 'Drag from first note to last note' : loopRange ? `Loop ${loopNoteLabel(song.notes, loopRange.startNoteId)}–${loopNoteLabel(song.notes, loopRange.endNoteId)}` : 'Select loop notes' : `Bar ${currentBar} / ${bars.length}`}</span>
      </div>
      <div className="practice-status">
        <p className={inputError ? 'error-message' : recentFeedback?.kind || ''} role="status">
          {inputError || (!playing ? 'Paused' : recentFeedback?.text || (waiting ? `Waiting for ${noteName(waiting)}` : withAudio ? 'Listening · play along' : 'Playback only · audio input is off'))}
          {playing && !waiting && recentFeedback?.timing && <span className="timing-feedback">{recentFeedback.timing}</span>}
        </p>
        <div className="status-detail">
          {withAudio && heardPitch && <span className="detector-readout">Heard {heardPitch.noteName} · {heardPitch.frequency.toFixed(1)} Hz · {Math.round(heardPitch.confidence * 100)}%</span>}
          {withAudio && quickOnsetVisible && <span className="detector-readout onset-marker">Note attack detected</span>}
          {withAudio && heardChord.length > 1 && <span className="detector-readout">Heard chord: {heardChord.map(midiName).join(' ')}</span>}
          {import.meta.env.DEV && chordTiming && <span className="detector-readout">Chord timing: {chordTiming.expectedToReadingMs >= 0 ? '+' : ''}{chordTiming.expectedToReadingMs} ms from tab · {chordTiming.attackToReadingMs} ms from attack · {chordTiming.workerMs ?? '—'} ms worker</span>}
          {withAudio && polyphonicError && <span className="detector-readout">Chord recognition unavailable: {polyphonicError}</span>}
          {waitMode && <span className="muted">Playback waits until you play the correct note.</span>}
        </div>
      </div>
      {!waitMode && <section className="practice-feedback-hud" aria-label="Live practice feedback">
        <div className="hud-primary">
          <span>Combo</span>
          <strong>{liveStats.combo}</strong>
        </div>
        <div className="hud-grid">
          <span><b>{accuracyLabel}</b> accuracy</span>
          <span><b>{liveStats.correct}</b> correct</span>
          <span><b>{liveStats.wrong}</b> wrong</span>
          <span><b>{liveStats.bestCombo}</b> best</span>
          <span><b>{liveStats.early}</b> early</span>
          <span><b>{liveStats.late}</b> late</span>
        </div>
      </section>}
      {recentFeedback && (
        <div className={`practice-feedback-burst ${recentFeedback.kind}`} aria-hidden="true">
          <strong>{recentFeedback.text}</strong>
          {recentFeedback.timing && <span>{recentFeedback.timing}</span>}
        </div>
      )}
      {recentFeedback?.timing && (
        <div className={`practice-timing-callout ${recentFeedback.timing.toLowerCase()}`} aria-hidden="true">
          <span>{recentFeedback.timing === 'EARLY' ? '← EARLY' : 'LATE →'}</span>
        </div>
      )}
      <div className="practice-views">
        <NoteHighway notes={notes} playbackMs={playbackMs} />
        <TabCanvas notes={notes} playbackMs={playbackMs} tempo={song.tempo} waitingId={waiting?.id} loopStartId={loopRange?.startNoteId} loopEndId={loopRange?.endNoteId} selectingLoop={selectingLoop} onLoopSelect={selectLoopNotes} />
      </div>
      <progress className="practice-progress" max={duration} value={playbackMs} aria-label="Song progress" />
      <footer className="practice-footer"><span>{withAudio ? 'Your guitar audio is processed locally.' : 'Connect an input when loading a tab to get feedback.'}</span>{hasChords && <span>{waitMode ? 'Play every chord tone · you can pick the strings individually.' : polyphonicError ? 'Single-note feedback only · chord recognition is unavailable.' : 'Chord scoring: every detected matching tone counts.'}</span>}</footer>
    </main>
  );
}
