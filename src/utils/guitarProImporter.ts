import * as alphaTab from '@coderline/alphatab';
import { ImportedSong, SongBar, TabNote } from '../types';

const SUPPORTED_EXTENSIONS = ['.gp', '.gpx', '.gp3', '.gp4', '.gp5', '.gp7', '.gp8'];
const INTRO_LEAD_IN_MS = 1000;

interface PlaybackTempoChange {
  tick: number;
  tempo: number;
}

interface PlaybackBar {
  startTick: number;
  endTick: number;
  sourceMeasureIndex: number;
}

function hasMeaningfulHarmonicProperty(value: unknown, depth = 0): boolean {
  if (!value || typeof value !== 'object' || depth > 2) return false;

  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('harmonic')) {
      if (raw === true) return true;
      if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return true;
      if (typeof raw === 'string') {
        const normalized = raw.trim().toLowerCase();
        if (
          normalized.length > 0 &&
          !['0', 'false', 'none', 'normal', 'null', 'undefined', 'noharmonic', 'no-harmonic'].includes(normalized)
        ) {
          return true;
        }
      }
      if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) return true;
    }

    if (raw && typeof raw === 'object' && hasMeaningfulHarmonicProperty(raw, depth + 1)) {
      return true;
    }
  }

  return false;
}

function getHarmonicInfo(note: unknown): { isHarmonic: boolean; harmonicType?: 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi' | 'unknown' } {
  const candidate = note as {
    harmonicType?: unknown;
    harmonicValue?: unknown;
    isHarmonic?: unknown;
    isNaturalHarmonic?: unknown;
    isArtificialHarmonic?: unknown;
    isPinchHarmonic?: unknown;
    isTapHarmonic?: unknown;
    isSemiHarmonic?: unknown;
    effects?: {
      harmonicType?: unknown;
      harmonicValue?: unknown;
      isHarmonic?: unknown;
      isNaturalHarmonic?: unknown;
      isArtificialHarmonic?: unknown;
      isPinchHarmonic?: unknown;
      isTapHarmonic?: unknown;
      isSemiHarmonic?: unknown;
    };
  };

  const effectSource = candidate.effects ?? candidate;
  const rawType = String(effectSource.harmonicType ?? candidate.harmonicType ?? '').trim().toLowerCase();
  const rawValue = effectSource.harmonicValue ?? candidate.harmonicValue;
  const hasTrueFlag = (...values: unknown[]) => values.some((value) => value === true);
  const rawTypeIsNumeric = rawType.length > 0 && /^-?\d+(\.\d+)?$/.test(rawType);
  const knownNumericHarmonicType = rawTypeIsNumeric && Number(rawType) > 0;
  const hasMeaningfulType =
    rawType.length > 0 &&
    !rawTypeIsNumeric &&
    !['0', 'false', 'none', 'normal', 'null', 'undefined', 'noharmonic', 'no-harmonic'].includes(rawType);
  const hasMeaningfulValue =
    typeof rawValue === 'number'
      ? Number.isFinite(rawValue) && rawValue > 0
      : typeof rawValue === 'string'
      ? rawValue.trim().length > 0 &&
        !['0', 'false', 'none', 'normal', 'null', 'undefined'].includes(rawValue.trim().toLowerCase())
      : rawValue === true;
  const hasExplicitHarmonicFlag =
    hasTrueFlag(effectSource.isHarmonic, candidate.isHarmonic) ||
    hasTrueFlag(effectSource.isNaturalHarmonic, candidate.isNaturalHarmonic) ||
    hasTrueFlag(effectSource.isArtificialHarmonic, candidate.isArtificialHarmonic) ||
    hasTrueFlag(effectSource.isPinchHarmonic, candidate.isPinchHarmonic) ||
    hasTrueFlag(effectSource.isTapHarmonic, candidate.isTapHarmonic) ||
    hasTrueFlag(effectSource.isSemiHarmonic, candidate.isSemiHarmonic);
  const isHarmonic =
    hasExplicitHarmonicFlag ||
    hasMeaningfulType ||
    hasMeaningfulValue ||
    knownNumericHarmonicType ||
    hasMeaningfulHarmonicProperty(candidate);

  if (!isHarmonic) return { isHarmonic: false };
  if (rawType.includes('natural') || hasTrueFlag(effectSource.isNaturalHarmonic, candidate.isNaturalHarmonic)) {
    return { isHarmonic: true, harmonicType: 'natural' };
  }
  if (rawType.includes('artificial') || hasTrueFlag(effectSource.isArtificialHarmonic, candidate.isArtificialHarmonic)) {
    return { isHarmonic: true, harmonicType: 'artificial' };
  }
  if (rawType.includes('pinch') || hasTrueFlag(effectSource.isPinchHarmonic, candidate.isPinchHarmonic)) {
    return { isHarmonic: true, harmonicType: 'pinch' };
  }
  if (rawType.includes('tap') || hasTrueFlag(effectSource.isTapHarmonic, candidate.isTapHarmonic)) {
    return { isHarmonic: true, harmonicType: 'tap' };
  }
  if (rawType.includes('semi') || hasTrueFlag(effectSource.isSemiHarmonic, candidate.isSemiHarmonic)) {
    return { isHarmonic: true, harmonicType: 'semi' };
  }
  return { isHarmonic: true, harmonicType: 'unknown' };
}

function getHammerPullInfo(note: unknown): { isHammerOn?: boolean; isPullOff?: boolean } {
  const candidate = note as {
    isHammerPullOrigin?: boolean;
    isHammerPullDestination?: boolean;
    hammerPullOrigin?: { fret?: number };
    hammerPullDestination?: { fret?: number };
    fret?: number;
    effects?: {
      isHammerPullOrigin?: boolean;
      isHammerPullDestination?: boolean;
      hammerPullOrigin?: { fret?: number };
      hammerPullDestination?: { fret?: number };
    };
  };

  const effectSource = candidate.effects ?? candidate;
  const isDestination = Boolean(
    effectSource.isHammerPullDestination ||
    candidate.isHammerPullDestination ||
    effectSource.hammerPullOrigin ||
    candidate.hammerPullOrigin
  );

  if (isDestination) {
    const origin = effectSource.hammerPullOrigin || candidate.hammerPullOrigin;
    const originFret = typeof origin?.fret === 'number' ? origin.fret : -1;
    const currentFret = typeof candidate.fret === 'number' ? candidate.fret : 0;

    if (originFret >= 0) {
      if (currentFret > originFret) return { isHammerOn: true };
      if (currentFret < originFret) return { isPullOff: true };
    }
  }

  const rawObj = candidate as Record<string, unknown>;
  if (rawObj.isHammerOn === true || rawObj.hammerOn === true) return { isHammerOn: true };
  if (rawObj.isPullOff === true || rawObj.pullOff === true) return { isPullOff: true };

  return {};
}

export function isSupportedGuitarProFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function selectGuitarTrack(score: alphaTab.model.Score) {
  const playable = score.tracks.filter((candidate) => !candidate.isPercussion && candidate.staves.some((staff) => staff.tuning.length >= 4));
  return playable.find((candidate) => candidate.staves.some((staff) => staff.tuning.length === 6)) || playable[0] || null;
}

function buildPlaybackTimeline(score: alphaTab.model.Score): { bars: PlaybackBar[]; tempoChanges: PlaybackTempoChange[] } {
  // alphaTab's generator expands repeats and exposes the same timeline it uses for playback.
  const handler = new Proxy({}, { get: () => () => undefined }) as alphaTab.midi.IMidiFileHandler;
  const generator = new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), handler);
  generator.generate();

  const bars = generator.tickLookup.masterBars.map((bar) => ({
    startTick: bar.start,
    endTick: bar.end,
    sourceMeasureIndex: bar.masterBar.index + 1,
  }));
  const tempoChanges = generator.tickLookup.masterBars.flatMap((bar) =>
    bar.tempoChanges.map((change) => ({ tick: change.tick, tempo: change.tempo }))
  ).filter((change) => Number.isFinite(change.tempo) && change.tempo > 0)
    .sort((a, b) => a.tick - b.tick)
    .filter((change, index, all) => index === 0 || change.tick !== all[index - 1].tick || change.tempo !== all[index - 1].tempo);

  return {
    bars,
    tempoChanges: tempoChanges.length > 0 ? tempoChanges : [{ tick: 0, tempo: Math.max(1, score.tempo || 120) }],
  };
}

function millisecondsAtTick(tick: number, tempoChanges: PlaybackTempoChange[]): number {
  let elapsedMs = 0;
  let previousTick = 0;
  let tempo = tempoChanges[0]?.tempo || 120;

  for (const change of tempoChanges) {
    if (change.tick > tick) break;
    elapsedMs += Math.max(0, change.tick - previousTick) * 60000 / (tempo * 960);
    previousTick = change.tick;
    tempo = change.tempo;
  }

  return elapsedMs + Math.max(0, tick - previousTick) * 60000 / (tempo * 960);
}

function sourceBarFor(track: alphaTab.model.Track, sourceMeasureIndex: number) {
  return track.staves.find((staff) => staff.tuning.length >= 4)?.bars[sourceMeasureIndex - 1] || null;
}

export async function importGuitarProFile(file: File): Promise<ImportedSong> {
  if (!isSupportedGuitarProFile(file)) {
    throw new Error('Choose a Guitar Pro file (.gp, .gpx, .gp3, .gp4, .gp5, .gp7 or .gp8).');
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const score = alphaTab.importer.ScoreLoader.loadScoreFromBytes(
    bytes,
    new alphaTab.Settings()
  );

  const track = selectGuitarTrack(score);

  if (!track) {
    throw new Error('This file does not contain a playable guitar track.');
  }

  const tempo = Math.max(1, Math.round(score.tempo || 120));
  const playback = buildPlaybackTimeline(score);
  const notes: TabNote[] = [];
  let noteIndex = 0;

  for (const [playbackIndex, playbackBar] of playback.bars.entries()) {
    const bar = sourceBarFor(track, playbackBar.sourceMeasureIndex);
    if (!bar) continue;
    const stringCount = bar.staff.tuning.length || 6;
    const sourceStartTick = bar.masterBar?.start || 0;

    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest) continue;
        const relativeTick = beat.absolutePlaybackStart - sourceStartTick;
        const startTick = playbackBar.startTick + relativeTick;
        const endTick = startTick + beat.playbackDuration;
        const timestampMs = INTRO_LEAD_IN_MS + millisecondsAtTick(startTick, playback.tempoChanges);
        const durationMs = Math.max(60, Math.round(millisecondsAtTick(endTick, playback.tempoChanges) - millisecondsAtTick(startTick, playback.tempoChanges)));

        for (const note of beat.notes) {
          if (note.fret < 0 || note.string < 1) continue;
          const harmonicInfo = getHarmonicInfo(note);
          const hammerPullInfo = getHammerPullInfo(note);

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
            expectedMidi: note.realValue,
            ...harmonicInfo,
            ...hammerPullInfo,
            measureIndex: playbackIndex + 1,
          });
        }
      }
    }
  }

  notes.sort((a, b) => a.timestampMs - b.timestampMs || a.string - b.string);

  // Link legato chains between consecutive notes on the same string
  for (let i = 1; i < notes.length; i += 1) {
    const current = notes[i];
    if (current.isHammerOn || current.isPullOff) {
      for (let j = i - 1; j >= 0; j -= 1) {
        const prev = notes[j];
        if (prev.string === current.string && current.timestampMs - prev.timestampMs <= 1200) {
          current.legatoOriginNoteId = prev.id;
          break;
        }
      }
    }
  }

  if (notes.length === 0) {
    throw new Error('This track does not contain guitar notes.');
  }

  const lastNote = notes[notes.length - 1];
  const bars: SongBar[] = playback.bars.map((bar, index) => {
    const source = score.masterBars[bar.sourceMeasureIndex - 1];
    return {
      index: index + 1,
      sourceMeasureIndex: bar.sourceMeasureIndex,
      startMs: Math.round(INTRO_LEAD_IN_MS + millisecondsAtTick(bar.startTick, playback.tempoChanges)),
      endMs: Math.round(INTRO_LEAD_IN_MS + millisecondsAtTick(bar.endTick, playback.tempoChanges)),
      timeSignature: `${source?.timeSignatureNumerator || 4}/${source?.timeSignatureDenominator || 4}`,
    };
  });
  const scoreEndMs = bars.length > 0 ? bars[bars.length - 1].endMs : lastNote.timestampMs + lastNote.durationMs;
  const fileTitle = file.name.replace(/\.(gp|gpx|gp3|gp4|gp5|gp7|gp8)$/i, '');
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title: score.title?.trim() || fileTitle,
    artist: score.artist?.trim() || '',
    tempo,
    durationMs: Math.max(scoreEndMs, lastNote.timestampMs + lastNote.durationMs) + 500,
    difficulty: 'Intermediate',
    tuning: track.staves[0]?.tuningName || 'Guitar Pro tuning',
    key: 'Imported',
    attempts: 0,
    bestAccuracy: 0,
    measures: bars.length || score.masterBars.length,
    notes,
    bars,
    sourceFileName: file.name,
  };
}
