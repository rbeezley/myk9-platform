/**
 * Format-Specific Scoring Types
 *
 * Defines data structures for scoring across different dog sport disciplines
 * including Agility, Obedience, Rally, Conformation, Tracking, Lure Coursing,
 * Barn Hunt, FastCAT, and Dock Diving.
 *
 * Re-exported from scoring-types.ts for backward compatibility.
 */

import type { ScentWorkResult } from './scent-work-types';
import type { BaseScore, ScoringFormat, ScoringConfiguration } from './scoring-types';

// ============================================================================
// Agility Scoring
// ============================================================================

export interface AgilityScore extends BaseScore {
  format: 'agility';

  // Time and faults
  courseTime: number; // Milliseconds
  standardCourseTime?: number; // SCT in milliseconds
  timeLimit?: number; // Maximum time allowed

  // Fault tracking
  jumpFaults: number; // 5-point faults
  refusals: number; // 20-point faults
  otherFaults: number; // Table, contact, etc.
  totalFaults: number; // Calculated total

  // Disqualifications
  excusedEliminated?: boolean;
  eliminationReason?: string;

  // Performance data
  yardagePerSecond?: number; // Speed calculation
  isQualifying?: boolean; // Q vs NQ
  points?: number; // MACH points, etc.
}

// ============================================================================
// Obedience Scoring
// ============================================================================

export interface ObedienceScore extends BaseScore {
  format: 'obedience';

  // Exercise scores
  exercises?: ObedienceExercise[] | undefined;
  totalScore?: number | undefined; // Sum of all exercises
  maximumScore?: number | undefined; // Perfect score for class

  // Qualification thresholds
  qualifyingScore?: number | undefined; // Minimum to qualify (170+ typically)
  isQualifying?: boolean | undefined;

  // Special conditions
  nonQualifyingExercise?: string | undefined; // Exercise that caused NQ
  excusedExercise?: string | undefined; // Exercise dog was excused from
}

export interface ObedienceExercise {
  name: string;
  maxPoints: number;
  pointsAwarded: number;
  deductions: ObedienceDeduction[];
  nonQualifying?: boolean; // Failed exercise
  excused?: boolean; // Excused from exercise
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
  courseTime: number; // Milliseconds
  maxCourseTime?: number; // Time limit

  // Point deductions
  stationDeductions: number; // Minor deductions (1-3 points)
  lackOfControl: number; // 10-point deductions
  repeatStation: number; // 3-point deductions
  totalDeductions: number; // Sum of all deductions

  // Final score (210 - deductions)
  finalScore: number;
  qualifyingScore: number; // Usually 170+
  isQualifying: boolean;

  // Special circumstances
  timeFault?: boolean; // Exceeded time limit
  excusedStation?: string; // Station dog was excused from
}

// ============================================================================
// Conformation Scoring
// ============================================================================

export interface ConformationScore extends BaseScore {
  format: 'conformation';

  // Placement-based scoring
  placement?: number | undefined;
  awardLevel?:
    | 'Winners'
    | 'Best of Breed'
    | 'Best of Opposite Sex'
    | 'Select Dog'
    | 'Select Bitch'
    | 'Award of Merit'
    | undefined;

  // Points awarded
  pointsAwarded: number; // Championship points
  majorWin?: boolean | undefined;
  specialtyWin?: boolean | undefined;

  // Judge assessment (optional)
  gaitScore?: number | undefined;
  typeScore?: number | undefined;
  temperamentScore?: number | undefined;

  // Competition level
  competitionLevel?:
    | 'Puppy'
    | 'Open'
    | 'Bred-by-Exhibitor'
    | 'American Bred'
    | 'Specials'
    | undefined;
}

// ============================================================================
// Specialized Sports
// ============================================================================

export interface TrackingScore extends BaseScore {
  format: 'tracking';
  passed?: boolean | undefined;
  trackLength?: number | undefined;
  trackAge?: number | undefined;
  articlesFindRequired?: number | undefined;
  articlesFound?: number | undefined;
  weatherConditions?: string | undefined;
  windDirection?: string | undefined;
  temperature?: number | undefined;
}

export interface LureCoursingScore extends BaseScore {
  format: 'lure_coursing';
  overall: number;
  follow: number;
  speed: number;
  agility: number;
  endurance: number;
  totalScore: number;
  qualifyingScore: number;
  isQualifying: boolean;
  courseYardage?: number;
  runTime?: number;
}

export interface BarnHuntScore extends BaseScore {
  format: 'barn_hunt';
  courseTime: number;
  timeLimit: number;
  ratsFound: number;
  ratsRequired: number;
  correctFinds: number;
  falseAlerts: number;
  safetyViolation?: boolean;
  handlerHelp?: boolean;
  popping?: boolean;
}

export interface FastCatScore extends BaseScore {
  format: 'fast_cat';
  runTime: number;
  speed: number;
  handicapPoints: number;
  basePoints: number;
  totalPoints: number;
  courseYardage: number;
  surfaceCondition?: string;
}

export interface DockDivingScore extends BaseScore {
  format: 'dock_diving';
  distance?: number;
  height?: number;
  time?: number;
  division: 'Novice' | 'Senior' | 'Master' | 'Elite';
  eventType: 'Big Air' | 'Extreme Vertical' | 'Speed Retrieve';
  bestDistance?: number;
  bestHeight?: number;
  bestTime?: number;
  validJump: boolean;
  invalidReason?: string;
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
  return Boolean(
    score &&
    typeof score === 'object' &&
    'format' in score &&
    (score as { format: string }).format === 'scent_work'
  );
}

// ============================================================================
// Default Configurations
// ============================================================================

const BASE_CONFIG = {
  allowMultipleJudges: false,
  requireJudgeSignoff: true,
  conflictResolutionStrategy: 'manual_override' as const,
  enableOfflineScoring: true,
  autoSaveInterval: 30000,
  enableRealTimeSync: true,
};

export const DEFAULT_SCORING_CONFIGS: Record<ScoringFormat, ScoringConfiguration> = {
  scent_work: {
    ...BASE_CONFIG,
    format: 'scent_work',
    qualifyingThreshold: 1,
    timeWarnings: [30, 10],
    placementRules: [
      {
        criteria: 'searchTime',
        weight: 1.0,
        direction: 'ascending',
        description: 'Fastest time wins',
      },
      {
        criteria: 'faults',
        weight: 0.8,
        direction: 'ascending',
        description: 'Fewest faults wins',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'time',
        direction: 'ascending',
        description: 'Faster time breaks tie',
      },
      {
        priority: 2,
        criteria: 'faults',
        direction: 'ascending',
        description: 'Fewer faults breaks tie',
      },
    ],
  },
  agility: {
    ...BASE_CONFIG,
    format: 'agility',
    qualifyingThreshold: 0,
    placementRules: [
      {
        criteria: 'totalFaults',
        weight: 1.0,
        direction: 'ascending',
        description: 'Fewest faults wins',
      },
      {
        criteria: 'courseTime',
        weight: 0.9,
        direction: 'ascending',
        description: 'Fastest time wins',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'courseTime',
        direction: 'ascending',
        description: 'Faster time breaks tie',
      },
    ],
  },
  obedience: {
    ...BASE_CONFIG,
    format: 'obedience',
    qualifyingThreshold: 170,
    placementRules: [
      {
        criteria: 'totalScore',
        weight: 1.0,
        direction: 'descending',
        description: 'Highest score wins',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'totalScore',
        direction: 'descending',
        description: 'Higher score breaks tie',
      },
    ],
  },
  rally: {
    ...BASE_CONFIG,
    format: 'rally',
    qualifyingThreshold: 170,
    placementRules: [
      {
        criteria: 'finalScore',
        weight: 1.0,
        direction: 'descending',
        description: 'Highest score wins',
      },
      {
        criteria: 'courseTime',
        weight: 0.5,
        direction: 'ascending',
        description: 'Faster time for ties',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'courseTime',
        direction: 'ascending',
        description: 'Faster time breaks tie',
      },
    ],
  },
  conformation: {
    ...BASE_CONFIG,
    format: 'conformation',
    placementRules: [
      {
        criteria: 'placement',
        weight: 1.0,
        direction: 'ascending',
        description: 'Lower placement number wins',
      },
    ],
    tieBreakingRules: [],
  },
  tracking: {
    ...BASE_CONFIG,
    format: 'tracking',
    placementRules: [
      { criteria: 'passed', weight: 1.0, direction: 'descending', description: 'Pass/Fail only' },
    ],
    tieBreakingRules: [],
  },
  lure_coursing: {
    ...BASE_CONFIG,
    format: 'lure_coursing',
    qualifyingThreshold: 65,
    allowMultipleJudges: true,
    conflictResolutionStrategy: 'average',
    placementRules: [
      {
        criteria: 'totalScore',
        weight: 1.0,
        direction: 'descending',
        description: 'Highest score wins',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'speed',
        direction: 'descending',
        description: 'Higher speed breaks tie',
      },
    ],
  },
  barn_hunt: {
    ...BASE_CONFIG,
    format: 'barn_hunt',
    placementRules: [
      {
        criteria: 'ratsFound',
        weight: 1.0,
        direction: 'descending',
        description: 'Most rats found wins',
      },
      {
        criteria: 'courseTime',
        weight: 0.8,
        direction: 'ascending',
        description: 'Fastest time for ties',
      },
    ],
    tieBreakingRules: [
      {
        priority: 1,
        criteria: 'courseTime',
        direction: 'ascending',
        description: 'Faster time breaks tie',
      },
    ],
  },
  fast_cat: {
    ...BASE_CONFIG,
    format: 'fast_cat',
    placementRules: [
      {
        criteria: 'speed',
        weight: 1.0,
        direction: 'descending',
        description: 'Fastest speed wins',
      },
    ],
    tieBreakingRules: [],
  },
  dock_diving: {
    ...BASE_CONFIG,
    format: 'dock_diving',
    placementRules: [
      {
        criteria: 'distance',
        weight: 1.0,
        direction: 'descending',
        description: 'Longest distance wins',
      },
    ],
    tieBreakingRules: [],
  },
};
