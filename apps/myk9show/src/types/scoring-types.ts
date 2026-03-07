/**
 * Comprehensive Scoring Types for Multi-Format Competition Support
 *
 * Defines data structures for scoring across different dog sport disciplines
 * including Scent Work, Agility, Obedience, Rally, and others.
 *
 * Key Features:
 * - Offline-first design with local storage support
 * - Multi-judge conflict resolution
 * - Real-time placement calculations
 * - Format-specific validation rules
 * - Sync queue for background synchronization
 */

import type { QualificationStatus } from './scent-work-types';

// Re-export all format-specific types, type guards, and configs from formats module
export {
  isAgilityScore,
  isObedienceScore,
  isRallyScore,
  isConformationScore,
  isScentWorkScore,
  DEFAULT_SCORING_CONFIGS,
} from './scoring-types-formats';

export type {
  AgilityScore,
  ObedienceScore,
  ObedienceExercise,
  ObedienceDeduction,
  RallyScore,
  ConformationScore,
  TrackingScore,
  LureCoursingScore,
  BarnHuntScore,
  FastCatScore,
  DockDivingScore,
} from './scoring-types-formats';

// Re-export types for external use
export type Score = BaseScore;
export type { QualificationStatus };

// Additional types for realtime scoring service
export interface ScoreUpdate {
  scoreId: string;
  entryId: string;
  classId: string;
  changes: Partial<BaseScore>;
  timestamp: Date;
  judgeId: string;
}

export interface JudgePresence {
  judgeId: string;
  judgeName: string;
  classId: string;
  status: 'online' | 'offline' | 'scoring';
  lastSeen: Date;
}

export interface PlacementUpdate {
  classId: string;
  entryId: string;
  newPlacement: number;
  previousPlacement?: number | undefined;
  timestamp: Date;
}

export interface ScoringConflict {
  id: string;
  entryId: string;
  classId: string;
  conflictType: 'score_mismatch' | 'placement_conflict' | 'judge_conflict';
  details: Record<string, unknown>;
  timestamp: Date;
  resolved: boolean;
}

// ============================================================================
// Base Scoring Types
// ============================================================================

export type ScoringFormat =
  | 'scent_work'
  | 'agility'
  | 'obedience'
  | 'rally'
  | 'conformation'
  | 'tracking'
  | 'lure_coursing'
  | 'barn_hunt'
  | 'fast_cat'
  | 'dock_diving';

export interface BaseScore {
  id?: string | undefined;
  entryId: string;
  classId: string;
  showId?: string | undefined;
  dogId?: string | undefined;
  judgeId: string;
  format: ScoringFormat;

  // Core scoring data
  qualification: QualificationStatus;
  timestamp: Date;

  // Scoring fields
  points?: number | undefined;
  faults?: number | undefined;
  time?: number | undefined;
  placement?: number | undefined;

  // Judge information
  judgeNotes?: string | undefined;
  recordedBy: string;
  recordedAt: Date;

  // Metadata for offline support
  isProvisional?: boolean | undefined;
  placementCalculated?: number | undefined;
  version: number;
  lastModified: Date;
  syncStatus: 'pending' | 'synced' | 'conflict' | 'error';
}

// ============================================================================
// Multi-Judge Scoring
// ============================================================================

export interface MultiJudgeScore {
  entryId: string;
  classId: string;
  format: ScoringFormat;
  judgeScores: Map<string, BaseScore>;
  hasConflicts: boolean;
  conflictResolution?: ConflictResolution;
  finalScore?: BaseScore;
  lastUpdated: Date;
  syncStatus: 'pending' | 'synced' | 'conflict';
}

export interface ConflictResolution {
  strategy: 'average' | 'judge_hierarchy' | 'manual_override' | 'head_judge_final';
  resolvedBy: string;
  resolvedAt: Date;
  resolutionNotes?: string;
}

// ============================================================================
// Placement Calculation
// ============================================================================

export interface JudgeScore extends BaseScore {
  id: string;
  entryId: string;
  classId: string;
  judgeId: string;
  judgeName?: string;
  scoreSheetId?: string;
  signature?: string;
  signedAt?: Date;
}

export interface PlacementCalculation {
  classId: string;
  format: ScoringFormat;
  placements: PlacementEntry[];
  calculatedAt: Date;
  calculatedBy: string;
  tieBreakingRules: TieBreakingRule[];
  appliedTieBreakers: AppliedTieBreaker[];
}

export interface PlacementEntry {
  entryId: string;
  dogName: string;
  handlerName: string;
  armband: string;
  placement?: number | undefined;
  isTied: boolean;
  tiedWith?: string[] | undefined;
  primaryScore: number | string;
  secondaryScore?: number | undefined;
  qualification: QualificationStatus;
  rawScore: BaseScore;
}

export interface TieBreakingRule {
  priority: number;
  criteria: string;
  direction: 'ascending' | 'descending';
  description: string;
}

export interface AppliedTieBreaker {
  entryIds: string[];
  ruleApplied: TieBreakingRule;
  result: 'broken' | 'still_tied';
  resultingPlacements: number[];
}

// ============================================================================
// Scoring Configuration
// ============================================================================

export interface ScoringConfiguration {
  format: ScoringFormat;
  qualifyingThreshold?: number;
  timeWarnings?: number[];
  maxTimeLimit?: number;
  placementRules: PlacementRule[];
  tieBreakingRules: TieBreakingRule[];
  allowMultipleJudges: boolean;
  requireJudgeSignoff: boolean;
  conflictResolutionStrategy: ConflictResolution['strategy'];
  enableOfflineScoring: boolean;
  autoSaveInterval: number;
  enableRealTimeSync: boolean;
}

export interface PlacementRule {
  criteria: string;
  weight: number;
  direction: 'ascending' | 'descending';
  description: string;
}

// ============================================================================
// Scoring Events and Workflow
// ============================================================================

export type ScoringEventType =
  | 'score_started'
  | 'score_updated'
  | 'score_completed'
  | 'score_submitted'
  | 'score_deleted'
  | 'score_error'
  | 'session_started'
  | 'session_completed'
  | 'multi_judge_score_updated'
  | 'placement_calculated'
  | 'placement_update_needed'
  | 'conflict_detected'
  | 'sync_queued'
  | 'sync_completed'
  | 'score_synced'
  | 'score_removed'
  | 'score_cached'
  | 'validation_failed';

export interface ScoringEvent {
  type: ScoringEventType;
  entryId: string;
  classId: string;
  judgeId: string;
  timestamp: Date;
  data?: Record<string, unknown>;
  error?: string;
}

export interface ScoringSession {
  id: string;
  classId: string;
  judgeId: string;
  format: ScoringFormat;
  status: 'active' | 'paused' | 'completed' | 'aborted';
  startTime: Date;
  endTime?: Date;
  totalEntries: number;
  completedEntries: string[];
  currentEntryId?: string;
  entryId?: string;
  workflowStep?: string;
  isActive?: boolean;
  isOffline: boolean;
  pendingSync: BaseScore[];
  lastSyncAt?: Date;
}

// ============================================================================
// Validation Rules
// ============================================================================

export interface ValidationRule {
  field: string;
  rule: 'required' | 'range' | 'format' | 'dependency';
  parameters?: Record<string, unknown>;
  errorMessage: string;
}

export interface ScoringValidation {
  format: ScoringFormat;
  rules: ValidationRule[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}
