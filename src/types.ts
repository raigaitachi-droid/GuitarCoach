export interface TabNote {
  id: string;
  string: number; // 1 = high E, 6 = low E
  fret: number;
  timestampMs: number;
  durationMs: number;
  expectedMidi?: number; // Sounding pitch from the imported score, including tuning.
  isHarmonic?: boolean;
  harmonicType?: 'natural' | 'artificial' | 'pinch' | 'tap' | 'semi' | 'unknown';
  isHammerOn?: boolean;
  isPullOff?: boolean;
  legatoOriginNoteId?: string;
  technique?: 'normal' | 'hammer-on' | 'pull-off' | 'harmonic' | 'slide' | 'bend';
  measureIndex?: number;
  hitState?: 'unhit' | 'hit' | 'close' | 'miss' | 'wrong';
  timingOffsetMs?: number;
  /** Wrong detected pitches before a note is resolved; used only for practice focus. */
  mistakeCount?: number;
}

export interface SongBar {
  /** Position in the playback timeline. Repeated bars appear once per pass. */
  index: number;
  /** Original Guitar Pro bar number, before repeats are expanded. */
  sourceMeasureIndex: number;
  startMs: number;
  endMs: number;
  timeSignature: string;
}

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  tempo: number;
  durationMs: number;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tuning: string;
  key: string;
  attempts: number;
  bestAccuracy: number;
  measures: number;
}

export interface ImportedSong extends SongMetadata {
  notes: TabNote[];
  bars?: SongBar[];
  sourceFileName: string;
}
