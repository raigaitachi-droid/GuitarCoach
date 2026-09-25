import { ImportedSong, SongBar, TabNote } from '../types';

export interface PracticeResult {
  accuracy: number | null;
  correct: number;
  attempted: number;
  notes: TabNote[];
  tempoPercent: number;
  hadAudio: boolean;
}

export interface WeakSection {
  startBar: number;
  endBar: number;
  attempted: number;
  mistakes: number;
}

// Only judged notes count. Stopping early must not penalize the unplayed tail.
export function summarizePractice(notes: TabNote[], tempoPercent: number, hadAudio: boolean): PracticeResult {
  const attempted = hadAudio ? notes.filter((note) => (note.hitState && note.hitState !== 'unhit') || note.mistakeCount) : [];
  const correct = attempted.filter((note) => note.hitState === 'hit' || note.hitState === 'close').length;
  return {
    accuracy: attempted.length ? Math.round(correct / attempted.length * 100) : null,
    correct,
    attempted: attempted.length,
    notes: notes.map((note) => ({ ...note })),
    tempoPercent,
    hadAudio,
  };
}

export const STANDARD_TUNING = [64, 59, 55, 50, 45, 40];
// Browser capture and USB interfaces can add a meaningful delay. This is the
// real-time forgiveness window at 100% tempo; it scales with playback speed.
export const TIMING_WINDOW_MS = 480;
export const TIMING_FEEDBACK_THRESHOLD_MS = 80;
// ±50 cents is exactly the boundary of the nearest semitone. It is the widest
// useful tolerance: a slightly sharp/flat guitar note still counts, while the
// neighboring note does not.
export const PITCH_TOLERANCE_CENTS = 50;
export const FIRST_ONSET_SEMITONE_TOLERANCE = 1;

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function expectedMidi(note: TabNote): number {
  if (note.expectedMidi !== undefined) return note.expectedMidi;
  const open = STANDARD_TUNING[note.string - 1];
  if (note.isHarmonic && note.harmonicType === 'natural') {
    if (note.fret === 12) return open + 12;
    if (note.fret === 7 || note.fret === 19) return open + 19;
    if (note.fret === 5) return open + 24;
  }
  return open + note.fret;
}

// Monophonic V1: simultaneous notes remain visible but cannot earn a chord hit
// from a single detected pitch. Chord recognition is deliberately out of scope.
export function singleNoteIds(notes: TabNote[]): Set<string> {
  const counts = new Map<number, number>();
  for (const note of notes) counts.set(note.timestampMs, (counts.get(note.timestampMs) || 0) + 1);
  return new Set(notes.filter((note) => counts.get(note.timestampMs) === 1).map((note) => note.id));
}

export interface DetectedPitch {
  midiNumber: number;
  cents: number;
  onset?: boolean;
}

export type PitchJudgement =
  | { kind: 'ignored' }
  | { kind: 'wrong'; expected: TabNote }
  | { kind: 'correct'; note: TabNote; timingOffsetMs: number; timing: 'early' | 'on-time' | 'late' };

interface JudgePitchOptions {
  notes: TabNote[];
  scorableIds: Set<string>;
  playbackMs: number;
  tempoScale: number;
  inputLatencyMs: number;
  detected: DetectedPitch;
  waitingNoteId?: string;
}

export function judgeDetectedPitch({
  notes,
  scorableIds,
  playbackMs,
  tempoScale,
  inputLatencyMs,
  detected,
  waitingNoteId,
}: JudgePitchOptions): PitchJudgement {
  const scale = Math.max(0.01, tempoScale);
  const effectivePlaybackMs = playbackMs - inputLatencyMs * scale;
  const windowMs = TIMING_WINDOW_MS * scale;
  const candidates = (waitingNoteId
    ? notes.filter((note) => note.id === waitingNoteId && !note.hitState)
    : notes.filter((note) =>
        scorableIds.has(note.id) &&
        !note.hitState &&
        Math.abs(note.timestampMs - effectivePlaybackMs) <= windowMs
      )
  ).sort((a, b) => Math.abs(a.timestampMs - effectivePlaybackMs) - Math.abs(b.timestampMs - effectivePlaybackMs));

  if (candidates.length === 0) return { kind: 'ignored' };

  const matched = candidates.find((note) => {
    const midiDifference = Math.abs(detected.midiNumber - expectedMidi(note));
    return detected.onset
      ? midiDifference <= FIRST_ONSET_SEMITONE_TOLERANCE
      : midiDifference === 0 && Math.abs(detected.cents) <= PITCH_TOLERANCE_CENTS;
  });
  if (!matched) return { kind: 'wrong', expected: candidates[0] };

  const timingOffsetMs = Math.round((effectivePlaybackMs - matched.timestampMs) / scale);
  const timing = timingOffsetMs < -TIMING_FEEDBACK_THRESHOLD_MS
    ? 'early'
    : timingOffsetMs > TIMING_FEEDBACK_THRESHOLD_MS
    ? 'late'
    : 'on-time';

  return { kind: 'correct', note: matched, timingOffsetMs, timing };
}

export function missedNoteIds(notes: TabNote[], scorableIds: Set<string>, playbackMs: number, tempoScale: number): Set<string> {
  const deadlineMs = TIMING_WINDOW_MS * Math.max(0.01, tempoScale);
  return new Set(notes
    .filter((note) => scorableIds.has(note.id) && !note.hitState && playbackMs - note.timestampMs > deadlineMs)
    .map((note) => note.id));
}

export interface WaitGateResult {
  playbackMs: number;
  waitingNote: TabNote | null;
}

export function applyWaitGate(notes: TabNote[], scorableIds: Set<string>, proposedPlaybackMs: number): WaitGateResult {
  const waitingNote = notes.find((note) =>
    scorableIds.has(note.id) && !note.hitState && note.timestampMs <= proposedPlaybackMs
  ) || null;

  return waitingNote
    ? { playbackMs: waitingNote.timestampMs, waitingNote }
    : { playbackMs: proposedPlaybackMs, waitingNote: null };
}

export interface PracticeLoopRange {
  startBar: number;
  endBar: number;
}

export interface NoteLoopRange {
  startNoteId: string;
  endNoteId: string;
}

export interface LoopPass {
  attempted: number;
  correct: number;
  accuracy: number | null;
}

export interface LoopBoundaries {
  startMs: number;
  endMs: number;
}

// Imported Guitar Pro files supply this exact, repeat-expanded timeline. The
// fallback keeps the demo song usable without inventing musical subdivisions.
export function practiceBars(song: ImportedSong): SongBar[] {
  if (song.bars?.length) return song.bars;

  const bars: SongBar[] = [];
  for (let index = 1; index <= song.measures; index++) {
    const inBar = song.notes.filter((note) => (note.measureIndex || 1) === index);
    const startMs = inBar.length ? Math.min(...inBar.map((note) => note.timestampMs)) : bars.at(-1)?.endMs || 0;
    const endMs = inBar.length
      ? Math.max(...inBar.map((note) => note.timestampMs + note.durationMs))
      : Math.max(startMs + 1, index === song.measures ? song.durationMs : startMs + 1);
    bars.push({ index, sourceMeasureIndex: index, startMs, endMs, timeSignature: '' });
  }
  return bars;
}

export function normalizeLoopRange(range: PracticeLoopRange, barCount: number): PracticeLoopRange {
  const startBar = Math.min(Math.max(1, range.startBar), barCount);
  return { startBar, endBar: Math.min(Math.max(startBar, range.endBar), barCount) };
}

export function loopBoundaries(bars: SongBar[], range: PracticeLoopRange): LoopBoundaries | null {
  if (!bars.length) return null;
  const normalized = normalizeLoopRange(range, bars.length);
  const selected = bars.slice(normalized.startBar - 1, normalized.endBar);
  return { startMs: selected[0].startMs, endMs: selected.at(-1)!.endMs };
}

export function normalizeNoteLoopRange(notes: TabNote[], range: NoteLoopRange): NoteLoopRange | null {
  const start = notes.find((note) => note.id === range.startNoteId);
  const end = notes.find((note) => note.id === range.endNoteId);
  if (!start || !end) return null;
  return start.timestampMs <= end.timestampMs
    ? range
    : { startNoteId: end.id, endNoteId: start.id };
}

// A practice loop starts exactly on the selected first note and ends after the
// selected last note's sustain, so it never rounds a guitarist's choice to a bar.
export function noteLoopBoundaries(notes: TabNote[], range: NoteLoopRange): LoopBoundaries | null {
  const normalized = normalizeNoteLoopRange(notes, range);
  if (!normalized) return null;
  const start = notes.find((note) => note.id === normalized.startNoteId)!;
  const end = notes.find((note) => note.id === normalized.endNoteId)!;
  return { startMs: start.timestampMs, endMs: Math.max(end.timestampMs + end.durationMs, start.timestampMs + 1) };
}

export function noteLoopRangeForBars(notes: TabNote[], boundaries: LoopBoundaries): NoteLoopRange | null {
  const selected = notes
    .filter((note) => note.timestampMs >= boundaries.startMs && note.timestampMs < boundaries.endMs)
    .sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
  return selected.length ? { startNoteId: selected[0].id, endNoteId: selected.at(-1)!.id } : null;
}

// Wrapping is calculated from absolute bar boundaries, so repeated passes do
// not accumulate timing drift.
export function advanceLoop(proposedPlaybackMs: number, boundaries: LoopBoundaries): { playbackMs: number; wrapped: boolean } {
  return proposedPlaybackMs >= boundaries.endMs
    ? { playbackMs: boundaries.startMs, wrapped: true }
    : { playbackMs: proposedPlaybackMs, wrapped: false };
}

// Each pass starts clean only inside the selected bars. Notes outside the loop
// retain their session history for the final practice result.
export function resetLoopPass(notes: TabNote[], boundaries: LoopBoundaries): TabNote[] {
  return notes.map((note) => note.timestampMs >= boundaries.startMs && note.timestampMs < boundaries.endMs
    ? { ...note, hitState: undefined, timingOffsetMs: undefined, mistakeCount: undefined }
    : note
  );
}

// Coach Mode needs one small, explainable signal: did this completed pass have
// enough evidence, and was it accurate enough to earn a tempo increase?
export function assessLoopPass(notes: TabNote[], scorableIds: Set<string>, boundaries: LoopBoundaries): LoopPass {
  const selected = notes.filter((note) =>
    scorableIds.has(note.id) &&
    note.timestampMs >= boundaries.startMs &&
    note.timestampMs < boundaries.endMs
  );
  const attempted = selected.filter((note) => (note.hitState && note.hitState !== 'unhit') || note.mistakeCount).length;
  const correct = selected.filter((note) => note.hitState === 'hit' || note.hitState === 'close').length;
  return { accuracy: attempted ? Math.round(correct / attempted * 100) : null, attempted, correct };
}

// This deliberately stays small and explainable: scan up to three adjacent
// played bars, ignore sparse data, then prefer the highest error concentration.
export function findWeakSection(song: ImportedSong, notes: TabNote[]): WeakSection | null {
  const bars = practiceBars(song);
  let best: WeakSection | null = null;

  for (let start = 0; start < bars.length; start++) {
    for (let end = start; end < Math.min(bars.length, start + 3); end++) {
      const selected = notes.filter((note) => note.timestampMs >= bars[start].startMs && note.timestampMs < bars[end].endMs);
      const attempted = selected.filter((note) => (note.hitState && note.hitState !== 'unhit') || note.mistakeCount).length;
      const mistakes = selected.reduce((total, note) => total + (note.mistakeCount || 0) + (note.hitState === 'miss' ? 1 : 0), 0);
      if (attempted < 2 || mistakes === 0) continue;
      const candidate = { startBar: bars[start].index, endBar: bars[end].index, attempted, mistakes };
      const candidateRate = candidate.mistakes / candidate.attempted;
      const bestRate = best ? best.mistakes / best.attempted : -1;
      if (!best || candidateRate > bestRate ||
        (candidateRate === bestRate && candidate.mistakes > best.mistakes) ||
        (candidateRate === bestRate && candidate.mistakes === best.mistakes && candidate.endBar - candidate.startBar < best.endBar - best.startBar)) {
        best = candidate;
      }
    }
  }
  return best;
}
