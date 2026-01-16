/**
 * AKC Nationals Scent Work Scoring Constants
 *
 * These values define the official AKC Nationals scoring rules.
 * Centralizing them ensures consistency across:
 * - nationalsScoring.ts (calculation service)
 * - AKCNationalsScoresheet.tsx (UI component)
 * - Test files
 *
 * Reference: AKC Scent Work Nationals Rules
 */

/**
 * Point values for scoring calculations
 */
export const NATIONALS_SCORING = {
  /** Points awarded for each correct alert */
  CORRECT_ALERT_POINTS: 10,

  /** Points deducted for each incorrect alert */
  INCORRECT_ALERT_PENALTY: 5,

  /** Points deducted for each fault */
  FAULT_PENALTY: 2,

  /** Points deducted for each finish call error */
  FINISH_CALL_ERROR_PENALTY: 5,

  /** Points for excused dogs (special case) */
  EXCUSED_DOG_POINTS: 0,

  /** Time assigned to excused/no-time entries (seconds) */
  MAX_TIME_SECONDS: 120,

  /** Number of top qualifiers who advance to Day 3 finals */
  TOP_QUALIFIERS_COUNT: 100,
} as const;

/**
 * Validation ranges for input fields
 */
export const NATIONALS_VALIDATION = {
  /** Correct alerts: 0-10 */
  ALERTS_CORRECT_MIN: 0,
  ALERTS_CORRECT_MAX: 10,

  /** Incorrect alerts: 0-10 */
  ALERTS_INCORRECT_MIN: 0,
  ALERTS_INCORRECT_MAX: 10,

  /** Faults: 0-20 */
  FAULTS_MIN: 0,
  FAULTS_MAX: 20,

  /** Finish call errors: 0-10 */
  FINISH_CALL_ERRORS_MIN: 0,
  FINISH_CALL_ERRORS_MAX: 10,

  /** Time: 0-120 seconds */
  TIME_MIN: 0,
  TIME_MAX: 120,
} as const;

/**
 * Type for scoring constants (for type safety in calculations)
 */
export type NationalsScoringConstants = typeof NATIONALS_SCORING;
export type NationalsValidationConstants = typeof NATIONALS_VALIDATION;
