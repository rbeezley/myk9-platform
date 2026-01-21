/**
 * NationalsPointsDisplay Component
 *
 * Displays Nationals scoring breakdown with points calculation.
 * Shows correct/incorrect calls, faults, finish call errors, and total points.
 *
 * Extracted from AKCNationalsScoresheet.tsx
 */

import React from 'react';
import { cn } from '@/lib/utils';

/** Tailwind styles for NationalsPointsDisplay */
const styles = {
  breakdown: cn(
    "mt-4 p-4",
    "bg-blue-500/5 border border-blue-500/20 rounded-lg"
  ),
  title: cn(
    "m-0 mb-3 text-base font-semibold",
    "text-[var(--text-primary)]"
  ),
  scoreGrid: "grid grid-cols-2 gap-3 mb-4",
  scoreItem: "flex flex-col gap-1",
  itemLabel: "text-[13px] text-[var(--text-secondary)] font-medium",
  itemValue: "text-xl font-bold",
  valuePositive: "text-teal-500",
  valueNegative: "text-red-500",
  totalRow: cn(
    "flex justify-between items-center p-3",
    "bg-blue-500/10 rounded-md border-2 border-blue-500/30"
  ),
  totalLabel: "text-base font-semibold text-[var(--text-primary)]",
  totalValue: "text-2xl font-bold text-blue-500",
};

/**
 * Props for NationalsPointsDisplay component
 */
export interface NationalsPointsDisplayProps {
  /** Number of correct alert calls */
  alertsCorrect: number;
  /** Number of incorrect alert calls */
  alertsIncorrect: number;
  /** Number of faults */
  faultCount: number;
  /** Number of finish call errors */
  finishCallErrors: number;
  /** Total points calculated */
  totalPoints: number;
}

/**
 * NationalsPointsDisplay Component
 *
 * Displays the Nationals scoring breakdown in a confirmation dialog or scoresheet view.
 *
 * **Scoring Rules**:
 * - Correct Calls: +10 points each
 * - Incorrect Calls: -5 points each
 * - Faults: -5 points each
 * - No Finish Calls: -5 points each
 *
 * **Features**:
 * - Color-coded values (positive/negative)
 * - Clear scoring breakdown
 * - Prominent total points display
 * - Consistent Nationals scoring presentation
 *
 * **Use Cases**:
 * - Score confirmation dialog
 * - Real-time scoring display during judging
 * - Results review and verification
 * - Nationals competition scoring
 *
 * @example
 * ```tsx
 * <NationalsPointsDisplay
 *   alertsCorrect={3}
 *   alertsIncorrect={1}
 *   faultCount={2}
 *   finishCallErrors={0}
 *   totalPoints={15}
 * />
 * ```
 */
export function NationalsPointsDisplay({
  alertsCorrect,
  alertsIncorrect,
  faultCount,
  finishCallErrors,
  totalPoints
}: NationalsPointsDisplayProps): React.ReactElement {
  return (
    <div className={styles.breakdown}>
      <h3 className={styles.title}>Nationals Scoring</h3>
      <div className={styles.scoreGrid}>
        <div className={styles.scoreItem}>
          <span className={styles.itemLabel}>Correct Calls</span>
          <span className={cn(styles.itemValue, styles.valuePositive)}>{alertsCorrect}</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.itemLabel}>Incorrect Calls</span>
          <span className={cn(styles.itemValue, styles.valueNegative)}>{alertsIncorrect}</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.itemLabel}>Faults</span>
          <span className={cn(styles.itemValue, styles.valueNegative)}>{faultCount}</span>
        </div>
        <div className={styles.scoreItem}>
          <span className={styles.itemLabel}>No Finish Calls</span>
          <span className={cn(styles.itemValue, styles.valueNegative)}>{finishCallErrors}</span>
        </div>
      </div>
      <div className={styles.totalRow}>
        <span className={styles.totalLabel}>Total Points:</span>
        <span className={styles.totalValue}>{totalPoints}</span>
      </div>
    </div>
  );
}
