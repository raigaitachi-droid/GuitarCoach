import { expect, test } from '@playwright/test';
import { singleNoteIds, summarizePractice } from '../src/utils/practiceSession';
import { TabNote } from '../src/types';

const notes: TabNote[] = [
  { id: 'hit', string: 1, fret: 0, timestampMs: 1000, durationMs: 500, hitState: 'hit' },
  { id: 'miss', string: 2, fret: 0, timestampMs: 1500, durationMs: 500, hitState: 'miss' },
  { id: 'future', string: 3, fret: 0, timestampMs: 2000, durationMs: 500 },
];

test('partial sessions count judged notes and playback-only never claims accuracy', () => {
  expect(summarizePractice(notes, 70, true)).toMatchObject({ accuracy: 50, correct: 1, attempted: 2, tempoPercent: 70 });
  expect(summarizePractice(notes, 100, false)).toMatchObject({ accuracy: null, attempted: 0 });
  expect(summarizePractice([], 100, true).accuracy).toBeNull();
});

test('a simultaneous chord is excluded from monophonic scoring', () => {
  const chord = [...notes, { ...notes[2], id: 'chord-note', string: 4 }];
  expect([...singleNoteIds(chord)]).toEqual(['hit', 'miss']);
});
