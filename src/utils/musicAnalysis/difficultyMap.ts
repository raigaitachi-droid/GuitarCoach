import { TabNote } from '../../types';

export interface DifficultyHotspot {
  id: string;
  startMs: number;
  endMs: number;
  startMeasure?: number;
  endMeasure?: number;
  noteIds: string[];
  score: number;
  severity: 'low' | 'medium' | 'high';
  notesPerMinute: number;
  notesPerBeat: number;
  maxFretJump: number;
  maxStringJump: number;
  fretSpan: number;
  maxPolyphony: number;
  contextPenalty: number;
  reasons: string[];
}

interface DifficultyWindow {
  startMs: number;
  endMs: number;
  notes: TabNote[];
}

function orderedNotes(notes: TabNote[]): TabNote[] {
  return [...notes].sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreRange(value: number, startsAt: number, maxAt: number, maxScore: number): number {
  if (value <= startsAt) return 0;
  return clamp(((value - startsAt) / Math.max(1, maxAt - startsAt)) * maxScore, 0, maxScore);
}

function getNotesPerMinute(notes: TabNote[], startMs: number, endMs: number): number {
  const minutes = Math.max(1 / 60, (endMs - startMs) / 60000);
  return notes.length / minutes;
}

function getNotesPerBeat(notes: TabNote[], startMs: number, endMs: number, tempoBpm: number): number {
  const beats = Math.max(0.25, ((endMs - startMs) / 60000) * Math.max(1, tempoBpm));
  return notes.length / beats;
}

function getMaxFretJump(notes: TabNote[]): number {
  const fretted = orderedNotes(notes).filter((note) => note.fret > 0);
  let maxJump = 0;

  for (let i = 1; i < fretted.length; i += 1) {
    maxJump = Math.max(maxJump, Math.abs(fretted[i].fret - fretted[i - 1].fret));
  }

  return maxJump;
}

function getMaxStringJump(notes: TabNote[]): number {
  const ordered = orderedNotes(notes);
  let maxJump = 0;

  for (let i = 1; i < ordered.length; i += 1) {
    maxJump = Math.max(maxJump, Math.abs(ordered[i].string - ordered[i - 1].string));
  }

  return maxJump;
}

function getFretSpan(notes: TabNote[]): number {
  const fretted = notes.filter((note) => note.fret > 0);
  if (fretted.length < 2) return 0;
  return Math.max(...fretted.map((note) => note.fret)) - Math.min(...fretted.map((note) => note.fret));
}

function getMaxPolyphony(notes: TabNote[]): number {
  const groups = new Map<number, number>();

  for (const note of notes) {
    const bucket = Math.round(note.timestampMs / 35) * 35;
    groups.set(bucket, (groups.get(bucket) || 0) + 1);
  }

  return Math.max(1, ...groups.values());
}

function getMeasures(notes: TabNote[]): { startMeasure?: number; endMeasure?: number } {
  const measures = notes
    .map((note) => note.measureIndex)
    .filter((measure): measure is number => typeof measure === 'number');

  if (measures.length === 0) return {};
  return {
    startMeasure: Math.min(...measures),
    endMeasure: Math.max(...measures),
  };
}

function buildWindows(notes: TabNote[], tempoBpm: number): DifficultyWindow[] {
  const ordered = orderedNotes(notes);
  if (ordered.length === 0) return [];

  const firstMs = ordered[0].timestampMs;
  const lastMs = ordered[ordered.length - 1].timestampMs + ordered[ordered.length - 1].durationMs;
  const beatMs = 60000 / Math.max(1, tempoBpm);
  const windowMs = Math.max(beatMs * 2, 900);
  const stepMs = Math.max(beatMs, 450);
  const windows: DifficultyWindow[] = [];

  for (let startMs = firstMs; startMs < lastMs; startMs += stepMs) {
    const endMs = startMs + windowMs;
    const windowNotes = ordered.filter((note) => note.timestampMs >= startMs && note.timestampMs < endMs);
    if (windowNotes.length >= 2) {
      windows.push({ startMs, endMs, notes: windowNotes });
    }
  }

  return windows;
}

function buildReasons(metrics: Omit<DifficultyHotspot, 'id' | 'noteIds' | 'reasons' | 'severity'>): string[] {
  const reasons: string[] = [];

  if (metrics.notesPerMinute >= 576) reasons.push(`${Math.round(metrics.notesPerMinute)} НВМ: много висока реална скорост`);
  else if (metrics.notesPerMinute >= 480) reasons.push(`${Math.round(metrics.notesPerMinute)} НВМ: висока реална скорост`);

  if (metrics.notesPerBeat >= 7) reasons.push(`${metrics.notesPerBeat.toFixed(1)} ноти за удар: септола/гъста група`);
  else if (metrics.notesPerBeat >= 5) reasons.push(`${metrics.notesPerBeat.toFixed(1)} ноти за удар: повече от нормални 16-тини`);

  if (metrics.maxFretJump >= 8) reasons.push(`скок ${metrics.maxFretJump} прагчета: голяма смяна на позиция`);
  else if (metrics.maxFretJump >= 5) reasons.push(`скок ${metrics.maxFretJump} прагчета: смяна на позиция`);

  if (metrics.maxStringJump >= 3) reasons.push(`скок през ${metrics.maxStringJump} струни: риск за дясната ръка`);
  else if (metrics.maxStringJump >= 2) reasons.push(`прескачане през струни`);

  if (metrics.fretSpan > 4) reasons.push(`разтягане ${metrics.fretSpan} прагчета: висок риск от напрежение`);
  else if (metrics.fretSpan > 2) reasons.push(`разтягане ${metrics.fretSpan} прагчета`);

  if (metrics.maxPolyphony >= 3) reasons.push(`${metrics.maxPolyphony} гласа/едновременни ноти: многогласие`);
  else if (metrics.maxPolyphony >= 2 && metrics.fretSpan > 2) reasons.push('двуглас с разтягане');

  if (metrics.contextPenalty > 0) reasons.push('идва след друго трудно място');

  return reasons;
}

function scoreWindow(window: DifficultyWindow, tempoBpm: number, previousScore: number): DifficultyHotspot {
  const notesPerMinute = getNotesPerMinute(window.notes, window.startMs, window.endMs);
  const notesPerBeat = getNotesPerBeat(window.notes, window.startMs, window.endMs, tempoBpm);
  const maxFretJump = getMaxFretJump(window.notes);
  const maxStringJump = getMaxStringJump(window.notes);
  const fretSpan = getFretSpan(window.notes);
  const maxPolyphony = getMaxPolyphony(window.notes);
  const contextPenalty = previousScore >= 65 ? 8 : previousScore >= 50 ? 4 : 0;

  const speedScore = scoreRange(notesPerMinute, 330, 620, 26);
  const densityScore = scoreRange(notesPerBeat, 3.5, 7, 22);
  const positionScore = scoreRange(maxFretJump, 3, 9, 17);
  const stringScore = scoreRange(maxStringJump, 1, 4, 12);
  const stretchScore = scoreRange(fretSpan, 2, 6, 14);
  const polyphonyScore = scoreRange(maxPolyphony, 1, 4, 13);
  const score = Math.round(clamp(
    speedScore + densityScore + positionScore + stringScore + stretchScore + polyphonyScore + contextPenalty,
    0,
    100
  ));

  const measures = getMeasures(window.notes);
  const baseMetrics = {
    startMs: Math.round(window.startMs),
    endMs: Math.round(window.endMs),
    startMeasure: measures.startMeasure,
    endMeasure: measures.endMeasure,
    score,
    notesPerMinute,
    notesPerBeat,
    maxFretJump,
    maxStringJump,
    fretSpan,
    maxPolyphony,
    contextPenalty,
  };

  return {
    id: `difficulty-${Math.round(window.startMs)}-${Math.round(window.endMs)}`,
    ...baseMetrics,
    severity: score >= 72 ? 'high' : score >= 45 ? 'medium' : 'low',
    noteIds: window.notes.map((note) => note.id),
    reasons: buildReasons(baseMetrics),
  };
}

function mergeHotspots(hotspots: DifficultyHotspot[]): DifficultyHotspot[] {
  const sorted = [...hotspots].sort((a, b) => a.startMs - b.startMs || b.score - a.score);
  const merged: DifficultyHotspot[] = [];

  for (const hotspot of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && hotspot.startMs <= previous.endMs) {
      if (hotspot.score > previous.score) {
        merged[merged.length - 1] = {
          ...hotspot,
          startMs: Math.min(previous.startMs, hotspot.startMs),
          endMs: Math.max(previous.endMs, hotspot.endMs),
          noteIds: [...new Set([...previous.noteIds, ...hotspot.noteIds])],
          reasons: [...new Set([...previous.reasons, ...hotspot.reasons])],
          startMeasure: previous.startMeasure ?? hotspot.startMeasure,
          endMeasure: hotspot.endMeasure ?? previous.endMeasure,
        };
      } else {
        previous.endMs = Math.max(previous.endMs, hotspot.endMs);
        previous.noteIds = [...new Set([...previous.noteIds, ...hotspot.noteIds])];
        previous.reasons = [...new Set([...previous.reasons, ...hotspot.reasons])];
        previous.endMeasure = hotspot.endMeasure ?? previous.endMeasure;
      }
      continue;
    }

    merged.push({ ...hotspot });
  }

  return merged;
}

export function buildDifficultyMap(notes: TabNote[], tempoBpm: number): DifficultyHotspot[] {
  const windows = buildWindows(notes, tempoBpm);
  let previousScore = 0;

  const scored = windows.map((window) => {
    const hotspot = scoreWindow(window, tempoBpm, previousScore);
    previousScore = hotspot.score;
    return hotspot;
  });

  const meaningful = scored.filter((hotspot) => hotspot.score >= 38 && hotspot.reasons.length > 0);
  const merged = mergeHotspots(meaningful);

  return merged
    .sort((a, b) => b.score - a.score || a.startMs - b.startMs)
    .slice(0, 5)
    .sort((a, b) => a.startMs - b.startMs);
}
