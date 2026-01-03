/**
 * @myk9/scoring - Core Types
 *
 * Type definitions for dog show scoring across AKC, UKC, and ASCA organizations.
 */

/**
 * Qualifying result codes used across different sports
 */
export type QualifyingResult =
  | 'Q'
  | 'NQ'
  | 'EX'
  | 'DQ'
  | 'E'
  | 'ABS'
  | 'WD'
  | 'Qualified'
  | 'Excused'
  | 'Withdrawn'
  | 'Eliminated'
  | 'Absent'
  | null;

/**
 * Competition types supported by the scoring system
 */
export type CompetitionType =
  | 'UKC_OBEDIENCE'
  | 'UKC_RALLY'
  | 'UKC_NOSEWORK'
  | 'AKC_SCENT_WORK'
  | 'AKC_SCENT_WORK_NATIONAL'
  | 'AKC_FASTCAT'
  | 'ASCA_SCENT_DETECTION';

/**
 * Score sync status for optimistic updates
 */
export type SyncStatus = 'pending' | 'synced' | 'error';

/**
 * Individual score record
 */
export interface Score {
  entryId: number;
  armband: number;
  points?: number;
  time?: string;
  faults?: number;
  qualifying: QualifyingResult;
  nonQualifyingReason?: string;
  /** Multi-area times for scent work (key: area name, value: time string) */
  areas?: { [key: string]: string };
  /** Fast CAT health check */
  healthCheckPassed?: boolean;
  /** Fast CAT speed */
  mph?: number;
  /** Rally score */
  score?: number;
  /** Rally deductions */
  deductions?: number;
  /** Nationals correct alerts */
  correctCount?: number;
  /** Nationals incorrect alerts */
  incorrectCount?: number;
  /** Nationals finish call errors */
  finishCallErrors?: number;
  /** When the score was recorded */
  scoredAt: string;
  /** Sync status for optimistic updates */
  syncStatus: SyncStatus;
}

/**
 * Active scoring session
 */
export interface ScoringSession {
  classId: number;
  className: string;
  competitionType: CompetitionType;
  judgeId: string;
  startedAt: string;
  currentEntryIndex: number;
  totalEntries: number;
  scores: Score[];
}

/**
 * Timer area for multi-area scent work
 */
export interface TimerArea {
  id: string;
  name: string;
  startTime: number | null;
  endTime: number | null;
  elapsedTime: number;
  isRunning: boolean;
  isPaused: boolean;
  /** Maximum time in milliseconds */
  maxTime?: number;
}

/**
 * Nationals element types
 */
export type NationalsElementType =
  | 'CONTAINER'
  | 'BURIED'
  | 'INTERIOR'
  | 'EXTERIOR'
  | 'HD_CHALLENGE';

/**
 * Competition day for Nationals
 */
export type CompetitionDay = 1 | 2 | 3;

/**
 * Timer warning state for UI display
 */
export type TimerWarningState = 'normal' | 'warning' | 'expired' | null;
