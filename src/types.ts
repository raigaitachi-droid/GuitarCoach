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

export type TechniqueType =
  | 'arpeggio'
  | 'scale-run'
  | 'chord-change'
  | 'string-skip'
  | 'position-shift'
  | 'speed-burst'
  | 'high-npm'
  | 'dense-beat'
  | 'polyphony-stretch'
  | 'practice-strategy';

export interface TechniqueAnalysis {
  id: string;
  type: TechniqueType;
  label: string;
  startMs: number;
  endMs: number;
  startMeasure?: number;
  endMeasure?: number;
  noteIds: string[];
  confidence: number;
  severity?: 'low' | 'medium' | 'high';
  problemTitle?: string;
  whyItMatters?: string;
  summary: string;
  practiceTip: string;
}

export interface SongAnalysis {
  techniques: TechniqueAnalysis[];
  primaryFocus?: TechniqueAnalysis;
}

export interface ImportedSong extends SongMetadata {
  notes: TabNote[];
  sections: SongSection[];
  sourceFileName: string;
  analysis?: SongAnalysis;
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

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface CoachEvaluation {
  recommendedTempo: number;
  previousTempo: number;
  tempoChange: number;
  evaluation: string;
  techniqueTip: string;
  encouragement: string;
}

export interface PerformanceRound {
  id: string;
  songTitle: string;
  accuracy: number;
  hits: number;
  close: number;
  misses: number;
  streak: number;
  tempoFactor: number;
  timestamp: number;
  recommendedTempo?: number;
}

