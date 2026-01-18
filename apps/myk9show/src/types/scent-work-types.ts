/**
 * Scent Work Result Entry Types
 * 
 * Defines the data structures for Scent Work competition results,
 * extending the base competition system with sport-specific requirements.
 */

import type { ShowEntry } from './entry-lifecycle';
import type { Registration } from './dog-types';
import type { CheckInStatus } from './check-in-types';

// Base qualification status
export type QualificationStatus = 'Qualified' | 'Not Qualified' | 'Absent' | 'Excused' | 'Withdrawn' | 'Eliminated';

// NQ reasons specific to Scent Work
export type NQReason = 
  | 'timeout'           // Exceeded time limit
  | 'wrongIndication'   // False alert on non-hide location
  | 'handlerError'      // Handler interference or violation
  | 'dogError'          // Dog behavior issues
  | 'noFind'           // Failed to locate hide within time
  | 'absent'           // Did not compete
  | 'withdrawn';       // Withdrawn by handler

// Area status for multi-area classes
export type AreaStatus = 'locked' | 'ready' | 'active' | 'completed' | 'failed';

// Multi-area timing state
export interface MultiAreaTimingState {
  currentAreaIndex: number;
  areaStatuses: AreaStatus[];
  areaTimes: number[];
  totalElapsedTime: number;
  isRunning: boolean;
}

// Single-area Scent Work result
export interface ScentWorkResult {
  // Identity and timing
  entryId: string;
  classId: string;

  // Core timing data (in milliseconds for precision)
  searchTime: number;           // Actual search time from stopwatch
  maxTimeAllowed: number;       // Class time limit

  // Scoring
  qualification: QualificationStatus;
  faults: number;              // Progressive fault counter
  nqReason?: NQReason | undefined;         // Reason for NQ if applicable (legacy)
  qualificationReason?: string | undefined; // New flexible reason field for NQ/Excused/Withdrawn

  // Judge information
  judgeNotes?: string | undefined;         // Optional judge comments
  recordedBy: string;          // Judge/steward who recorded result
  recordedAt: Date;            // Timestamp of result entry

  // Metadata
  isProvisional?: boolean | undefined;     // Preliminary result, not yet final
  placementCalculated?: number | undefined; // Calculated placement (1st, 2nd, etc.)
}

// Multi-area result for Interior Excellent & Masters
export interface AreaResult {
  areaNumber: number;          // 1, 2, or 3
  searchTime: number;          // Individual area time in milliseconds
  qualification?: QualificationStatus | undefined; // Area qualification status
  faults: number;             // Area-specific faults
  nqReason?: NQReason | undefined;        // Area-specific NQ reason
  hideCount?: number | undefined;         // For Masters unknown number of hides
}

export interface MultiAreaScentWorkResult {
  // Identity and timing
  entryId: string;
  classId: string;

  // Multi-area specific data
  areaResults: AreaResult[];   // Results for each area
  totalSearchTime: number;     // Sum of all area times
  qualification: QualificationStatus; // Overall qualification
  totalFaults: number;         // Sum of all area faults

  // Judge information
  judgeNotes?: string | undefined;
  recordedBy: string;
  recordedAt: Date;

  // Metadata
  isProvisional?: boolean | undefined;
  placementCalculated?: number | undefined;
}

// Class configuration for different Scent Work elements and levels
export interface ScentWorkClassConfig {
  element: 'Container' | 'Interior' | 'Exterior' | 'Buried';
  level: 'Novice' | 'Advanced' | 'Excellent' | 'Masters';
  timeLimit: number;           // Time limit in milliseconds
  multiArea?: boolean | undefined;         // True for Interior Excellent/Masters
  areaLimits?: number[] | undefined;       // Individual area time limits for multi-area
  warningsEnabled: boolean;    // False for Masters level
  hideCount?: number | 'unknown' | undefined; // Number of hides (unknown for Masters)
}

// Entry data specifically for Scent Work judging interface
export interface ScentWorkEntry extends ShowEntry {
  // Additional data needed for judging
  classConfig: ScentWorkClassConfig;

  // Dog registration information for tooltip display
  registrations?: Registration[] | undefined;

  // Dog/handler display information
  displayInfo: {
    armband: string;
    dogName: string;
    dogBreed: string;
    handlerName: string;
    dogId: string;
    handlerId: string;
  };

  // Current judging state
  judgingState?: {
    timerStarted?: Date | undefined;
    currentResult?: Partial<ScentWorkResult> | undefined;
    isInProgress: boolean;
  } | undefined;

  // Check-in status for exhibitor management
  checkInStatus?: CheckInStatus | undefined;
}

// Store interface for Scent Work results
export interface ScentWorkResultStore {
  // Current judging session
  currentClassId?: string;
  currentEntryId?: string;
  
  // Results storage
  results: Map<string, ScentWorkResult | MultiAreaScentWorkResult>;
  pendingResults: Map<string, Partial<ScentWorkResult>>;
  
  // Actions
  startJudging: (classId: string, entryId: string) => void;
  saveResult: (result: ScentWorkResult | MultiAreaScentWorkResult) => Promise<void>;
  updatePendingResult: (entryId: string, updates: Partial<ScentWorkResult>) => void;
  clearPendingResult: (entryId: string) => void;
  
  // Queries
  getResult: (entryId: string) => ScentWorkResult | MultiAreaScentWorkResult | undefined;
  getPendingResult: (entryId: string) => Partial<ScentWorkResult> | undefined;
  getClassResults: (classId: string) => (ScentWorkResult | MultiAreaScentWorkResult)[];
  
  // Calculations
  calculatePlacement: (classId: string) => void;
  isResultComplete: (result: Partial<ScentWorkResult>) => boolean;
}

// Time limit constants by element and level
export const SCENT_WORK_TIME_LIMITS = {
  'Container': {
    'Novice': 120000,     // 2:00
    'Advanced': 150000,   // 2:30  
    'Excellent': 180000,  // 3:00
    'Masters': 180000     // 3:00
  },
  'Interior': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00 per area (2 areas total)
    'Masters': {          // 3 areas with different limits
      area1: 60000,       // 1:00
      area2: 150000,      // 2:30
      area3: 300000       // 5:00
    }
  },
  'Exterior': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00
    'Masters': 240000     // 4:00
  },
  'Buried': {
    'Novice': 180000,     // 3:00
    'Advanced': 210000,   // 3:30
    'Excellent': 240000,  // 4:00
    'Masters': 240000     // 4:00
  }
} as const;

// Helper function to get time limit for a class
export function getTimeLimit(element: ScentWorkClassConfig['element'], level: ScentWorkClassConfig['level']): number {
  const elementLimits = SCENT_WORK_TIME_LIMITS[element];
  const levelLimit = elementLimits[level];
  
  if (typeof levelLimit === 'number') {
    return levelLimit;
  }
  
  // Handle Interior Masters with area-specific limits
  if (element === 'Interior' && level === 'Masters' && typeof levelLimit === 'object') {
    return levelLimit.area1; // Return first area limit for single timer usage
  }
  
  throw new Error(`Invalid time limit configuration for ${element} ${level}`);
}

// Helper function to determine if class supports multi-area timing
export function isMultiAreaClass(element: ScentWorkClassConfig['element'], level: ScentWorkClassConfig['level']): boolean {
  return element === 'Interior' && (level === 'Excellent' || level === 'Masters');
}

// Helper function to get area time limits for multi-area classes
export function getAreaTimeLimits(element: ScentWorkClassConfig['element'], level: ScentWorkClassConfig['level']): number[] {
  if (element === 'Interior' && level === 'Excellent') {
    return [240000, 240000]; // 4:00 each for 2 areas
  }
  
  if (element === 'Interior' && level === 'Masters') {
    const mastersLimits = SCENT_WORK_TIME_LIMITS.Interior.Masters as { area1: number; area2: number; area3: number };
    return [mastersLimits.area1, mastersLimits.area2, mastersLimits.area3];
  }
  
  return [];
}

// Validation helpers
export function validateScentWorkResult(result: Partial<ScentWorkResult>): boolean {
  return !!(
    result.entryId &&
    result.classId &&
    typeof result.searchTime === 'number' &&
    result.qualification &&
    typeof result.faults === 'number' &&
    result.recordedBy
  );
}

export function validateMultiAreaScentWorkResult(result: Partial<MultiAreaScentWorkResult>): boolean {
  if (!result.entryId || !result.classId || !result.recordedBy) return false;
  if (typeof result.totalSearchTime !== 'number') return false;
  if (!result.qualification) return false;
  if (!result.areaResults || result.areaResults.length === 0) return false;
  
  // All areas must have valid data
  return result.areaResults.every((area: AreaResult) => 
    typeof area.areaNumber === 'number' &&
    typeof area.searchTime === 'number' &&
    area.qualification &&
    typeof area.faults === 'number'
  );
}

export function isTimeExpired(searchTime: number, maxTime: number): boolean {
  return searchTime > maxTime;
}

export function shouldShowWarning(remainingTime: number, level: ScentWorkClassConfig['level']): boolean {
  // Masters level doesn't get warnings per AKC rules
  if (level === 'Masters') return false;
  
  // Warning at 30 seconds remaining
  return remainingTime <= 30000 && remainingTime > 0;
}