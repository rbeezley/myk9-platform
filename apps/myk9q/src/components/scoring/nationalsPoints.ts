/**
 * Nationals Point Calculation Utilities
 *
 * Single source of truth for AKC Nationals scoring rules.
 * Used by NationalsPointCounter and CompactPointCounter.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface NationalsScoreInput {
  alertsCorrect: number;
  alertsIncorrect: number;
  faults: number;
  finishCallErrors: number;
  excused: boolean;
}

export interface NationalsPointBreakdown {
  correctPoints: number;
  incorrectPenalty: number;
  faultPenalty: number;
  finishErrorPenalty: number;
  totalPoints: number;
  isNegative: boolean;
}

// ============================================================================
// CONSTANTS - AKC Nationals Scoring Rules
// ============================================================================

export const NATIONALS_POINTS = {
  CORRECT_ALERT: 10,
  INCORRECT_ALERT_PENALTY: 5,
  FAULT_PENALTY: 2,
  FINISH_ERROR_PENALTY: 5,
} as const;

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate total points for a Nationals run
 *
 * @param input - Score components (alerts, faults, etc.)
 * @returns Total points (0 if excused)
 *
 * @example
 * calculateNationalsPoints({
 *   alertsCorrect: 3,
 *   alertsIncorrect: 1,
 *   faults: 2,
 *   finishCallErrors: 0,
 *   excused: false
 * })
 * // Returns: 30 - 5 - 4 - 0 = 21
 */
export function calculateNationalsPoints(input: NationalsScoreInput): number {
  if (input.excused) return 0;

  const correctPoints = input.alertsCorrect * NATIONALS_POINTS.CORRECT_ALERT;
  const incorrectPenalty = input.alertsIncorrect * NATIONALS_POINTS.INCORRECT_ALERT_PENALTY;
  const faultPenalty = input.faults * NATIONALS_POINTS.FAULT_PENALTY;
  const finishErrorPenalty = input.finishCallErrors * NATIONALS_POINTS.FINISH_ERROR_PENALTY;

  return correctPoints - incorrectPenalty - faultPenalty - finishErrorPenalty;
}

/**
 * Get full point breakdown for display
 *
 * @param input - Score components
 * @returns Breakdown with all point values and total
 */
export function getNationalsPointBreakdown(input: NationalsScoreInput): NationalsPointBreakdown {
  const correctPoints = input.alertsCorrect * NATIONALS_POINTS.CORRECT_ALERT;
  const incorrectPenalty = input.alertsIncorrect * NATIONALS_POINTS.INCORRECT_ALERT_PENALTY;
  const faultPenalty = input.faults * NATIONALS_POINTS.FAULT_PENALTY;
  const finishErrorPenalty = input.finishCallErrors * NATIONALS_POINTS.FINISH_ERROR_PENALTY;

  const totalPoints = input.excused
    ? 0
    : correctPoints - incorrectPenalty - faultPenalty - finishErrorPenalty;

  return {
    correctPoints,
    incorrectPenalty,
    faultPenalty,
    finishErrorPenalty,
    totalPoints,
    isNegative: totalPoints < 0,
  };
}

/**
 * Format points for display with +/- prefix
 *
 * @param points - Point value
 * @param excused - Whether the run was excused
 * @returns Formatted string (e.g., "+21", "-5", "0")
 */
export function formatNationalsPoints(points: number, excused: boolean): string {
  if (excused) return '0';
  if (points >= 0) return `+${points}`;
  return String(points);
}
