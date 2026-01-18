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

import type { ScentWorkResult, QualificationStatus } from './scent-work-types';

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
// Agility Scoring
// ============================================================================

export interface AgilityScore extends BaseScore {
  format: 'agility';

  // Time and faults
  courseTime: number;           // Milliseconds
  standardCourseTime?: number;  // SCT in milliseconds
  timeLimit?: number;          // Maximum time allowed

  // Fault tracking
  jumpFaults: number;          // 5-point faults
  refusals: number;            // 20-point faults  
  otherFaults: number;         // Table, contact, etc.
  totalFaults: number;         // Calculated total

  // Disqualifications
  excusedEliminated?: boolean;
  eliminationReason?: string;

  // Performance data
  yardagePerSecond?: number;   // Speed calculation
  isQualifying?: boolean;      // Q vs NQ
  points?: number;            // MACH points, etc.
}

// ============================================================================
// Obedience Scoring
// ============================================================================

export interface ObedienceScore extends BaseScore {
  format: 'obedience';

  // Exercise scores
  exercises?: ObedienceExercise[] | undefined;
  totalScore?: number | undefined;          // Sum of all exercises
  maximumScore?: number | undefined;        // Perfect score for class

  // Qualification thresholds
  qualifyingScore?: number | undefined;     // Minimum to qualify (170+ typically)
  isQualifying?: boolean | undefined;

  // Special conditions
  nonQualifyingExercise?: string | undefined; // Exercise that caused NQ
  excusedExercise?: string | undefined;      // Exercise dog was excused from
}

export interface ObedienceExercise {
  name: string;
  maxPoints: number;
  pointsAwarded: number;
  deductions: ObedienceDeduction[];
  nonQualifying?: boolean;     // Failed exercise
  excused?: boolean;          // Excused from exercise
}

export interface ObedienceDeduction {
  reason: string;
  points: number;
  description?: string;
}

// ============================================================================
// Rally Scoring
// ============================================================================

export interface RallyScore extends BaseScore {
  format: 'rally';

  // Course performance
  courseTime: number;          // Milliseconds
  maxCourseTime?: number;      // Time limit

  // Point deductions
  stationDeductions: number;   // Minor deductions (1-3 points)
  lackOfControl: number;      // 10-point deductions
  repeatStation: number;      // 3-point deductions
  totalDeductions: number;    // Sum of all deductions

  // Final score (210 - deductions)
  finalScore: number;
  qualifyingScore: number;    // Usually 170+
  isQualifying: boolean;

  // Special circumstances
  timeFault?: boolean;        // Exceeded time limit
  excusedStation?: string;    // Station dog was excused from
}

// ============================================================================
// Conformation Scoring
// ============================================================================

export interface ConformationScore extends BaseScore {
  format: 'conformation';

  // Placement-based scoring
  placement?: number | undefined;          // 1st, 2nd, 3rd, 4th, etc.
  awardLevel?: 'Winners' | 'Best of Breed' | 'Best of Opposite Sex' | 'Select Dog' | 'Select Bitch' | 'Award of Merit' | undefined;

  // Points awarded
  pointsAwarded: number;       // Championship points
  majorWin?: boolean | undefined;         // 3+ points
  specialtyWin?: boolean | undefined;     // Specialty show win

  // Judge assessment (optional)
  gaitScore?: number | undefined;         // 1-10 scale
  typeScore?: number | undefined;         // 1-10 scale
  temperamentScore?: number | undefined;  // 1-10 scale

  // Competition level
  competitionLevel?: 'Puppy' | 'Open' | 'Bred-by-Exhibitor' | 'American Bred' | 'Specials' | undefined;
}

// ============================================================================
// Specialized Sports
// ============================================================================

export interface TrackingScore extends BaseScore {
  format: 'tracking';

  // Pass/fail system
  passed?: boolean | undefined;

  // Track details
  trackLength?: number | undefined;        // Yards
  trackAge?: number | undefined;          // Hours
  articlesFindRequired?: number | undefined;
  articlesFound?: number | undefined;

  // Weather conditions
  weatherConditions?: string | undefined;
  windDirection?: string | undefined;
  temperature?: number | undefined;
}

export interface LureCoursingScore extends BaseScore {
  format: 'lure_coursing';

  // Performance scores (1-25 each)
  overall: number;
  follow: number;
  speed: number;
  agility: number;
  endurance: number;

  // Total and qualification
  totalScore: number;          // Sum of all categories
  qualifyingScore: number;     // Usually 65+
  isQualifying: boolean;

  // Course details
  courseYardage?: number;
  runTime?: number;           // Milliseconds
}

export interface BarnHuntScore extends BaseScore {
  format: 'barn_hunt';

  // Time and performance
  courseTime: number;          // Milliseconds
  timeLimit: number;          // Class time limit

  // Rat tube findings
  ratsFound: number;
  ratsRequired: number;
  correctFinds: number;
  falseAlerts: number;

  // Special conditions
  safetyViolation?: boolean;
  handlerHelp?: boolean;
  popping?: boolean;          // Leaving course early
}

export interface FastCatScore extends BaseScore {
  format: 'fast_cat';

  // Performance metrics
  runTime: number;            // Milliseconds for 100-yard dash
  speed: number;              // Miles per hour

  // Points calculation
  handicapPoints: number;     // Based on height/age
  basePoints: number;        // Speed-based points
  totalPoints: number;       // Final FAST points

  // Course conditions
  courseYardage: number;      // Usually 100 yards
  surfaceCondition?: string;
}

export interface DockDivingScore extends BaseScore {
  format: 'dock_diving';

  // Distance/height measurements
  distance?: number;          // Feet and inches for Big Air
  height?: number;           // Inches for Extreme Vertical
  time?: number;             // Milliseconds for Speed Retrieve

  // Division and event type
  division: 'Novice' | 'Senior' | 'Master' | 'Elite';
  eventType: 'Big Air' | 'Extreme Vertical' | 'Speed Retrieve';

  // Best measurements
  bestDistance?: number;
  bestHeight?: number;
  bestTime?: number;

  // Jump validity
  validJump: boolean;
  invalidReason?: string;
}

// ============================================================================
// Multi-Judge Scoring
// ============================================================================

export interface MultiJudgeScore {
  entryId: string;
  classId: string;
  format: ScoringFormat;

  // Judge scores
  judgeScores: Map<string, BaseScore>;  // judgeId -> score

  // Conflict resolution
  hasConflicts: boolean;
  conflictResolution?: ConflictResolution;
  finalScore?: BaseScore;

  // Metadata
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

  // Placement data
  placements: PlacementEntry[];

  // Calculation metadata
  calculatedAt: Date;
  calculatedBy: string;

  // Tie handling
  tieBreakingRules: TieBreakingRule[];
  appliedTieBreakers: AppliedTieBreaker[];
}

export interface PlacementEntry {
  entryId: string;
  dogName: string;
  handlerName: string;
  armband: string;

  // Placement info
  placement?: number | undefined;
  isTied: boolean;
  tiedWith?: string[] | undefined;        // Entry IDs of tied entries

  // Score summary
  primaryScore: number | string;  // Main sorting criteria
  secondaryScore?: number | undefined;        // Tie-breaker
  qualification: QualificationStatus;

  // Raw score reference
  rawScore: BaseScore;
}

export interface TieBreakingRule {
  priority: number;            // 1 = primary, 2 = secondary, etc.
  criteria: string;           // 'time', 'faults', 'age', etc.
  direction: 'ascending' | 'descending';  // Faster time wins vs higher score wins
  description: string;
}

export interface AppliedTieBreaker {
  entryIds: string[];          // Entries involved in tie
  ruleApplied: TieBreakingRule;
  result: 'broken' | 'still_tied';
  resultingPlacements: number[];
}

// ============================================================================
// Scoring Configuration
// ============================================================================

export interface ScoringConfiguration {
  format: ScoringFormat;

  // Format-specific rules
  qualifyingThreshold?: number;
  timeWarnings?: number[];     // Warning thresholds in seconds
  maxTimeLimit?: number;       // Maximum allowed time

  // Placement rules
  placementRules: PlacementRule[];
  tieBreakingRules: TieBreakingRule[];

  // Judge settings
  allowMultipleJudges: boolean;
  requireJudgeSignoff: boolean;
  conflictResolutionStrategy: ConflictResolution['strategy'];

  // Offline features
  enableOfflineScoring: boolean;
  autoSaveInterval: number;    // Milliseconds
  enableRealTimeSync: boolean;
}

export interface PlacementRule {
  criteria: string;            // What to sort by
  weight: number;             // Importance (1.0 = primary)
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

  // Session state
  status: 'active' | 'paused' | 'completed' | 'aborted';
  startTime: Date;
  endTime?: Date;

  // Progress tracking
  totalEntries: number;
  completedEntries: string[]; // Array of completed entry IDs
  currentEntryId?: string;

  // Current entry tracking
  entryId?: string; // Current entry being scored
  workflowStep?: string; // Current workflow step
  isActive?: boolean; // Whether session is currently active

  // Offline support
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

// ============================================================================
// Type Guards
// ============================================================================

export function isAgilityScore(score: BaseScore): score is AgilityScore {
  return score.format === 'agility';
}

export function isObedienceScore(score: BaseScore): score is ObedienceScore {
  return score.format === 'obedience';
}

export function isRallyScore(score: BaseScore): score is RallyScore {
  return score.format === 'rally';
}

export function isConformationScore(score: BaseScore): score is ConformationScore {
  return score.format === 'conformation';
}

export function isScentWorkScore(score: unknown): score is ScentWorkResult {
  return Boolean(score && typeof score === 'object' && 'format' in score && (score as { format: string }).format === 'scent_work');
}

// ============================================================================
// Default Configurations
// ============================================================================

export const DEFAULT_SCORING_CONFIGS: Record<ScoringFormat, ScoringConfiguration> = {
  scent_work: {
    format: 'scent_work',
    qualifyingThreshold: 1, // Just need to qualify
    timeWarnings: [30, 10], // 30s and 10s warnings
    placementRules: [
      { criteria: 'searchTime', weight: 1.0, direction: 'ascending', description: 'Fastest time wins' },
      { criteria: 'faults', weight: 0.8, direction: 'ascending', description: 'Fewest faults wins' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'time', direction: 'ascending', description: 'Faster time breaks tie' },
      { priority: 2, criteria: 'faults', direction: 'ascending', description: 'Fewer faults breaks tie' }
    ],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000, // 30 seconds
    enableRealTimeSync: true
  },

  agility: {
    format: 'agility',
    qualifyingThreshold: 0, // No faults required
    placementRules: [
      { criteria: 'totalFaults', weight: 1.0, direction: 'ascending', description: 'Fewest faults wins' },
      { criteria: 'courseTime', weight: 0.9, direction: 'ascending', description: 'Fastest time wins' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'courseTime', direction: 'ascending', description: 'Faster time breaks tie' }
    ],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  obedience: {
    format: 'obedience',
    qualifyingThreshold: 170,
    placementRules: [
      { criteria: 'totalScore', weight: 1.0, direction: 'descending', description: 'Highest score wins' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'totalScore', direction: 'descending', description: 'Higher score breaks tie' }
    ],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  rally: {
    format: 'rally',
    qualifyingThreshold: 170,
    placementRules: [
      { criteria: 'finalScore', weight: 1.0, direction: 'descending', description: 'Highest score wins' },
      { criteria: 'courseTime', weight: 0.5, direction: 'ascending', description: 'Faster time for ties' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'courseTime', direction: 'ascending', description: 'Faster time breaks tie' }
    ],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  conformation: {
    format: 'conformation',
    placementRules: [
      { criteria: 'placement', weight: 1.0, direction: 'ascending', description: 'Lower placement number wins' }
    ],
    tieBreakingRules: [],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  tracking: {
    format: 'tracking',
    placementRules: [
      { criteria: 'passed', weight: 1.0, direction: 'descending', description: 'Pass/Fail only' }
    ],
    tieBreakingRules: [],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  lure_coursing: {
    format: 'lure_coursing',
    qualifyingThreshold: 65,
    placementRules: [
      { criteria: 'totalScore', weight: 1.0, direction: 'descending', description: 'Highest score wins' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'speed', direction: 'descending', description: 'Higher speed breaks tie' }
    ],
    allowMultipleJudges: true,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'average',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  barn_hunt: {
    format: 'barn_hunt',
    placementRules: [
      { criteria: 'ratsFound', weight: 1.0, direction: 'descending', description: 'Most rats found wins' },
      { criteria: 'courseTime', weight: 0.8, direction: 'ascending', description: 'Fastest time for ties' }
    ],
    tieBreakingRules: [
      { priority: 1, criteria: 'courseTime', direction: 'ascending', description: 'Faster time breaks tie' }
    ],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  fast_cat: {
    format: 'fast_cat',
    placementRules: [
      { criteria: 'speed', weight: 1.0, direction: 'descending', description: 'Fastest speed wins' }
    ],
    tieBreakingRules: [],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  },

  dock_diving: {
    format: 'dock_diving',
    placementRules: [
      { criteria: 'distance', weight: 1.0, direction: 'descending', description: 'Longest distance wins' }
    ],
    tieBreakingRules: [],
    allowMultipleJudges: false,
    requireJudgeSignoff: true,
    conflictResolutionStrategy: 'manual_override',
    enableOfflineScoring: true,
    autoSaveInterval: 30000,
    enableRealTimeSync: true
  }
};