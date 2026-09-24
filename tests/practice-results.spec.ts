import { expect, test } from '@playwright/test';
import { judgeDetectedPitch, missedNoteIds, singleNoteIds, summarizePractice } from '../src/utils/practiceSession';
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

test('pitch judgement applies latency, timing windows, and cents tolerance consistently', () => {
  const target: TabNote = { id: 'target', string: 6, fret: 0, expectedMidi: 40, timestampMs: 1000, durationMs: 500 };
  const scorableIds = new Set(['target']);
  const base = { notes: [target], scorableIds, tempoScale: 1, inputLatencyMs: 30, detected: { midiNumber: 40, cents: 0 } };

  expect(judgeDetectedPitch({ ...base, playbackMs: 1030 })).toMatchObject({ kind: 'correct', timing: 'on-time', timingOffsetMs: 0 });
  expect(judgeDetectedPitch({ ...base, playbackMs: 910 })).toMatchObject({ kind: 'correct', timing: 'early', timingOffsetMs: -120 });
  expect(judgeDetectedPitch({ ...base, playbackMs: 1130 })).toMatchObject({ kind: 'correct', timing: 'late', timingOffsetMs: 100 });
  expect(judgeDetectedPitch({ ...base, playbackMs: 1030, detected: { midiNumber: 41, cents: 0 } })).toMatchObject({ kind: 'wrong', expected: target });
  expect(judgeDetectedPitch({ ...base, playbackMs: 1030, detected: { midiNumber: 40, cents: 47 } })).toMatchObject({ kind: 'wrong', expected: target });
});

test('misses are only assigned after the scaled timing deadline', () => {
  const target: TabNote = { id: 'target', string: 6, fret: 0, timestampMs: 1000, durationMs: 500 };
  const scorableIds = new Set(['target']);
  expect([...missedNoteIds([target], scorableIds, 1240, 1)]).toEqual([]);
  expect([...missedNoteIds([target], scorableIds, 1241, 1)]).toEqual(['target']);
  expect([...missedNoteIds([target], scorableIds, 1121, 0.5)]).toEqual(['target']);
});
