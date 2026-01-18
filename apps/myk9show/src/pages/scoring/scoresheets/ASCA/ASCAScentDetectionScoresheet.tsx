/**
 * ASCA Scent Detection Scoresheet - Adapted for myK9Show
 *
 * Australian Shepherd Club of America Scent Detection scoresheet.
 * Similar to AKC Scent Work with timer and area inputs.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';
import { logger } from '@/services/LoggingService';

// CSS imports (shared styling)
import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';

// Types
interface ASCAScentDetectionScoresheetProps {
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

interface AreaTime {
  time: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

/**
 * Determine area count based on level
 */
function getAreaCount(level?: string): number {
  if (!level) return 1;
  const normalizedLevel = level.toLowerCase();
  if (normalizedLevel.includes('excellent') || normalizedLevel.includes('elite')) return 3;
  if (normalizedLevel.includes('advanced') || normalizedLevel.includes('open')) return 2;
  return 1;
}

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

export const ASCAScentDetectionScoresheet: React.FC<ASCAScentDetectionScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Determine number of areas
  const areaCount = useMemo(() => getAreaCount(classInfo.level), [classInfo.level]);

  // Scoring state
  const [areas, setAreas] = useState<AreaTime[]>(
    Array(areaCount).fill(null).map(() => ({ time: '' }))
  );
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Timer
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime || '3:00.00',
    ...(classInfo.level ? { level: classInfo.level } : {}),
    onTimeExpired: (formattedTime) => {
      // Auto-fill first empty area time
      const emptyIndex = areas.findIndex(a => !a.time);
      if (emptyIndex >= 0) {
        handleAreaTimeChange(emptyIndex, formattedTime);
      }
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    },
  });

  const handleAreaTimeChange = useCallback((index: number, time: string) => {
    setAreas(prev => {
      const newAreas = [...prev];
      newAreas[index] = { time };
      return newAreas;
    });
  }, []);

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    // For single-area classes, auto-fill time
    if (areaCount === 1 && !areas[0].time) {
      handleAreaTimeChange(0, stopwatch.formatTime(stopwatch.time));
    }
  }, [stopwatch, areaCount, areas, handleAreaTimeChange]);

  const recordTimeForArea = useCallback((index: number) => {
    handleAreaTimeChange(index, stopwatch.formatTime(stopwatch.time));
    stopwatch.reset();
  }, [stopwatch, handleAreaTimeChange]);

  const getNextEmptyAreaIndex = useCallback((): number => {
    return areas.findIndex(area => !area.time);
  }, [areas]);

  const calculateTotalTime = useCallback(() => {
    return areas.reduce((total, area) => total + parseTimeToMs(area.time), 0);
  }, [areas]);

  const isAllTimesComplete = areas.every(area => area.time && area.time !== '');

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSave({
        time: calculateTotalTime(),
        faults: faultCount,
        qualification: qualifying,
        ...(nonQualifyingReason ? { notes: nonQualifyingReason } : {}),
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas(Array(areaCount).fill(null).map(() => ({ time: '' })));
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

  // Progress ring calculations
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
  const remainingSeconds = remainingTimeMs / 1000;

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
                ASCA Scent Detection
              </h1>
              <div className="header-trial-info">
                <span>{entry.element} {entry.level}</span>
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

              <div className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}>
                {stopwatch.formatTime(stopwatch.time)}
              </div>

              <div className="timer-countdown-display">
                {stopwatch.time > 0 ? (
                  <>Remaining: {stopwatch.getRemainingTime()}</>
                ) : (
                  <>Max Time: {classInfo.maxTime || '3:00.00'}</>
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

              {/* Warning message */}
              {stopwatch.getWarningMessage() && (
                <div className={`timer-warning ${stopwatch.getWarningMessage() === 'Time Expired' ? 'expired' : 'warning'}`}>
                  {stopwatch.getWarningMessage()}
                </div>
              )}
            </div>

            {/* Time Inputs */}
            {areas.map((area, index) => (
              <div key={index} className="scoresheet-time-card">
                <div className="time-input-flutter">
                  {areaCount > 1 && (
                    <>
                      {!area.time ? (
                        <button
                          className={`area-record-btn ${getNextEmptyAreaIndex() === index && stopwatch.time > 0 && !stopwatch.isRunning ? 'next-in-sequence' : ''}`}
                          onClick={() => recordTimeForArea(index)}
                        >
                          Record Area {index + 1}
                        </button>
                      ) : (
                        <div className="area-badge recorded">Area {index + 1}</div>
                      )}
                    </>
                  )}
                  {areaCount === 1 && <label>Search Time</label>}
                  <div className="scoresheet-time-input-wrapper">
                    <input
                      type="text"
                      value={area.time || ''}
                      onChange={(e) => handleAreaTimeChange(index, e.target.value)}
                      onBlur={(e) => handleAreaTimeChange(index, parseSmartTime(e.target.value))}
                      placeholder="Type: 12345 or 1:23.45"
                      className={`scoresheet-time-input ${areaCount === 1 ? 'single-area' : ''}`}
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="scoresheet-time-clear-button"
                        onClick={() => handleAreaTimeChange(index, '')}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Faults */}
            <div className="faults-section">
              <label>Faults:</label>
              <div className="fault-controls">
                <button onClick={() => setFaultCount(Math.max(0, faultCount - 1))}>-</button>
                <span className="fault-count">{faultCount}</span>
                <button onClick={() => setFaultCount(faultCount + 1)}>+</button>
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
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Excused'); }}
                >
                  Excused
                </button>
              </div>

              {qualifying === 'NQ' && (
                <div className="nq-reason-section">
                  <label>NQ Reason:</label>
                  <select
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                  >
                    <option value="Incorrect Call">Incorrect Call</option>
                    <option value="Max Time">Max Time</option>
                    <option value="False Alert">False Alert</option>
                    <option value="Handler Error">Handler Error</option>
                  </select>
                </div>
              )}
            </div>

            {/* Validation */}
            {qualifying === 'Q' && !isAllTimesComplete && (
              <div className="validation-warning">
                ⚠️ {areaCount > 1 ? 'All area times' : 'Time'} must be entered for a Qualified score
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
              <div className="trial-info-line">{entry.element} {entry.level}</div>
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
                {areas.map((area, index) => (
                  <div key={index} className="score-item">
                    <span className="item-label">{areaCount > 1 ? `Area ${index + 1}` : 'Search Time'}</span>
                    <span className="item-value time-value">{area.time || '0:00.00'}</span>
                  </div>
                ))}
                {faultCount > 0 && (
                  <div className="score-item">
                    <span className="item-label">Faults</span>
                    <span className="item-value negative">{faultCount}</span>
                  </div>
                )}
                {nonQualifyingReason && qualifying === 'NQ' && (
                  <div className="score-item">
                    <span className="item-label">NQ Reason</span>
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

export default ASCAScentDetectionScoresheet;
