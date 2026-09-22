import * as alphaTab from '@coderline/alphatab';
import { ImportedSong, TabNote } from '../types';

const SUPPORTED_EXTENSIONS = ['.gp', '.gpx', '.gp3', '.gp4', '.gp5'];

export function isSupportedGuitarProFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export async function importGuitarProFile(file: File): Promise<ImportedSong> {
  if (!isSupportedGuitarProFile(file)) {
    throw new Error('Поддържани формати: .gp, .gpx, .gp3, .gp4 и .gp5');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
    bytes,
    new alphaTab.Settings()
  );

  const track =
    score.tracks.find((candidate) =>
      candidate.staves.some((staff) => staff.tuning.length >= 4)
    ) || score.tracks[0];

  if (!track) {
    throw new Error('Файлът не съдържа партия, която може да бъде импортирана.');
  }

  const tempo = Math.max(1, Math.round(score.tempo || 120));
  const quarterNoteMs = 60000 / tempo;
  const ticksPerQuarter = 960;
  const notes: TabNote[] = [];
  let noteIndex = 0;

  for (const staff of track.staves) {
    const stringCount = staff.tuning.length || 6;
    for (const bar of staff.bars) {
      for (const voice of bar.voices) {
        for (const beat of voice.beats) {
          if (beat.isRest) continue;

          const timestampMs =
            1000 + (beat.absolutePlaybackStart / ticksPerQuarter) * quarterNoteMs;
          const durationValue = Number(beat.duration) || 4;
          const durationMs = Math.max(
            100,
            Math.round((quarterNoteMs * 4) / Math.max(1, durationValue))
          );

          for (const note of beat.notes) {
            if (note.fret < 0 || note.string < 1) continue;

            // alphaTab numbers string 1 from the lowest string; GuitarCoach
            // numbers string 1 from the highest string.
            const guitarCoachString = stringCount - note.string + 1;
            if (guitarCoachString < 1 || guitarCoachString > 6) continue;

            notes.push({
              id: `import-${noteIndex++}`,
              string: guitarCoachString,
              fret: Math.round(note.fret),
              timestampMs: Math.round(timestampMs),
              durationMs,
            });
          }
        }
      }
    }
  }

  notes.sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);

  if (notes.length === 0) {
    throw new Error('Не бяха открити китарни ноти в избраната партия.');
  }

  const lastNote = notes[notes.length - 1];
  const fileTitle = file.name.replace(/\.(gp|gpx|gp3|gp4|gp5)$/i, '');
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title: score.title?.trim() || fileTitle,
    artist: score.artist?.trim() || 'Моя таблатура',
    tempo,
    durationMs: lastNote.timestampMs + lastNote.durationMs + 500,
    difficulty: 'Intermediate',
    tuning: track.staves[0]?.tuningName || 'Guitar Pro tuning',
    key: 'Imported',
    attempts: 0,
    bestAccuracy: 0,
    measures: score.masterBars.length,
    notes,
    sourceFileName: file.name,
  };
}
