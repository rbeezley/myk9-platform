/**
 * Nationals Confirmation Dialog Component
 *
 * Extracted from AKCNationalsScoresheet.tsx to reduce complexity.
 * Shows score confirmation before submission.
 */

import React from 'react';
import { DogCard } from '../../../../components/DogCard';
import type { AreaScore } from '../../../../services/scoresheets/areaInitialization';

interface EntryInfo {
  armband: number;
  callName: string;
  breed: string;
  handler: string;
  element?: string;
  level?: string;
}

interface NationalsConfirmationDialogProps {
  show: boolean;
  entry: EntryInfo;
  trialDate: string;
  trialNumber: string;
  qualifying: string;
  areas: AreaScore[];
  totalTime: string;
  alertsCorrect: number;
  alertsIncorrect: number;
  faultCount: number;
  finishCallErrors: number;
  nationalsPoints: number;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const NationalsConfirmationDialog: React.FC<NationalsConfirmationDialogProps> = ({
  show,
  entry,
  trialDate,
  trialNumber,
  qualifying,
  areas,
  totalTime,
  alertsCorrect,
  alertsIncorrect,
  faultCount,
  finishCallErrors,
  nationalsPoints,
  isSubmitting,
  onCancel,
  onConfirm
}) => {
  if (!show) return null;

  const getResultClassName = (result: string): string => {
    const lower = result.toLowerCase();
    return `result-${lower}`;
  };

  const formatResult = (result: string): string => {
    if (result === 'Qualified') return 'Qualified';
    if (result === 'Absent') return 'Absent';
    if (result === 'Excused') return 'Excused';
    return result;
  };

  return (
    <div className="judge-confirmation-overlay">
      <div className="judge-confirmation-dialog">
        <div className="dialog-header">
          <h2>Score Confirmation</h2>
          <div className="trial-info-line">
            {trialDate} \u2022 Trial {trialNumber} \u2022 {entry.element} {entry.level}
          </div>
        </div>

        <div className="dialog-dog-card">
          <DogCard
            armband={entry.armband}
            callName={entry.callName}
            breed={entry.breed}
            handler={entry.handler}
            className="confirmation-dog-card"
          />
        </div>

        <div className="score-details">
          <div className="result-time-grid nationals-mode">
            <div className="score-item">
              <span className="item-label">Result</span>
              <span className={`item-value ${getResultClassName(qualifying)}`}>
                {formatResult(qualifying)}
              </span>
            </div>

            {/* Multi-area search: show each area time + total */}
            {areas.length > 1 ? (
              <>
                {areas.map((area, index) => (
                  <div key={index} className="score-item time-container">
                    <span className="item-label">{area.areaName} Time</span>
                    <span className="item-value time-value">{area.time || '0:00.00'}</span>
                  </div>
                ))}
                <div className="score-item time-container total-time">
                  <span className="item-label">Total Time</span>
                  <span className="item-value time-value total">{totalTime}</span>
                </div>
              </>
            ) : (
              <div className="score-item time-container">
                <span className="item-label">Time</span>
                <span className="item-value time-value">{areas[0]?.time || totalTime}</span>
              </div>
            )}
          </div>

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
              <span className="total-value">{nationalsPoints}</span>
            </div>
          </div>
        </div>

        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="dialog-btn confirm"
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default NationalsConfirmationDialog;
