/**
 * Scoring Components Export Index
 *
 * Centralized exports for all result entry and scoring components
 */

export { ScentWorkScoresheet } from './ScentWorkScoresheet';
export type { ScentWorkScoresheetProps } from './ScentWorkScoresheet';

export { ResultEntryNavigation } from './ResultEntryNavigation';
export type {
  ResultEntryNavigationProps,
  EntryWithResult,
  EntryNavigationStatus,
} from './ResultEntryNavigation';

// Phase 3: Scoring Sync UI Components
export { LiveScoreUpdates } from './LiveScoreUpdates';
export type { LiveScoreUpdatesProps } from './LiveScoreUpdates';

export { ScoringConflictHandler } from './ScoringConflictHandler';
export type { ScoringConflictHandlerProps } from './ScoringConflictHandler';

export { default as JudgeSyncDashboard } from './JudgeSyncDashboard';
export type { JudgeSyncDashboardProps } from '@/utils/scoringUtils';

export { PlacementRecalculationAlert } from './PlacementRecalculationAlert';
export type { PlacementRecalculationAlertProps } from './PlacementRecalculationAlert';

// Format-specific scoresheets
export { default as TrackingScoresheet } from './format-specific/TrackingScoresheet';
export type { TrackingScoresheetProps } from './format-specific/TrackingScoresheet';
