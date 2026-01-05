/**
 * NationalsPointsDisplay Component
 *
 * Displays Nationals scoring breakdown with points calculation.
 * Shows correct/incorrect calls, faults, finish call errors, and total points.
 *
 * Extracted from AKCNationalsScoresheet.tsx
 */

import React from 'react';
import './NationalsPointsDisplay.css';

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
    <div className="nationals-breakdown">
      <h3>Nationals Scoring</h3>
      <div className="score-grid">
        <div className="score-item">
          <span className="item-label">Correct Calls</span>
          <span className="item-value positive">{alertsCorrect}</span>
        </div>
        <div className="score-item">
          <span className="item-label">Incorrect Calls</span>
          <span className="item-value negative">{alertsIncorrect}</span>
        </div>
        <div className="score-item">
          <span className="item-label">Faults</span>
          <span className="item-value negative">{faultCount}</span>
        </div>
        <div className="score-item">
          <span className="item-label">No Finish Calls</span>
          <span className="item-value negative">{finishCallErrors}</span>
        </div>
      </div>
      <div className="total-points">
        <span className="total-label">Total Points:</span>
        <span className="total-value">{totalPoints}</span>
      </div>
    </div>
  );
}
