import * as alphaTab from '@coderline/alphatab';
import { ImportedSong, SongSection, TabNote } from '../types';
import { detectArpeggioPassages } from './musicAnalysis/arpeggioAnalyzer';

const SUPPORTED_EXTENSIONS = ['.gp', '.gpx', '.gp3', '.gp4', '.gp5'];

export function isSupportedGuitarProFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

interface MeasureSummary {
  measureIndex: number;
  startMs: number;
  endMs: number;
  noteCount: number;
  uniqueFrets: number;
  patternHash: string;
}

function normalizeSectionName(rawName: string): string {
  const name = rawName.trim();
  if (!name) return 'Section';

  const lower = name.toLowerCase();
  if (lower.includes('intro')) return 'Intro';
  if (lower.includes('verse') || lower.includes('куплет')) return 'Verse';
  if (lower.includes('pre') && lower.includes('chorus')) return 'Pre-Chorus';
  if (lower.includes('chorus') || lower.includes('припев')) return 'Chorus';
  if (lower.includes('bridge')) return 'Bridge';
  if (lower.includes('solo')) return 'Solo';
  if (lower.includes('outro') || lower.includes('coda')) return 'Outro';

  return name.length > 18 ? `${name.slice(0, 18)}…` : name;
}

function getMasterBarSectionName(masterBar: unknown): string | null {
  const bar = masterBar as Record<string, unknown>;
  const candidates = [
    bar.section,
    bar.marker,
    bar.sectionName,
    bar.markerName,
    bar.alternateEndings,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate === 'string' && candidate.trim()) {
      return normalizeSectionName(candidate);
    }
    if (typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      const text =
        obj.text ||
        obj.title ||
        obj.name ||
        obj.marker ||
        obj.section ||
        obj.value;
      if (typeof text === 'string' && text.trim()) {
        return normalizeSectionName(text);
      }
    }
  }

  return null;
}

function buildMeasureSummaries(
  notes: TabNote[],
  measureCount: number,
  fallbackDurationMs: number
): MeasureSummary[] {
  const safeMeasureCount = Math.max(1, measureCount);
  const averageMeasureMs = Math.max(1200, fallbackDurationMs / safeMeasureCount);

  return Array.from({ length: safeMeasureCount }, (_, index) => {
    const measureIndex = index + 1;
    const measureNotes = notes.filter((note) => note.measureIndex === measureIndex);
    const firstNote = measureNotes[0];
    const lastNote = measureNotes[measureNotes.length - 1];
    const startMs = firstNote?.timestampMs ?? 1000 + index * averageMeasureMs;
    const endMs =
      lastNote?.timestampMs && lastNote?.durationMs
        ? lastNote.timestampMs + lastNote.durationMs
        : 1000 + (index + 1) * averageMeasureMs;
    const compactPattern = measureNotes
      .slice(0, 12)
      .map((note) => `${note.string}:${note.fret}`)
      .join('|');

    return {
      measureIndex,
      startMs: Math.round(startMs),
      endMs: Math.round(Math.max(endMs, startMs + averageMeasureMs * 0.5)),
      noteCount: measureNotes.length,
      uniqueFrets: new Set(measureNotes.map((note) => `${note.string}:${note.fret}`)).size,
      patternHash: compactPattern || 'rest',
    };
  });
}

function closeSection(
  sections: SongSection[],
  name: string,
  startMeasure: number,
  endMeasure: number,
  summaries: MeasureSummary[],
  confidence: 'marker' | 'auto'
) {
  const first = summaries[startMeasure - 1];
  const last = summaries[endMeasure - 1] || first;
  if (!first || !last || endMeasure < startMeasure) return;

  sections.push({
    id: `${confidence}-${sections.length}-${startMeasure}`,
    name,
    startMeasure,
    endMeasure,
    startMs: first.startMs,
    endMs: last.endMs,
    confidence,
  });
}

function detectMarkerSections(score: alphaTab.model.Score, summaries: MeasureSummary[]): SongSection[] {
  const markerStarts: Array<{ measure: number; name: string }> = [];

  score.masterBars.forEach((masterBar, index) => {
    const name = getMasterBarSectionName(masterBar);
    if (name) {
      markerStarts.push({ measure: index + 1, name });
    }
  });

  if (markerStarts.length === 0) return [];

  const sections: SongSection[] = [];
  markerStarts.forEach((marker, index) => {
    const next = markerStarts[index + 1];
    closeSection(
      sections,
      marker.name,
      marker.measure,
      next ? next.measure - 1 : summaries.length,
      summaries,
      'marker'
    );
  });

  return sections;
}

function detectAutoSections(summaries: MeasureSummary[]): SongSection[] {
  if (summaries.length === 0) return [];
  if (summaries.length <= 4) {
    const sections: SongSection[] = [];
    closeSection(sections, 'Intro', 1, summaries.length, summaries, 'auto');
    return sections;
  }

  const blockSize = summaries.length >= 32 ? 8 : 4;
  const sections: SongSection[] = [];
  const blockPatterns = new Map<string, number>();
  const totalNotes = summaries.reduce((sum, item) => sum + item.noteCount, 0);
  const avgNotes = totalNotes / summaries.length;

  for (let start = 1; start <= summaries.length; start += blockSize) {
    const end = Math.min(summaries.length, start + blockSize - 1);
    const block = summaries.slice(start - 1, end);
    const signature = block.map((item) => item.patternHash).join('~');
    const previousCount = blockPatterns.get(signature) || 0;
    blockPatterns.set(signature, previousCount + 1);

    const density = block.reduce((sum, item) => sum + item.noteCount, 0) / block.length;
    const uniqueFrets = block.reduce((sum, item) => sum + item.uniqueFrets, 0) / block.length;
    const isLastBlock = end === summaries.length;
    const isDenseLeadLike = density > avgNotes * 1.35 && uniqueFrets > 5;

    let name = `Riff ${String.fromCharCode(65 + Math.min(sections.length, 5))}`;
    if (start === 1) name = 'Intro';
    else if (isLastBlock && density < avgNotes * 0.75) name = 'Outro';
    else if (isLastBlock && isDenseLeadLike) name = 'Solo';
    else if (isDenseLeadLike && start > summaries.length * 0.45) name = 'Solo';
    else if (previousCount > 0) name = 'Chorus';
    else if (sections.length % 2 === 1) name = 'Verse';
    else name = 'Chorus';

    closeSection(sections, name, start, end, summaries, 'auto');
  }

  return sections;
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
      const measureIndex = (bar.masterBar?.index ?? staff.bars.indexOf(bar)) + 1;
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
              measureIndex,
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
  const measureSummaries = buildMeasureSummaries(
    notes,
    score.masterBars.length,
    lastNote.timestampMs + lastNote.durationMs
  );
  const markerSections = detectMarkerSections(score, measureSummaries);
  const sections =
    markerSections.length > 0 ? markerSections : detectAutoSections(measureSummaries);
  const detectedTechniques = detectArpeggioPassages(notes);
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
    sections,
    sourceFileName: file.name,
    analysis: {
      techniques: detectedTechniques,
      primaryFocus: detectedTechniques[0],
    },
  };
}
