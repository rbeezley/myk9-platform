/**
 * AKC FastCAT Scoresheet - Adapted for myK9Show
 *
 * Fast Coursing Ability Test - 100-yard dash.
 * Dogs earn points based on their speed (MPH).
 *
 * FastCAT Formula:
 * - Course length: 100 yards
 * - MPH = (100 * 3600) / (time_seconds * 1760)
 * - Points = MPH * handicap (based on dog height)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';

// CSS imports (shared styling)
import '../BaseScoresheet.css';
import './scoresheet-shared.css';
import './AKCScentWorkScoresheet-JudgeDialog.css';

// FastCAT constants
const FASTCAT_COURSE = {
  LENGTH_YARDS: 100,
  YARDS_PER_MILE: 1760,
  SECONDS_PER_HOUR: 3600,
  POINTS_MULTIPLIER: 2, // Simplified; actual AKC uses height-based handicaps
} as const;

// Types
interface AKCFastCatScoresheetProps {
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

type QualifyingResult = 'Q' | 'NQ' | 'E' | 'DQ' | '';

/**
 * Parse time string to seconds
 */
function parseTimeToSeconds(timeString: string): number {
  if (!timeString) return 0;

  const parts = timeString.split(':');
  if (parts.length === 2) {
    // MM:SS.ms format
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return (minutes * 60) + seconds;
  } else {
    // SS.ms format
    return parseFloat(timeString) || 0;
  }
}

export const AKCFastCatScoresheet: React.FC<AKCFastCatScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev,
}) => {
  // Scoring state
  const [runTime, setRunTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Timer - 60 seconds max for FastCAT
  const stopwatch = useStopwatch({
    maxTime: '1:00.00',
    level: classInfo.level,
  });

  // Auto-copy timer to run time when stopped
  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    // Convert to seconds format (SS.ss)
    const totalMs = stopwatch.time;
    const seconds = (totalMs / 1000).toFixed(2);
    setRunTime(seconds);
  }, [stopwatch]);

  // Calculate MPH and points automatically when runTime changes
  const { mph, points } = useMemo(() => {
    if (!runTime) {
      return { mph: 0, points: 0 };
    }

    const timeInSeconds = parseTimeToSeconds(runTime);
    if (timeInSeconds <= 0) {
      return { mph: 0, points: 0 };
    }

    // Calculate MPH: (Distance in yards * SECONDS_PER_HOUR) / (Time in seconds * YARDS_PER_MILE)
    const calculatedMph = (FASTCAT_COURSE.LENGTH_YARDS * FASTCAT_COURSE.SECONDS_PER_HOUR) /
                          (timeInSeconds * FASTCAT_COURSE.YARDS_PER_MILE);
    const roundedMph = Math.round(calculatedMph * 100) / 100;

    // Calculate points based on speed
    const basePoints = Math.round(calculatedMph * FASTCAT_COURSE.POINTS_MULTIPLIER);

    return { mph: roundedMph, points: basePoints };
  }, [runTime]);

  const handleSubmit = async () => {
    if (!runTime && !qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeInSeconds = parseTimeToSeconds(runTime);
      const finalQualifying = qualifying || 'Q';

      await onSave({
        time: timeInSeconds * 1000, // Convert to ms
        faults: 0,
        qualification: finalQualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setRunTime('');
        setQualifying('');
        setNonQualifyingReason('');
        stopwatch.reset();
        onNavigate('next');
      } else {
        onBack();
      }
    } catch (error) {
      console.error('Failed to save score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <div className="scoresheet-container fastcat">
        <div className="scoresheet">
          {/* Header */}
          <header className="page-header mobile-header">
            <button className="back-button" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
            <div className="header-content">
              <h1>
                <ClipboardCheck className="title-icon" />
                AKC FastCAT
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
              <div className={`timer-display-large ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
                {stopwatch.formatTime(stopwatch.time)}
              </div>

              <div className="timer-controls-flutter">
                {stopwatch.isRunning ? (
                  <button className="timer-btn-start stop" onClick={handleStopTimer}>
                    Stop
                  </button>
                ) : stopwatch.time > 0 ? (
                  <button className="timer-btn-start resume" onClick={stopwatch.start}>
                    Resume
                  </button>
                ) : (
                  <button className="timer-btn-start start" onClick={stopwatch.start}>
                    Start
                  </button>
                )}
                <button
                  className="timer-btn-reset"
                  onClick={stopwatch.reset}
                  disabled={stopwatch.isRunning}
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Time Input Section */}
            <div className="scoresheet-time-card">
              <div className="time-input-flutter">
                <label>Run Time (seconds)</label>
                <div className="scoresheet-time-input-wrapper">
                  <input
                    type="text"
                    placeholder="SS.ss"
                    value={runTime}
                    onChange={(e) => setRunTime(e.target.value)}
                    className="scoresheet-time-input"
                  />
                  {runTime && (
                    <button
                      type="button"
                      className="scoresheet-time-clear-button"
                      onClick={() => setRunTime('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Results Display */}
            {runTime && mph > 0 && (
              <div className="fastcat-results">
                <div className="result-card">
                  <span className="result-label">Speed</span>
                  <span className="result-value">{mph.toFixed(2)} MPH</span>
                </div>
                <div className="result-card">
                  <span className="result-label">Points</span>
                  <span className="result-value">{points}</span>
                </div>
              </div>
            )}

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
                  className={`result-chip ${qualifying === 'E' ? 'selected excused' : ''}`}
                  onClick={() => { setQualifying('E'); setNonQualifyingReason('Excused'); }}
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
            {!runTime && (
              <div className="validation-warning">
                Run time is required to submit a score
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
                disabled={isSubmitting || !runTime}
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
                  <span className={`item-value result-${(qualifying || 'q').toLowerCase()}`}>
                    {qualifying === 'Q' || !qualifying ? 'Qualified' :
                     qualifying === 'NQ' ? 'NQ' :
                     qualifying === 'E' ? 'Excused' : 'DQ'}
                  </span>
                </div>
                <div className="score-item">
                  <span className="item-label">Run Time</span>
                  <span className="item-value time-value">{runTime || '0.00'}s</span>
                </div>
                <div className="score-item">
                  <span className="item-label">Speed</span>
                  <span className="item-value">{mph.toFixed(2)} MPH</span>
                </div>
                <div className="score-item">
                  <span className="item-label">Points</span>
                  <span className="item-value">{points}</span>
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

export default AKCFastCatScoresheet;
