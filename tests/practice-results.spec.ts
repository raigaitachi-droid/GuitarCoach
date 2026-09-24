import { expect, test } from '@playwright/test';
import { advanceLoop, applyWaitGate, findWeakSection, judgeDetectedPitch, loopBoundaries, missedNoteIds, resetLoopPass, singleNoteIds, summarizePractice } from '../src/utils/practiceSession';
import { ImportedSong, SongBar, TabNote } from '../src/types';

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
  expect([...missedNoteIds([target], scorableIds, 1360, 1)]).toEqual([]);
  expect([...missedNoteIds([target], scorableIds, 1361, 1)]).toEqual(['target']);
  expect([...missedNoteIds([target], scorableIds, 1181, 0.5)]).toEqual(['target']);
});

test('wait mode stops on the first unresolved single note and releases only after it is hit', () => {
  const first: TabNote = { id: 'first', string: 6, fret: 0, timestampMs: 1000, durationMs: 500 };
  const second: TabNote = { id: 'second', string: 5, fret: 0, timestampMs: 1500, durationMs: 500 };
  const scorableIds = new Set(['first', 'second']);

  expect(applyWaitGate([first, second], scorableIds, 1400)).toEqual({ playbackMs: 1000, waitingNote: first });
  expect(applyWaitGate([{ ...first, hitState: 'hit' }, second], scorableIds, 1400)).toEqual({ playbackMs: 1400, waitingNote: null });
  expect(applyWaitGate([{ ...first, hitState: 'hit' }, second], scorableIds, 1600)).toEqual({ playbackMs: 1500, waitingNote: second });
});

test('loop uses exact bar boundaries and resets only its selected pass', () => {
  const bars: SongBar[] = [
    { index: 1, sourceMeasureIndex: 1, startMs: 0, endMs: 1000, timeSignature: '4/4' },
    { index: 2, sourceMeasureIndex: 2, startMs: 1500, endMs: 2350, timeSignature: '4/4' },
    { index: 3, sourceMeasureIndex: 3, startMs: 2350, endMs: 3100, timeSignature: '4/4' },
  ];
  const boundaries = loopBoundaries(bars, { startBar: 2, endBar: 3 })!;
  expect(boundaries).toEqual({ startMs: 1500, endMs: 3100 });
  expect(advanceLoop(3099, boundaries)).toEqual({ playbackMs: 3099, wrapped: false });
  expect(advanceLoop(3100, boundaries)).toEqual({ playbackMs: 1500, wrapped: true });

  const reset = resetLoopPass(notes, boundaries);
  expect(reset.find((note) => note.id === 'hit')?.hitState).toBe('hit');
  expect(reset.find((note) => note.id === 'miss')?.hitState).toBeUndefined();
  expect(reset.find((note) => note.id === 'future')?.hitState).toBeUndefined();
});

test('weak section needs meaningful played evidence and chooses the densest error cluster', () => {
  const bars: SongBar[] = [
    { index: 1, sourceMeasureIndex: 1, startMs: 0, endMs: 1000, timeSignature: '4/4' },
    { index: 2, sourceMeasureIndex: 2, startMs: 1000, endMs: 2000, timeSignature: '4/4' },
    { index: 3, sourceMeasureIndex: 3, startMs: 2000, endMs: 3000, timeSignature: '4/4' },
    { index: 4, sourceMeasureIndex: 4, startMs: 3000, endMs: 4000, timeSignature: '4/4' },
  ];
  const song = { bars, measures: 4 } as ImportedSong;
  const played: TabNote[] = [
    { id: 'one', string: 6, fret: 0, timestampMs: 100, durationMs: 100, hitState: 'hit' },
    { id: 'two', string: 6, fret: 1, timestampMs: 1100, durationMs: 100, hitState: 'miss' },
    { id: 'three', string: 6, fret: 2, timestampMs: 1500, durationMs: 100, mistakeCount: 1 },
    { id: 'four', string: 6, fret: 3, timestampMs: 2100, durationMs: 100, hitState: 'hit' },
  ];
  expect(findWeakSection(song, played)).toMatchObject({ startBar: 2, endBar: 2, attempted: 2, mistakes: 2 });
  expect(findWeakSection(song, [{ ...played[1], timestampMs: 3100 }])).toBeNull();
});
