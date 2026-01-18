/**
 * UKC Obedience Scoresheet - Adapted for myK9Show
 *
 * Point-based scoring out of 200.
 * Qualifying: 170+ points with no zeroes.
 */

import React, { useState } from 'react';
import { ClipboardCheck, ArrowLeft } from 'lucide-react';
import { logger } from '@/services/LoggingService';

// CSS imports (shared styling)
import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';

// Types
interface UKCObedienceScoresheetProps {
  entry: {
    entryId: string;
    armband: number;
    callName: string;
    breed: string;
    handler: string;
    element?: string;
    level?: string;
  };
  classInfo: {
    name: string;
    level?: string;
  };
  onSave: (result: ScoringResult) => Promise<void>;
  onNavigate: (direction: 'prev' | 'next') => void;
  onBack: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ScoringResult {
  time: number;
  faults: number;
  qualification: string;
  notes?: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'DQ' | '';

export const UKCObedienceScoresheet: React.FC<UKCObedienceScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state
  const [points, setPoints] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handlePointsChange = (value: string) => {
    // Allow only numbers and one decimal point (max 200.0)
    const regex = /^\d{0,3}(\.\d{0,1})?$/;
    if (regex.test(value) || value === '') {
      setPoints(value);
    }
  };

  const calculateQualifying = (score: number): 'Q' | 'NQ' => {
    // UKC Obedience qualifying score: 170+ out of 200
    return score >= 170 ? 'Q' : 'NQ';
  };

  const handleSubmit = async () => {
    if (!points && !qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const scoreValue = parseFloat(points) || 0;
      const finalQualifying = qualifying || calculateQualifying(scoreValue);

      await onSave({
        time: 0, // Obedience doesn't use time
        faults: 200 - scoreValue, // Deductions from max
        qualification: finalQualifying,
        ...(nonQualifyingReason && { notes: nonQualifyingReason }),
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setPoints('');
        setQualifying('');
        setNonQualifyingReason('');
        onNavigate('next');
      } else {
        onBack();
      }
    } catch (error) {
      logger.error('Failed to save score:', 'pages', {}, error as Error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const scoreValue = parseFloat(points) || 0;
  const calculatedQualifying = calculateQualifying(scoreValue);

  return (
    <>
      <div className="scoresheet-container">
        <div className="scoresheet">
          {/* Header */}
          <header className="page-header mobile-header">
            <button className="back-button" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
            <div className="header-content">
              <h1>
                <ClipboardCheck className="title-icon" />
                UKC Obedience
              </h1>
              <div className="header-trial-info">
                <span>{classInfo.name}</span>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="scoresheet-content-wrapper">
            {/* Dog Info Card */}
            <div className="scoresheet-dog-info-card">
              <div className="armband-badge">#{entry.armband}</div>
              <div className="scoresheet-dog-details">
                <div className="scoresheet-dog-name">{entry.callName}</div>
                <div className="scoresheet-dog-breed">{entry.breed}</div>
                <div className="scoresheet-dog-handler">Handler: {entry.handler}</div>
              </div>
            </div>

            {/* Score Input Section */}
            <div className="obedience-score-section">
              <div className="score-input-large">
                <label htmlFor="points">Score Points</label>
                <input
                  id="points"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={points}
                  onChange={(e) => handlePointsChange(e.target.value)}
                  className="points-input"
                  autoFocus
                />
                <span className="max-points">out of 200.0</span>
              </div>

              {/* Qualifying indicator */}
              {points && (
                <div className={`qualifying-indicator ${calculatedQualifying.toLowerCase()}`}>
                  {calculatedQualifying === 'Q'
                    ? 'Qualifying (170+ required)'
                    : 'Non-Qualifying (below 170)'}
                </div>
              )}
            </div>

            {/* Results Section */}
            <div className="results-section">
              <div className="result-chips">
                <button
                  className={`result-chip ${qualifying === 'Q' ? 'selected qualified' : ''}`}
                  onClick={() => { setQualifying('Q'); setNonQualifyingReason(''); }}
                >
                  Qualified
                </button>
                <button
                  className={`result-chip ${qualifying === 'NQ' ? 'selected nq' : ''}`}
                  onClick={() => { setQualifying('NQ'); }}
                >
                  NQ
                </button>
                <button
                  className={`result-chip ${qualifying === 'EX' ? 'selected excused' : ''}`}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Excused'); }}
                >
                  Excused
                </button>
                <button
                  className={`result-chip ${qualifying === 'DQ' ? 'selected dq' : ''}`}
                  onClick={() => { setQualifying('DQ'); }}
                >
                  DQ
                </button>
              </div>

              {(qualifying === 'NQ' || qualifying === 'DQ') && (
                <div className="nq-reason-section">
                  <label>Reason:</label>
                  <textarea
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    placeholder={`Enter reason for ${qualifying}...`}
                    rows={2}
                  />
                </div>
              )}
            </div>

            {/* Validation */}
            {!points && (
              <div className="validation-warning">
                Score points are required to submit
              </div>
            )}

            {/* Action Buttons */}
            <div className="scoresheet-actions">
              <button className="scoresheet-btn-cancel" onClick={onBack}>
                Cancel
              </button>
              <button
                className="scoresheet-btn-save"
                onClick={handleSubmit}
                disabled={isSubmitting || !points}
              >
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="judge-confirmation-overlay">
          <div className="judge-confirmation-dialog">
            <div className="dialog-header">
              <h2>Score Confirmation</h2>
              <div className="trial-info-line">{classInfo.name}</div>
            </div>

            <div className="dialog-dog-card">
              <div className="confirmation-dog-card">
                <div className="armband-badge">#{entry.armband}</div>
                <div className="dog-info">
                  <div className="call-name">{entry.callName}</div>
                  <div className="breed">{entry.breed}</div>
                  <div className="handler">Handler: {entry.handler}</div>
                </div>
              </div>
            </div>

            <div className="score-details">
              <div className="result-time-grid">
                <div className="score-item">
                  <span className="item-label">Result</span>
                  <span className={`item-value result-${(qualifying || calculatedQualifying).toLowerCase()}`}>
                    {(qualifying || calculatedQualifying) === 'Q' ? 'Qualified' :
                     (qualifying || calculatedQualifying) === 'NQ' ? 'NQ' :
                     (qualifying || calculatedQualifying) === 'EX' ? 'Excused' : 'DQ'}
                  </span>
                </div>
                <div className="score-item">
                  <span className="item-label">Score</span>
                  <span className="item-value">{points || '0'} / 200.0</span>
                </div>
                {nonQualifyingReason && (
                  <div className="score-item">
                    <span className="item-label">Reason</span>
                    <span className="item-value">{nonQualifyingReason}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="dialog-actions">
              <button className="dialog-btn cancel" onClick={() => setShowConfirmation(false)}>
                Cancel
              </button>
              <button
                className="dialog-btn confirm"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UKCObedienceScoresheet;
