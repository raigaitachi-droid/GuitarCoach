import { TabNote, TechniqueAnalysis, TechniqueType } from '../../types';

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

function compactTechniqueId(type: string, startMs: number, endMs: number): string {
  return `${type}-${Math.round(startMs)}-${Math.round(endMs)}`;
}

function orderedNotes(notes: TabNote[]): TabNote[] {
  return [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
}

function getTimeRange(notes: TabNote[]) {
  const ordered = orderedNotes(notes);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  return {
    ordered,
    first,
    last,
    startMs: first.timestampMs,
    endMs: last.timestampMs + last.durationMs,
  };
}

function makeTechnique(
  type: TechniqueType,
  label: string,
  notes: TabNote[],
  confidence: number,
  severity: TechniqueAnalysis['severity'],
  problemTitle: string,
  whyItMatters: string,
  summary: string,
  practiceTip: string
): TechniqueAnalysis {
  const { ordered, first, last, startMs, endMs } = getTimeRange(notes);

  return {
    id: compactTechniqueId(type, startMs, endMs),
    type,
    label,
    startMs,
    endMs,
    startMeasure: first.measureIndex,
    endMeasure: last.measureIndex,
    noteIds: ordered.map((note) => note.id),
    confidence: Number(Math.min(0.99, Math.max(0.45, confidence)).toFixed(2)),
    severity,
    problemTitle,
    whyItMatters,
    summary,
    practiceTip,
  };
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
  const ordered = orderedNotes(notes);
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

function createArpeggio(notes: TabNote[], chord: ChordMatch): TechniqueAnalysis {
  const chordName = getChordName(chord);
  const stringSpread = new Set(notes.map((note) => note.string)).size;
  const confidence = 0.72 + chord.score * 0.18 + Math.min(0.08, stringSpread * 0.015);

  return makeTechnique(
    'arpeggio',
    `${chordName} arpeggio`,
    notes,
    confidence,
    stringSpread >= 4 ? 'high' : 'medium',
    'Разложен акорд: риск от неравен ритъм',
    'При арпежа ухото чува акорда като една форма. Ако всяка нота е с различна атака, пасажът звучи накъсано.',
    `Нотите очертават ${chordName} и са изсвирени последователно, не едновременно.`,
    'Първо свири само дясната ръка върху заглушени струни. После добави лявата ръка и пази еднаква сила на всяка нота.'
  );
}

function detectArpeggios(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
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

  return mergeOverlapping(candidates).slice(0, 20);
}

function detectStringSkips(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let i = 0; i < ordered.length - 2; i += 1) {
    const window = ordered.slice(i, i + 4);
    if (window.length < 3) continue;

    const skips = window.slice(1).filter((note, index) => {
      const previous = window[index];
      return Math.abs(note.string - previous.string) >= 2;
    });

    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (skips.length < 2 || spanMs > 2200) continue;

    candidates.push(
      makeTechnique(
        'string-skip',
        'String skipping',
        window,
        0.78 + Math.min(0.15, skips.length * 0.04),
        skips.length >= 3 ? 'high' : 'medium',
        'Прескачане на струни: риск от грешна струна',
        'Това натоварва ориентацията на дясната ръка. Най-честият проблем е удар върху съседна струна или забавяне преди скока.',
        'Има няколко бързи скока през една или повече струни в кратък прозорец.',
        'Изолирай само струните без лява ръка. Свири pattern-а с alternate picking и оставяй китката ниско, без голямо движение.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 16);
}

function detectPositionShifts(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let i = 0; i < ordered.length - 2; i += 1) {
    const window = ordered.slice(i, i + 3);
    const fretted = window.filter((note) => note.fret > 0);
    if (fretted.length < 2) continue;

    const fretJump = Math.max(...fretted.map((note) => note.fret)) - Math.min(...fretted.map((note) => note.fret));
    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (fretJump < 5 || spanMs > 1800) continue;

    candidates.push(
      makeTechnique(
        'position-shift',
        'Position shift',
        window,
        0.74 + Math.min(0.18, fretJump * 0.02),
        fretJump >= 8 ? 'high' : 'medium',
        'Смяна на позиция: риск от закъснение',
        'Лявата ръка трябва да премести цялата форма, не само един пръст. Ако погледът и ръката тръгнат късно, следващата нота пада след времето.',
        `Има скок от около ${fretJump} прагчета в много кратък пасаж.`,
        'Тренирай само двете крайни ноти като “цел”. Премести ръката без напрежение, после добави междинните ноти.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 16);
}

function detectSpeedBursts(notes: TabNote[]): TechniqueAnalysis[] {
  const ordered = orderedNotes(notes);
  const candidates: TechniqueAnalysis[] = [];

  for (let start = 0; start < ordered.length - 5; start += 1) {
    const window = ordered.slice(start, start + 6);
    const spanMs = window[window.length - 1].timestampMs - window[0].timestampMs;
    if (spanMs <= 0 || spanMs > 1700) continue;

    const averageGap = spanMs / (window.length - 1);
    const fretSpread = Math.max(...window.map((note) => note.fret)) - Math.min(...window.map((note) => note.fret));
    if (averageGap > 210 || fretSpread < 2) continue;

    candidates.push(
      makeTechnique(
        'speed-burst',
        'Speed burst',
        window,
        averageGap < 150 ? 0.9 : 0.78,
        averageGap < 150 ? 'high' : 'medium',
        'Плътен бърз пасаж: риск от стягане',
        'Тук проблемът рядко е теорията. Проблемът е координация: двете ръце трябва да останат синхронни при малки интервали между нотите.',
        `Средното разстояние между нотите е около ${Math.round(averageGap)}ms.`,
        'Свали темпото до 60-70%. Свири 3 перфектни повторения, после качвай с 5%. Спри веднага щом ръката се стегне.'
      )
    );
  }

  return mergeOverlapping(candidates).slice(0, 12);
}

function mergeOverlapping(items: TechniqueAnalysis[]): TechniqueAnalysis[] {
  const priority: Record<TechniqueAnalysis['severity'] & string, number> = {
    high: 3,
    medium: 2,
    low: 1,
  };

  const sorted = [...items].sort((a, b) => a.startMs - b.startMs || b.noteIds.length - a.noteIds.length);
  const merged: TechniqueAnalysis[] = [];

  for (const item of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && item.startMs <= previous.endMs + 140 && item.type === previous.type) {
      const itemScore = item.noteIds.length + (priority[item.severity || 'low'] || 1) + item.confidence;
      const previousScore = previous.noteIds.length + (priority[previous.severity || 'low'] || 1) + previous.confidence;
      if (itemScore > previousScore) merged[merged.length - 1] = item;
      continue;
    }
    merged.push(item);
  }

  return merged;
}

function sortTechniqueMap(items: TechniqueAnalysis[]): TechniqueAnalysis[] {
  const severityScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
  return [...items]
    .sort((a, b) => a.startMs - b.startMs || (severityScore[b.severity || 'low'] - severityScore[a.severity || 'low']))
    .slice(0, 36);
}

export function analyzeTechniqueMap(notes: TabNote[]): TechniqueAnalysis[] {
  return sortTechniqueMap([
    ...detectArpeggios(notes),
    ...detectStringSkips(notes),
    ...detectPositionShifts(notes),
    ...detectSpeedBursts(notes),
  ]);
}

export function detectArpeggioPassages(notes: TabNote[]): TechniqueAnalysis[] {
  return analyzeTechniqueMap(notes);
}

export async function loadMusic21TheoryEngine(): Promise<unknown | null> {
  try {
    return await import('music21j');
  } catch {
    return null;
  }
}
