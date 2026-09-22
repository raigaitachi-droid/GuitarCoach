export interface TabNote {
  id: string;
  string: number; // 1 = high E, 6 = low E
  fret: number;
  timestampMs: number;
  durationMs: number;
  hitState?: 'unhit' | 'hit' | 'close' | 'miss' | 'wrong';
  timingOffsetMs?: number;
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

export interface FeedbackData {
  matchType: 'HIT' | 'CLOSE' | 'WRONG' | 'MISS';
  headline: 'PERFECT' | 'GOOD' | 'CLOSE' | 'WRONG NOTE' | 'MISSED';
  expectedNote: string;
  playedNote: string;
  timingErrorMs: number;
  timingLabel: 'early' | 'on-time' | 'late';
  timestamp: number;
}
