/**
 * @myk9/scoring
 *
 * Scoring logic, stores, hooks, and utilities for dog show scoring.
 *
 * Supports:
 * - AKC Scent Work (including Nationals)
 * - AKC Fast CAT
 * - UKC Obedience, Rally, Nosework
 * - ASCA Scent Detection
 *
 * @packageDocumentation
 */

// Types
export type {
  QualifyingResult,
  CompetitionType,
  SyncStatus,
  Score,
  ScoringSession,
  TimerArea,
  NationalsElementType,
  CompetitionDay,
  TimerWarningState,
} from './types';

// Stores
export {
  useScoringStore,
  createScoringStore,
  type ScoringState,
} from './stores/scoringStore';

export {
  useTimerStore,
  createTimerStore,
  type TimerState,
} from './stores/timerStore';

// Utils - Calculations
export {
  calculateTotalAreaTime,
  formatTimeDisplay,
  formatSecondsDisplay,
  calculateRemainingTime,
  calculateFastCatMph,
  calculateNationalsPoints,
} from './utils/calculationUtils';

// Utils - Nationals
export {
  mapElementToNationalsType,
  getNationalsElementDisplayName,
  getAllNationalsElementTypes,
  isValidNationalsElement,
  getNationalsMaxTime,
  getNationalsMaxTimeFormatted,
  isValidCompetitionDay,
  getCompetitionDayName,
} from './utils/nationalsUtils';
