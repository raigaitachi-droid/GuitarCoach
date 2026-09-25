import { TabNote } from '../types';

export interface PracticeResult {
  accuracy: number | null;
  correct: number;
  attempted: number;
  notes: TabNote[];
  tempoPercent: number;
  hadAudio: boolean;
}

// Only judged notes count. Stopping early must not penalize the unplayed tail.
export function summarizePractice(notes: TabNote[], tempoPercent: number, hadAudio: boolean): PracticeResult {
  const attempted = hadAudio ? notes.filter((note) => note.hitState && note.hitState !== 'unhit') : [];
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
