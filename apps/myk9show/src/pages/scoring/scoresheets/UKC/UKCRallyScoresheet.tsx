/**
 * UKC Rally Scoresheet - Adapted for myK9Show
 *
 * Point-based scoring: Start at 100, deductions reduce score.
 * Qualifying: 70+ points required.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';

// CSS imports (shared styling)
import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';
import { logger } from '@/services/LoggingService';

// Types
interface UKCRallyScoresheetProps {
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
    maxTime?: string;
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

type QualifyingResult = 'Q' | 'NQ' | '';

/**
 * Parse smart time input (e.g., "12345" -> "1:23.45")
 */
function parseSmartTime(input: string): string {
  if (!input) return '';
  if (input.includes(':')) return input;

  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';

  const padded = digits.padStart(5, '0');
  const minutes = parseInt(padded.slice(0, -4), 10);
  const seconds = padded.slice(-4, -2);
  const hundredths = padded.slice(-2);

  return `${minutes}:${seconds}.${hundredths}`;
}

/**
 * Parse time string to milliseconds
 */
function parseTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return (mins * 60 + secs) * 1000;
}

export const UKCRallyScoresheet: React.FC<UKCRallyScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev,
}) => {
  // Scoring state
  const [totalScore] = useState(100); // UKC Rally starts with 100 points
  const [deductions, setDeductions] = useState(0);
  const [courseTime, setCourseTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Timer - 5 minutes max for rally course
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime || '5:00.00',
    level: classInfo.level,
  });

  const calculateFinalScore = useCallback(() => {
    return Math.max(0, totalScore - deductions);
  }, [totalScore, deductions]);

  const calculateQualifying = useCallback((): 'Q' | 'NQ' => {
    const finalScore = calculateFinalScore();
    // UKC Rally requires 70+ points to qualify (70% of 100)
    return finalScore >= 70 ? 'Q' : 'NQ';
  }, [calculateFinalScore]);

  // Stop timer and copy time
  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    setCourseTime(stopwatch.formatTime(stopwatch.time));
  }, [stopwatch]);

  const handleSubmit = async () => {
    if (!qualifying && !courseTime) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeMs = parseTimeToMs(courseTime);
      const finalQualifying = qualifying || calculateQualifying();

      await onSave({
        time: timeMs,
        faults: deductions,
        qualification: finalQualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setDeductions(0);
        setCourseTime('');
        setQualifying('');
        setNonQualifyingReason('');
        stopwatch.reset();
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

  const finalScore = calculateFinalScore();
  const calculatedQualifying = calculateQualifying();

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
                UKC Rally
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

            {/* Timer Section */}
            <div className="scoresheet-timer-card">
              <div className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
                {stopwatch.formatTime(stopwatch.time)}
              </div>

              <div className="timer-countdown-display">
                {stopwatch.time > 0 ? (
                  <>Remaining: {stopwatch.getRemainingTime()}</>
                ) : (
                  <>Max Time: {classInfo.maxTime || '5:00.00'}</>
                )}
              </div>

              <div className="timer-controls-flutter">
                {stopwatch.isRunning ? (
                  <button className="timer-btn-start stop" onClick={handleStopTimer}>
                    Stop
                  </button>
                ) : stopwatch.time > 0 ? (
                  stopwatch.isTimeExpired() ? (
                    <button className="timer-btn-start reset" onClick={stopwatch.reset}>
                      Reset
                    </button>
                  ) : (
                    <button className="timer-btn-start resume" onClick={stopwatch.start}>
                      Resume
                    </button>
                  )
                ) : (
                  <button className="timer-btn-start start" onClick={stopwatch.start}>
                    Start
                  </button>
                )}
              </div>
            </div>

            {/* Course Time Input */}
            <div className="scoresheet-time-card">
              <div className="time-input-flutter">
                <label>Course Time</label>
                <div className="scoresheet-time-input-wrapper">
                  <input
                    type="text"
                    value={courseTime}
                    onChange={(e) => setCourseTime(e.target.value)}
                    onBlur={(e) => setCourseTime(parseSmartTime(e.target.value))}
                    placeholder="Type: 12345 or 1:23.45"
                    className="scoresheet-time-input"
                  />
                  {courseTime && (
                    <button
                      type="button"
                      className="scoresheet-time-clear-button"
                      onClick={() => setCourseTime('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Score Section */}
            <div className="rally-score-section">
              <div className="score-grid">
                <div className="score-item">
                  <label>Starting Score</label>
                  <div className="score-value">{totalScore}</div>
                </div>
                <div className="score-item">
                  <label>Deductions</label>
                  <div className="deduction-controls">
                    <button onClick={() => setDeductions(Math.max(0, deductions - 1))}>-</button>
                    <span className="deduction-value">{deductions}</span>
                    <button onClick={() => setDeductions(deductions + 1)}>+</button>
                  </div>
                </div>
                <div className="score-item final">
                  <label>Final Score</label>
                  <div className={`score-value ${finalScore >= 70 ? 'qualifying' : 'nq'}`}>
                    {finalScore}
                  </div>
                  <div className="qualifying-indicator">
                    {calculatedQualifying === 'Q' ? 'Qualifying (70+ required)' : 'Non-Qualifying'}
                  </div>
                </div>
              </div>
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
              </div>

              {qualifying === 'NQ' && (
                <div className="nq-reason-section">
                  <label>NQ Reason:</label>
                  <textarea
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    placeholder="Enter reason for NQ..."
                    rows={2}
                  />
                </div>
              )}
            </div>

            {/* Validation */}
            {!courseTime && (
              <div className="validation-warning">
                Course time is required to submit a score
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
                disabled={isSubmitting || !courseTime}
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
                    {(qualifying || calculatedQualifying) === 'Q' ? 'Qualified' : 'NQ'}
                  </span>
                </div>
                <div className="score-item">
                  <span className="item-label">Final Score</span>
                  <span className="item-value">{finalScore}/100</span>
                </div>
                <div className="score-item">
                  <span className="item-label">Course Time</span>
                  <span className="item-value time-value">{courseTime || '0:00.00'}</span>
                </div>
                {deductions > 0 && (
                  <div className="score-item">
                    <span className="item-label">Deductions</span>
                    <span className="item-value negative">{deductions}</span>
                  </div>
                )}
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

export default UKCRallyScoresheet;
