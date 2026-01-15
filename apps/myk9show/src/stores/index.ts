// Central export for all Zustand stores
export { useScoringStore } from './scoringStore';
export type { QualifyingResult, CompetitionType } from './scoringStore';

export { useEntryStore } from './entryStore';
export type { Entry } from './entryStore';

// Re-export from @myk9/scoring package
export { useTimerStore, type TimerArea } from '@myk9/scoring';

// Re-export common types for convenience
export interface ScoreSubmission {
  entryId: number;
  armband: number;
  points?: number;
  time?: string;
  faults?: number;
  qualifying: 'Q' | 'NQ' | 'EX' | 'DQ' | null;
  nonQualifyingReason?: string;
}