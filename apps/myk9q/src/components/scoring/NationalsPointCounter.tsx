/**
 * NationalsPointCounter Component
 *
 * Point tracking component for AKC Nationals scoring
 * Shows real-time point calculations as judge enters alerts, faults, etc.
 */

import React from 'react';
import {
  calculateNationalsPoints,
  formatNationalsPoints,
  NATIONALS_POINTS,
  type NationalsScoreInput
} from './nationalsPoints';
import './shared-scoring.css';

interface NationalsPointCounterProps extends NationalsScoreInput {
  className?: string;
}

export const NationalsPointCounter: React.FC<NationalsPointCounterProps> = ({
  alertsCorrect,
  alertsIncorrect,
  faults,
  finishCallErrors,
  excused,
  className = ''
}) => {
  const totalPoints = calculateNationalsPoints({
    alertsCorrect,
    alertsIncorrect,
    faults,
    finishCallErrors,
    excused
  });
  const isNegative = totalPoints < 0;

  return (
    <div className={`nationals-point-counter ${className}`}>
      <div className="point-counter-header">
        <h3>🏆 NATIONALS POINTS</h3>
        {excused && <span className="excused-badge">EXCUSED</span>}
      </div>

      <div className="point-breakdown">
        {/* Correct Alerts */}
        <div className="point-row positive">
          <span className="point-label">Correct Alerts</span>
          <span className="point-count">{alertsCorrect}</span>
          <span className="point-calculation">× {NATIONALS_POINTS.CORRECT_ALERT}</span>
          <span className="point-value">+{alertsCorrect * NATIONALS_POINTS.CORRECT_ALERT}</span>
        </div>

        {/* Incorrect Alerts */}
        {alertsIncorrect > 0 && (
          <div className="point-row negative">
            <span className="point-label">Incorrect Alerts</span>
            <span className="point-count">{alertsIncorrect}</span>
            <span className="point-calculation">× {NATIONALS_POINTS.INCORRECT_ALERT_PENALTY}</span>
            <span className="point-value">-{alertsIncorrect * NATIONALS_POINTS.INCORRECT_ALERT_PENALTY}</span>
          </div>
        )}

        {/* Faults */}
        {faults > 0 && (
          <div className="point-row negative">
            <span className="point-label">Faults</span>
            <span className="point-count">{faults}</span>
            <span className="point-calculation">× {NATIONALS_POINTS.FAULT_PENALTY}</span>
            <span className="point-value">-{faults * NATIONALS_POINTS.FAULT_PENALTY}</span>
          </div>
        )}

        {/* Finish Call Errors */}
        {finishCallErrors > 0 && (
          <div className="point-row negative">
            <span className="point-label">Finish Errors</span>
            <span className="point-count">{finishCallErrors}</span>
            <span className="point-calculation">× {NATIONALS_POINTS.FINISH_ERROR_PENALTY}</span>
            <span className="point-value">-{finishCallErrors * NATIONALS_POINTS.FINISH_ERROR_PENALTY}</span>
          </div>
        )}
      </div>

      {/* Total Points Display */}
      <div className={`total-points ${isNegative ? 'negative' : 'positive'} ${excused ? 'excused' : ''}`}>
        <span className="total-label">TOTAL POINTS</span>
        <span className="total-value">
          {formatNationalsPoints(totalPoints, excused)}
        </span>
      </div>

      {/* Point Rules Reference */}
      <div className="point-rules">
        <div className="rule">Correct Alert: +{NATIONALS_POINTS.CORRECT_ALERT}</div>
        <div className="rule">Incorrect Alert: -{NATIONALS_POINTS.INCORRECT_ALERT_PENALTY}</div>
        <div className="rule">Fault: -{NATIONALS_POINTS.FAULT_PENALTY}</div>
        <div className="rule">Finish Error: -{NATIONALS_POINTS.FINISH_ERROR_PENALTY}</div>
      </div>
    </div>
  );
};

/**
 * Compact Point Counter for smaller spaces
 */
export const CompactPointCounter: React.FC<NationalsPointCounterProps> = ({
  alertsCorrect,
  alertsIncorrect,
  faults,
  finishCallErrors,
  excused,
  className = ''
}) => {
  const totalPoints = calculateNationalsPoints({
    alertsCorrect,
    alertsIncorrect,
    faults,
    finishCallErrors,
    excused
  });
  const isNegative = totalPoints < 0;

  return (
    <div className={`compact-point-counter ${className}`}>
      <div className="compact-header">
        <span className="compact-title">Points</span>
        {excused && <span className="compact-excused">EX</span>}
      </div>

      <div className={`compact-total ${isNegative ? 'negative' : 'positive'} ${excused ? 'excused' : ''}`}>
        {formatNationalsPoints(totalPoints, excused)}
      </div>

      <div className="compact-breakdown">
        <span className="compact-item positive">C: {alertsCorrect}</span>
        {alertsIncorrect > 0 && <span className="compact-item negative">I: {alertsIncorrect}</span>}
        {faults > 0 && <span className="compact-item negative">F: {faults}</span>}
        {finishCallErrors > 0 && <span className="compact-item negative">E: {finishCallErrors}</span>}
      </div>
    </div>
  );
};
