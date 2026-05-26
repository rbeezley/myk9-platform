// Central export for all Zustand stores.
//
// Domain stores (entryStore, scoringStore) are re-exported through
// `@myk9/ringside` and `@myk9/scoring`; the local files here are thin
// shims that forward to those packages. Timer/scoring hooks live in
// `@myk9/scoring` and should be imported directly from there.
export { useScoringStore } from './scoringStore';
export type { QualifyingResult, CompetitionType } from './scoringStore';

export { useEntryStore } from './entryStore';
export type { Entry } from './entryStore';

export { useOfflineQueueStore } from './offlineQueueStore';
export type { QueuedScore } from './offlineQueueStore';

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