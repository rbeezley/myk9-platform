/**
 * AKC Scent Work Scoresheet
 *
 * Ported from myK9Q with identical CSS styling but adapted for myK9Show's data layer.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';
import { logger } from '@/services/LoggingService';

// CSS imports (from myK9Q for visual consistency)
import '../BaseScoresheet.css';
import './scoresheet-shared.css';
import './AKCScentWorkScoresheet-JudgeDialog.css';
import '../../styles/containers.css';

// Types
interface AKCScentWorkScoresheetProps {
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
    maxTime: string;
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

interface AreaScore {
  time: string;
  areaName: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

/**
 * Parse smart time input (e.g., "12345" -> "1:23.45")
 */
function parseSmartTime(input: string): string {
  if (!input) return '';

  // If already formatted (contains colon), validate and return
  if (input.includes(':')) {
    return input;
  }

  // Parse digits only
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';

  // Pad to 5 digits (M:SS.ss format)
  const padded = digits.padStart(5, '0');
  const minutes = parseInt(padded.slice(0, -4), 10);
  const seconds = padded.slice(-4, -2);
  const hundredths = padded.slice(-2);

  return `${minutes}:${seconds}.${hundredths}`;
}

export const AKCScentWorkScoresheet: React.FC<AKCScentWorkScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state
  const [areas, setAreas] = useState<AreaScore[]>([{ time: '', areaName: 'Search' }]);
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Stopwatch
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      handleAreaUpdate(0, 'time', formattedTime);
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    }
  });

  // Handlers
  const handleAreaUpdate = useCallback((index: number, field: 'time', value: string) => {
    setAreas(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const handleSmartTimeInput = (index: number, value: string) => {
    handleAreaUpdate(index, 'time', value);
  };

  const handleTimeInputBlur = (index: number, value: string) => {
    const parsed = parseSmartTime(value);
    handleAreaUpdate(index, 'time', parsed);
  };

  const clearTimeInput = (index: number) => {
    handleAreaUpdate(index, 'time', '');
  };

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    if (areas.length === 1) {
      handleAreaUpdate(0, 'time', stopwatch.formatTime(stopwatch.time));
    }
  }, [stopwatch, areas.length, handleAreaUpdate]);

  const isAllTimesComplete = areas.every(area => area.time && area.time !== '');

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const totalMs = areas.reduce((sum, area) => {
        if (!area.time) return sum;
        const parts = area.time.split(':');
        const mins = parseInt(parts[0], 10) || 0;
        const secs = parseFloat(parts[1] || '0');
        return sum + (mins * 60 + secs) * 1000;
      }, 0);

      await onSave({
        time: totalMs,
        faults: faultCount,
        qualification: qualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas([{ time: '', areaName: 'Search' }]);
        setQualifying('');
        setNonQualifyingReason('');
        setFaultCount(0);
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

  // Warning message
  const warningMessage = stopwatch.getWarningMessage();
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
  const remainingSeconds = remainingTimeMs / 1000;

  // Ring color for countdown
  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444';
    if (remainingSeconds <= 30) return '#ef4444';
    if (remainingSeconds <= 40) return '#f59e0b';
    return '#22c55e';
  };

  const cornerRingSize = 40;
  const strokeWidth = 4;
  const cornerRadius = (cornerRingSize - strokeWidth) / 2;
  const cornerCircumference = 2 * Math.PI * cornerRadius;
  const progress = maxTimeMs > 0 ? Math.max(0, remainingTimeMs / maxTimeMs) : 1;
  const cornerStrokeDashoffset = cornerCircumference * (1 - progress);

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
                AKC Scent Work
              </h1>
              <div className="header-trial-info">
                <span>{entry.element} {entry.level}</span>
              </div>
            </div>
          </header>

          {/* Content Wrapper */}
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
              {/* Countdown ring */}
              {maxTimeMs > 0 && (
                <svg
                  className="timer-countdown-ring-corner"
                  width={cornerRingSize}
                  height={cornerRingSize}
                  viewBox={`0 0 ${cornerRingSize} ${cornerRingSize}`}
                >
                  <circle
                    cx={cornerRingSize / 2}
                    cy={cornerRingSize / 2}
                    r={cornerRadius}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.2)"
                    strokeWidth={strokeWidth}
                  />
                  <circle
                    cx={cornerRingSize / 2}
                    cy={cornerRingSize / 2}
                    r={cornerRadius}
                    fill="none"
                    stroke={getRingColor()}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={cornerCircumference}
                    strokeDashoffset={cornerStrokeDashoffset}
                    transform={`rotate(-90 ${cornerRingSize / 2} ${cornerRingSize / 2})`}
                  />
                </svg>
              )}

              <button
                className="timer-btn-reset"
                onClick={stopwatch.reset}
                disabled={stopwatch.isRunning}
                title={stopwatch.isRunning ? "Reset disabled while timer is running" : "Reset timer"}
              >
                ⟲
              </button>

              {/* Main timer display */}
              <div className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
                {stopwatch.formatTime(stopwatch.time)}
              </div>

              {/* Countdown display */}
              <div className="timer-countdown-display">
                {stopwatch.time > 0 ? (
                  <>Remaining: {stopwatch.getRemainingTime()}</>
                ) : (
                  <>Max Time: {classInfo.maxTime}</>
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

            {/* Timer Warning Message */}
            {warningMessage && (
              <div className={`timer-warning ${warningMessage === 'Time Expired' ? 'expired' : 'warning'}`}>
                {warningMessage}
              </div>
            )}

            {/* Time Input */}
            {areas.map((area, index) => (
              <div key={index} className="scoresheet-time-card">
                <div className="time-input-flutter">
                  <div className="scoresheet-time-input-wrapper">
                    <input
                      type="text"
                      value={area.time || ''}
                      onChange={(e) => handleSmartTimeInput(index, e.target.value)}
                      onBlur={(e) => handleTimeInputBlur(index, e.target.value)}
                      placeholder="Type: 12345 or 1:23.45"
                      className="scoresheet-time-input single-area"
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="scoresheet-time-clear-button"
                        onClick={() => clearTimeInput(index)}
                        title="Clear time"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="max-time-display">
                    Max: {classInfo.maxTime}
                  </div>
                </div>
              </div>
            ))}

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
                  onClick={() => { setQualifying('NQ'); setNonQualifyingReason('Incorrect Call'); }}
                >
                  NQ
                </button>
                <button
                  className={`result-chip ${qualifying === 'ABS' ? 'selected absent' : ''}`}
                  onClick={() => { setQualifying('ABS'); setNonQualifyingReason('Absent'); }}
                >
                  Absent
                </button>
                <button
                  className={`result-chip ${qualifying === 'EX' ? 'selected excused' : ''}`}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Dog Eliminated in Area'); }}
                >
                  Excused
                </button>
              </div>

              {/* Faults */}
              {qualifying === 'Q' && (
                <div className="faults-section">
                  <label>Faults:</label>
                  <div className="fault-controls">
                    <button onClick={() => setFaultCount(Math.max(0, faultCount - 1))}>-</button>
                    <span className="fault-count">{faultCount}</span>
                    <button onClick={() => setFaultCount(faultCount + 1)}>+</button>
                  </div>
                </div>
              )}

              {/* NQ Reason */}
              {qualifying === 'NQ' && (
                <div className="nq-reason-section">
                  <label>NQ Reason:</label>
                  <select
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                  >
                    <option value="Incorrect Call">Incorrect Call</option>
                    <option value="Max Time">Max Time</option>
                    <option value="Point to Hide">Point to Hide</option>
                    <option value="Harsh Correction">Harsh Correction</option>
                    <option value="Significant Disruption">Significant Disruption</option>
                  </select>
                </div>
              )}
            </div>

            {/* Validation message */}
            {qualifying === 'Q' && !isAllTimesComplete && (
              <div className="validation-warning">
                ⚠️ Time must be entered for a Qualified score
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
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isAllTimesComplete)}
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
              <div className="trial-info-line">
                {entry.element} {entry.level}
              </div>
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
                  <span className={`item-value result-${qualifying.toLowerCase()}`}>
                    {qualifying === 'Q' ? 'Qualified' : qualifying === 'NQ' ? 'NQ' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                  </span>
                </div>
                <div className="score-item time-container">
                  <span className="item-label">Time</span>
                  <span className="item-value time-value">
                    {qualifying !== 'Q' ? '0:00.00' : (areas[0]?.time || '0:00.00')}
                  </span>
                </div>
                {faultCount > 0 && (
                  <div className="score-item">
                    <span className="item-label">Faults</span>
                    <span className="item-value negative">{faultCount}</span>
                  </div>
                )}
                {nonQualifyingReason && (qualifying === 'NQ' || qualifying === 'EX') && (
                  <div className="score-item">
                    <span className="item-label">{qualifying === 'EX' ? 'Excused' : 'NQ'} Reason</span>
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

export default AKCScentWorkScoresheet;
