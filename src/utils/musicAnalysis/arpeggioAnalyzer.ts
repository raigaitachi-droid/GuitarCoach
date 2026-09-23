import { TabNote, TechniqueAnalysis } from '../../types';

const STANDARD_TUNING_MIDI_BY_STRING: Record<number, number> = {
  1: 64,
  2: 59,
  3: 55,
  4: 50,
  5: 45,
  6: 40,
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

type ChordQuality = 'major' | 'minor' | 'diminished' | 'sus2' | 'sus4';

interface ChordMatch {
  root: number;
  quality: ChordQuality;
  score: number;
  matchedPitchClasses: number;
}

const CHORD_INTERVALS: Record<ChordQuality, number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

function getMidi(note: TabNote): number {
  return (STANDARD_TUNING_MIDI_BY_STRING[note.string] ?? 40) + note.fret;
}

function getPitchClass(note: TabNote): number {
  return ((getMidi(note) % 12) + 12) % 12;
}

function getChordName(match: ChordMatch): string {
  const suffixByQuality: Record<ChordQuality, string> = {
    major: '',
    minor: 'm',
    diminished: 'dim',
    sus2: 'sus2',
    sus4: 'sus4',
  };

  return `${NOTE_NAMES[match.root]}${suffixByQuality[match.quality]}`;
}

function findBestChordMatch(notes: TabNote[]): ChordMatch | null {
  const pitchClasses = [...new Set(notes.map(getPitchClass))];
  if (pitchClasses.length < 3) return null;

  let best: ChordMatch | null = null;

  for (let root = 0; root < 12; root += 1) {
    for (const [quality, intervals] of Object.entries(CHORD_INTERVALS) as Array<[ChordQuality, number[]]>) {
      const chordPitchClasses = intervals.map((interval) => (root + interval) % 12);
      const matchedPitchClasses = pitchClasses.filter((pc) => chordPitchClasses.includes(pc)).length;
      const outsidePitchClasses = pitchClasses.length - matchedPitchClasses;
      const score = matchedPitchClasses / pitchClasses.length - outsidePitchClasses * 0.2;

      if (!best || score > best.score) {
        best = { root, quality, score, matchedPitchClasses };
      }
    }
  }

  if (!best || best.matchedPitchClasses < 3 || best.score < 0.72) return null;
  return best;
}

function hasSequentialMotion(notes: TabNote[]): boolean {
  const ordered = [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
  const uniqueTimes = new Set(ordered.map((note) => note.timestampMs));
  if (uniqueTimes.size < Math.ceil(ordered.length * 0.7)) return false;

  const midi = ordered.map(getMidi);
  const directionChanges = midi.slice(1).filter((value, index) => {
    const previous = midi[index];
    const next = midi[index + 2];
    if (next === undefined) return false;
    return Math.sign(value - previous) !== Math.sign(next - value);
  }).length;

  return directionChanges <= Math.max(1, Math.floor(notes.length / 2));
}

function compactTechniqueId(type: string, startMs: number, endMs: number): string {
  return `${type}-${Math.round(startMs)}-${Math.round(endMs)}`;
}

function createArpeggio(notes: TabNote[], chord: ChordMatch): TechniqueAnalysis {
  const ordered = [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  const startMs = first.timestampMs;
  const endMs = last.timestampMs + last.durationMs;
  const chordName = getChordName(chord);
  const stringSpread = new Set(ordered.map((note) => note.string)).size;
  const confidence = Math.min(
    0.98,
    0.72 + chord.score * 0.18 + Math.min(0.08, stringSpread * 0.015)
  );

  return {
    id: compactTechniqueId('arpeggio', startMs, endMs),
    type: 'arpeggio',
    label: `${chordName} arpeggio`,
    startMs,
    endMs,
    startMeasure: first.measureIndex,
    endMeasure: last.measureIndex,
    noteIds: ordered.map((note) => note.id),
    confidence: Number(confidence.toFixed(2)),
    summary: `Разложен ${chordName} акорд: нотите са близо във времето и очертават един хармоничен център.`,
    practiceTip:
      'Упражнявай го като форма, не като отделни ноти: бавно темпо, равни удари и минимално движение между струните.',
  };
}

function mergeOverlappingArpeggios(items: TechniqueAnalysis[]): TechniqueAnalysis[] {
  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || b.noteIds.length - a.noteIds.length);
  const merged: TechniqueAnalysis[] = [];

  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && item.startMs <= previous.endMs + 120) {
      if (item.noteIds.length > previous.noteIds.length || item.confidence > previous.confidence) {
        merged[merged.length - 1] = item;
      }
      continue;
    }
    merged.push(item);
  }

  return merged;
}

export function detectArpeggioPassages(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
  const candidates: TechniqueAnalysis[] = [];

  for (let start = 0; start < ordered.length; start += 1) {
    for (let size = 4; size <= 8; size += 1) {
      const window = ordered.slice(start, start + size);
      if (window.length < 4) continue;

      const first = window[0];
      const last = window[window.length - 1];
      const spanMs = last.timestampMs - first.timestampMs;
      if (spanMs < 250 || spanMs > 2600) continue;

      const hasEnoughStringSpread = new Set(window.map((note) => note.string)).size >= 2;
      if (!hasEnoughStringSpread || !hasSequentialMotion(window)) continue;

      const chord = findBestChordMatch(window);
      if (!chord) continue;

      candidates.push(createArpeggio(window, chord));
    }
  }

  return mergeOverlappingArpeggios(candidates).slice(0, 24);
}

export async function loadMusic21TheoryEngine(): Promise<unknown | null> {
  try {
    return await import('music21j');
  } catch {
    return null;
  }
}
