// Central export for all Zustand stores
export { useScoringStore } from './scoringStore';
export type { QualifyingResult, CompetitionType } from './scoringStore';

export { useEntryStore } from './entryStore';
export type { Entry } from './entryStore';

export { useOfflineQueueStore } from './offlineQueueStore';
export type { QueuedScore } from './offlineQueueStore';

export { useTimerStore } from './timerStore';
export type { TimerArea } from './timerStore';

export { useAnnouncementStore } from './announcementStore';
export type { Announcement, AnnouncementRead } from './announcementStore';

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