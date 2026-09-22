export interface TabNote {
  id: string;
  string: number; // 1 = high E, 6 = low E
  fret: number;
  timestampMs: number;
  durationMs: number;
  measureIndex?: number;
  hitState?: 'unhit' | 'hit' | 'close' | 'miss' | 'wrong';
  timingOffsetMs?: number;
}

export interface SongSection {
  id: string;
  name: string;
  startMeasure: number;
  endMeasure: number;
  startMs: number;
  endMs: number;
  confidence: 'marker' | 'auto';
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
  sections: SongSection[];
  sourceFileName: string;
}

export interface FeedbackData {
  matchType: 'HIT' | 'CLOSE' | 'WRONG' | 'MISS';
  headline: 'PERFECT' | 'GOOD' | 'CLOSE' | 'WRONG NOTE' | 'MISSED';
  expectedNote: string;
  playedNote: string;
  timingErrorMs: number;
  timingLabel: 'early' | 'on-time' | 'late';
  timestamp: number;
}
