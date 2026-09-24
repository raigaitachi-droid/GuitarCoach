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
  expect(song.notes.every((note) => typeof note.expectedMidi === 'number')).toBe(true);
  expect(song.bars).toEqual(expect.arrayContaining([
    expect.objectContaining({ index: 1, sourceMeasureIndex: 1, startMs: 1000, timeSignature: '4/4' }),
  ]));
  expect(song.durationMs).toBeGreaterThanOrEqual(3500);
});
