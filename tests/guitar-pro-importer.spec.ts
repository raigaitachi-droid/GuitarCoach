import { expect, test } from '@playwright/test';
import * as alphaTab from '@coderline/alphatab';
import { importGuitarProFile } from '../src/utils/guitarProImporter';

function exportedTab(alphaTex: string): Buffer {
  const importer = new alphaTab.importer.AlphaTexImporter();
  importer.initFromString(alphaTex, new alphaTab.Settings());
  return Buffer.from(new alphaTab.exporter.Gp7Exporter().export(importer.readScore()));
}

test('imports alphaTab playback timing and exposes real bar boundaries', async () => {
  const source = exportedTab('\\title "Timing test" \\tempo 120 . 0.6.4 2.6.8 3.6.8 5.6.16 7.6.16');
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const file = new File([
    bytes.buffer,
  ], 'timing.gp7', { type: 'application/octet-stream' });

  const song = await importGuitarProFile(file);

  expect(song.title).toBe('Timing test');
  expect(song.notes.map((note) => note.timestampMs)).toEqual([1000, 1500, 1750, 2000, 2125]);
  expect(song.notes.map((note) => note.durationMs)).toEqual([500, 250, 250, 125, 125]);
  // AlphaTab's realValue is the sounding MIDI pitch: string tuning + fret.
  // These are E2, F#2, G2, A2, and B2 on the low E string.
  expect(song.notes.map((note) => note.expectedMidi)).toEqual([40, 42, 43, 45, 47]);
  expect(song.bars).toEqual(expect.arrayContaining([
    expect.objectContaining({ index: 1, sourceMeasureIndex: 1, startMs: 1000, timeSignature: '4/4' }),
  ]));
  expect(song.durationMs).toBeGreaterThanOrEqual(3500);
});

test('imports string bends as playable note metadata', async () => {
  const source = exportedTab('\\title "Bend test" \\tempo 120 . 3.3{b (0 4)}.4');
  const bytes = new Uint8Array(source.byteLength);
  bytes.set(source);
  const file = new File([
    bytes.buffer,
  ], 'bend.gp7', { type: 'application/octet-stream' });

  const song = await importGuitarProFile(file);

  expect(song.notes).toHaveLength(1);
  expect(song.notes[0]).toEqual(expect.objectContaining({
    fret: 3,
    isBend: true,
    technique: 'bend',
  }));
});

test('imports natural 7th-fret harmonics with their sounding pitches and correct type', async () => {
  const source = exportedTab('\\title "Harmonics" \\tempo 120 . 7.2{nh}.4 7.3{nh}.4 7.2.4');
  const song = await importGuitarProFile(new File([new Uint8Array(source)], 'harmonics.gp'));
  expect(song.notes.map((note) => note.expectedMidi)).toEqual([78, 74, 66]);
  expect(song.notes.slice(0, 2)).toEqual([
    expect.objectContaining({ string: 2, fret: 7, isHarmonic: true, harmonicType: 'natural' }),
    expect.objectContaining({ string: 3, fret: 7, isHarmonic: true, harmonicType: 'natural' }),
  ]);
  expect(song.notes[2].isHarmonic).toBe(false);
});
