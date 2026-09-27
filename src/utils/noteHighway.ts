import type { TabNote } from '../types';

export const HIGHWAY_LOOKAHEAD_MS = 4500;
export const HIGHWAY_LENGTH = 36;
export const HIGHWAY_PAST_MS = 350;

// Low E on the left, high E on the right. Imported strings are numbered 1–6.
export function highwayLaneX(string: number): number {
  return (3.5 - string) * 1.38;
}

export function highwayNoteZ(timestampMs: number, playbackMs: number): number {
  return -(timestampMs - playbackMs) / HIGHWAY_LOOKAHEAD_MS * HIGHWAY_LENGTH;
}

export function highwayNotes(notes: readonly TabNote[]): TabNote[] {
  return notes.filter((note) => Number.isInteger(note.string) && note.string >= 1 && note.string <= 6 &&
    Number.isInteger(note.fret) && note.fret >= 0 && Number.isFinite(note.timestampMs))
    .slice().sort((a, b) => a.timestampMs - b.timestampMs);
}

// Binary search also handles loop rewinds without retaining a stale cursor.
export function firstHighwayNote(notes: readonly TabNote[], timestampMs: number): number {
  let low = 0;
  let high = notes.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (notes[mid].timestampMs < timestampMs) low = mid + 1;
    else high = mid;
  }
  return low;
}
