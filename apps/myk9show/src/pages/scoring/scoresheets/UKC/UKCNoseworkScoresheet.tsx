/**
 * UKC Nosework Scoresheet
 *
 * Ported from myK9Q with identical CSS styling but adapted for myK9Show's data layer.
 *
 * Scoring system: Time + Faults
 * - Single timer for Novice/Advanced (single hide)
 * - Dual timer for Superior/Master/Elite (search time + element time)
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';
import { logger } from '@/services/LoggingService';

// CSS imports (from myK9Q for visual consistency)
import '../BaseScoresheet.css';
import '../AKC/scoresheet-shared.css';
import '../AKC/AKCScentWorkScoresheet-JudgeDialog.css';
import './UKCNoseworkScoresheet.css';

// Types
interface UKCNoseworkScoresheetProps {
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

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

/**
 * Check if level requires dual timer mode (Superior/Master/Elite have multiple hides)
 */
function isDualTimerLevel(level?: string): boolean {
  if (!level) return false;
  const normalizedLevel = level.toLowerCase();
  return ['superior', 'master', 'elite'].includes(normalizedLevel);
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

export const UKCNoseworkScoresheet: React.FC<UKCNoseworkScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Determine if dual timer mode is needed
  const dualTimerMode = isDualTimerLevel(classInfo.level);

  // Scoring state
  const [searchTime, setSearchTime] = useState('');
  const [elementTime, setElementTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Search time stopwatch
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      setSearchTime(formattedTime);
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    },
  });

  // Element timer (continuous, for dual timer mode)
  const [elementTimerRunning, setElementTimerRunning] = useState(false);
  const [elementTimerMs, setElementTimerMs] = useState(0);

  // Handlers
  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    setSearchTime(stopwatch.formatTime(stopwatch.time));
    if (dualTimerMode) {
      setElementTimerRunning(false);
      setElementTime(formatMs(elementTimerMs));
    }
  }, [stopwatch, dualTimerMode, elementTimerMs]);

  const handleDualStart = useCallback(() => {
    stopwatch.start();
    setElementTimerRunning(true);
  }, [stopwatch]);

  const handleDualPause = useCallback(() => {
    // Pause search, element continues
    stopwatch.pause();
  }, [stopwatch]);

  const handleDualResume = useCallback(() => {
    stopwatch.start();
  }, [stopwatch]);

  const handleDualFinish = useCallback(() => {
    stopwatch.pause();
    setElementTimerRunning(false);
    setSearchTime(stopwatch.formatTime(stopwatch.time));
    setElementTime(formatMs(elementTimerMs));
  }, [stopwatch, elementTimerMs]);

  // Element timer tick
  React.useEffect(() => {
    if (!elementTimerRunning) return;
    const interval = setInterval(() => {
      setElementTimerMs((prev) => prev + 10);
    }, 10);
    return () => clearInterval(interval);
  }, [elementTimerRunning]);

  const isTimeComplete = dualTimerMode
    ? searchTime !== '' && elementTime !== ''
    : searchTime !== '';

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeMs = parseTimeToMs(searchTime);

      await onSave({
        time: timeMs,
        faults: faultCount,
        qualification: qualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setSearchTime('');
        setElementTime('');
        setQualifying('');
        setNonQualifyingReason('');
        setFaultCount(0);
        setElementTimerMs(0);
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

  // Progress ring
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = dualTimerMode
    ? Math.max(0, maxTimeMs - elementTimerMs)
    : stopwatch.getRemainingTimeMs();
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
                UKC Nosework
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

              {/* Dual timer: Element time row */}
              {dualTimerMode && (
                <div className="element-time-row">
                  <span className="element-time-label">Element:</span>
                  <span className={`element-time-value ${elementTimerRunning ? 'running' : ''}`}>
                    {formatMs(elementTimerMs)}
                  </span>
                  {(stopwatch.isRunning || elementTimerRunning) && (
                    <button className="timer-btn-finish" onClick={handleDualFinish}>
                      Finish
                    </button>
                  )}
                </div>
              )}

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

              {/* Timer controls */}
              <div className="timer-controls-flutter">
                {dualTimerMode ? (
                  // Dual timer controls
                  <>
                    {!stopwatch.isRunning && !elementTimerRunning && stopwatch.time === 0 ? (
                      <button className="timer-btn-start start" onClick={handleDualStart}>
                        Start
                      </button>
                    ) : stopwatch.isRunning ? (
                      <button className="timer-btn-start stop" onClick={handleDualPause}>
                        Pause Search
                      </button>
                    ) : elementTimerRunning ? (
                      <button className="timer-btn-start resume" onClick={handleDualResume}>
                        Resume Search
                      </button>
                    ) : (
                      <button className="timer-btn-start reset" onClick={() => {
                        stopwatch.reset();
                        setElementTimerMs(0);
                      }}>
                        Reset
                      </button>
                    )}
                  </>
                ) : (
                  // Single timer controls
                  <>
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
                  </>
                )}
              </div>
            </div>

            {/* Time Input */}
            <div className="scoresheet-time-card">
              <div className="time-input-flutter">
                <label>Search Time</label>
                <div className="scoresheet-time-input-wrapper">
                  <input
                    type="text"
                    value={searchTime}
                    onChange={(e) => setSearchTime(e.target.value)}
                    onBlur={(e) => setSearchTime(parseSmartTime(e.target.value))}
                    placeholder="Type: 12345 or 1:23.45"
                    className="scoresheet-time-input"
                  />
                  {searchTime && (
                    <button
                      type="button"
                      className="scoresheet-time-clear-button"
                      onClick={() => setSearchTime('')}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {dualTimerMode && (
                <div className="time-input-flutter">
                  <label>Element Time</label>
                  <div className="scoresheet-time-input-wrapper">
                    <input
                      type="text"
                      value={elementTime}
                      onChange={(e) => setElementTime(e.target.value)}
                      onBlur={(e) => setElementTime(parseSmartTime(e.target.value))}
                      placeholder="Type: 12345 or 1:23.45"
                      className="scoresheet-time-input"
                    />
                    {elementTime && (
                      <button
                        type="button"
                        className="scoresheet-time-clear-button"
                        onClick={() => setElementTime('')}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

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
                  onClick={() => { setQualifying('NQ'); setNonQualifyingReason('Fault Limit'); }}
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
                    <option value="Fault Limit">Fault Limit</option>
                    <option value="Max Time">Max Time</option>
                    <option value="False Alert">False Alert</option>
                    <option value="Handler Error">Handler Error</option>
                  </select>
                </div>
              )}
            </div>

            {/* Validation */}
            {qualifying === 'Q' && !isTimeComplete && (
              <div className="validation-warning">
                ⚠️ {dualTimerMode ? 'Both times' : 'Time'} must be entered for a Qualified score
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
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isTimeComplete)}
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
                <div className="score-item">
                  <span className="item-label">Search Time</span>
                  <span className="item-value time-value">{searchTime || '0:00.00'}</span>
                </div>
                {dualTimerMode && (
                  <div className="score-item">
                    <span className="item-label">Element Time</span>
                    <span className="item-value time-value">{elementTime || '0:00.00'}</span>
                  </div>
                )}
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

/**
 * Format milliseconds to M:SS.ss
 */
function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, '0')}`;
}

export default UKCNoseworkScoresheet;
