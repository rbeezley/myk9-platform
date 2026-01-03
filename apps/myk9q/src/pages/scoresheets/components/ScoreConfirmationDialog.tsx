/**
 * ScoreConfirmationDialog
 *
 * Extracted from AKCScentWorkScoresheet.tsx (DEBT-008) to reduce main component complexity.
 * Displays a confirmation modal before submitting a score.
 */

import React from 'react';
import { DogCard } from '../../../components/DogCard';
import { haptic } from '@/hooks/useHapticFeedback';
import type { AreaScore } from '../../../services/scoresheets/areaInitialization';

export interface ScoreConfirmationDialogProps {
  /** Whether the dialog is visible */
  isOpen: boolean;
  /** Close the dialog */
  onClose: () => void;
  /** Submit the score */
  onConfirm: () => void;
  /** Whether submission is in progress */
  isSubmitting: boolean;
  /** Trial date display string */
  trialDate: string;
  /** Trial number */
  trialNumber: string;
  /** Current entry data */
  entry: {
    armband: number;
    callName: string;
    breed: string;
    handler: string;
    element?: string;
    level?: string;
  };
  /** Qualifying status: Q, NQ, ABS, EX */
  qualifying: string | null;
  /** Areas with times */
  areas: AreaScore[];
  /** Fault count */
  faultCount: number;
  /** Non-qualifying reason */
  nonQualifyingReason: string;
  /** Calculate total time function */
  calculateTotalTime: () => string;
  /** Element Time for UKC Nosework Superior/Master/Elite levels (optional) */
  elementTime?: string;
}

/**
 * Format qualifying status for display
 */
function formatQualifying(qualifying: string | null): string {
  switch (qualifying) {
    case 'Q': return 'Qualified';
    case 'NQ': return 'NQ';
    case 'ABS': return 'Absent';
    case 'EX': return 'Excused';
    default: return qualifying || '';
  }
}

/**
 * Check if result is non-qualifying (NQ, Absent, Excused, Withdrawn)
 */
function isNonQualifying(qualifying: string | null): boolean {
  const q = (qualifying || '').toUpperCase();
  return q === 'NQ' || q === 'ABS' || q === 'EX' || q === 'WD';
}

export const ScoreConfirmationDialog: React.FC<ScoreConfirmationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isSubmitting,
  trialDate,
  trialNumber,
  entry,
  qualifying,
  areas,
  faultCount,
  nonQualifyingReason,
  calculateTotalTime,
  elementTime
}) => {
  if (!isOpen) return null;

  const isMultiArea = areas.length > 1;

  // Build trial info parts, filtering out empty values
  const trialInfoParts = [
    trialDate,
    trialNumber ? `Trial ${trialNumber}` : '',
    entry.element ? `${entry.element} ${entry.level || ''}`.trim() : ''
  ].filter(Boolean);

  return (
    <div className="judge-confirmation-overlay">
      <div className="judge-confirmation-dialog">
        <div className="dialog-header">
          <h2>Score Confirmation</h2>
          <div className="trial-info-line">
            {trialInfoParts.join(' • ') || 'Trial Information'}
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
          <div className="result-time-grid">
            {/* Result */}
            <div className="score-item">
              <span className="item-label">Result</span>
              <span className={`item-value result-${qualifying?.toLowerCase()}`}>
                {formatQualifying(qualifying)}
              </span>
            </div>

            {/* Multi-area: show each area time + total */}
            {isMultiArea ? (
              <>
                {areas.map((area, index) => (
                  <div key={index} className="score-item time-container">
                    <span className="item-label">{area.areaName} Time</span>
                    <span className="item-value time-value">
                      {isNonQualifying(qualifying) ? '0:00.00' : (area.time || '0:00.00')}
                    </span>
                  </div>
                ))}
                <div className="score-item time-container total-time">
                  <span className="item-label">Total Time</span>
                  <span className="item-value time-value total">
                    {isNonQualifying(qualifying) ? '0:00.00' : calculateTotalTime()}
                  </span>
                </div>
              </>
            ) : (
              /* Single area: show time */
              <div className="score-item time-container">
                <span className="item-label">{elementTime ? 'Search Time' : 'Time'}</span>
                <span className="item-value time-value">
                  {isNonQualifying(qualifying) ? '0:00.00' : (areas[0]?.time || calculateTotalTime())}
                </span>
              </div>
            )}

            {/* Element Time - UKC Nosework Superior/Master/Elite */}
            {elementTime && (
              <div className="score-item time-container element-time">
                <span className="item-label">Element Time</span>
                <span className="item-value time-value">
                  {isNonQualifying(qualifying) ? '0:00.00' : elementTime}
                </span>
              </div>
            )}

            {/* Faults */}
            {faultCount > 0 && (
              <div className="score-item">
                <span className="item-label">Faults</span>
                <span className="item-value negative">{faultCount}</span>
              </div>
            )}

            {/* NQ/EX Reason */}
            {nonQualifyingReason && (qualifying === 'NQ' || qualifying === 'EX') && (
              <div className="score-item">
                <span className="item-label">{qualifying === 'EX' ? 'Excused' : 'NQ'} Reason</span>
                <span className="item-value">{nonQualifyingReason}</span>
              </div>
            )}
          </div>
        </div>

        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="dialog-btn confirm"
            onClick={() => { haptic.success(); onConfirm(); }}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScoreConfirmationDialog;
