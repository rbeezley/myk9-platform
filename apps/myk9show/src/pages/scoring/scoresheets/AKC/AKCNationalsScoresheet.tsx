/**
 * AKC Nationals Scent Work Scoresheet
 *
 * Ported from myK9Q with identical CSS styling but adapted for myK9Show's data layer.
 * Nationals scoring uses multiple areas and points-based scoring.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft, Plus, Minus } from 'lucide-react';
import { useStopwatch } from '@myk9/scoring-ui';

// CSS imports (from myK9Q for visual consistency)
import '../BaseScoresheet.css';
import './AKCScentWorkScoresheet-Nationals.css';
import './scoresheet-shared.css';
import './AKCScentWorkScoresheet-JudgeDialog.css';
import '../../styles/containers.css';
import { logger } from '@/services/LoggingService';

// Types
interface AKCNationalsScoresheetProps {
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
  points?: number;
  areas?: AreaScore[];
  notes?: string;
}

interface AreaScore {
  areaNumber: number;
  time: string;
  correct: number;
  incorrect: number;
  alerts: number;
}

type QualifyingResult = 'Q' | 'ABS' | 'EX' | '';

// Nationals has 5 areas
const NATIONALS_AREAS = [1, 2, 3, 4, 5];

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

/**
 * Calculate nationals points based on correct/incorrect alerts
 */
function calculateNationalsPoints(areas: AreaScore[]): number {
  let points = 0;
  for (const area of areas) {
    points += area.correct * 10; // 10 points per correct alert
    points -= area.incorrect * 5; // -5 points per incorrect alert
  }
  return Math.max(0, points);
}

export const AKCNationalsScoresheet: React.FC<AKCNationalsScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev,
}) => {
  // Scoring state - 5 areas for Nationals
  const [areas, setAreas] = useState<AreaScore[]>(
    NATIONALS_AREAS.map((num) => ({
      areaNumber: num,
      time: '',
      correct: 0,
      incorrect: 0,
      alerts: 0,
    }))
  );
  const [currentArea, setCurrentArea] = useState(0);
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Calculate max time per area (total max time / 5)
  const totalMaxTime = classInfo.maxTime || '4:00';
  const areaMaxTimeMs = parseMaxTime(totalMaxTime) / 5;
  const areaMaxTimeStr = formatMs(areaMaxTimeMs);

  // Stopwatch for current area
  const stopwatch = useStopwatch({
    maxTime: areaMaxTimeStr,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      handleAreaUpdate(currentArea, 'time', formattedTime);
    },
  });

  // Handlers
  const handleAreaUpdate = useCallback(
    (index: number, field: keyof AreaScore, value: string | number) => {
      setAreas((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleCorrectChange = (index: number, delta: number) => {
    const newValue = Math.max(0, areas[index].correct + delta);
    handleAreaUpdate(index, 'correct', newValue);
  };

  const handleIncorrectChange = (index: number, delta: number) => {
    const newValue = Math.max(0, areas[index].incorrect + delta);
    handleAreaUpdate(index, 'incorrect', newValue);
  };

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    handleAreaUpdate(currentArea, 'time', stopwatch.formatTime(stopwatch.time));
  }, [stopwatch, currentArea, handleAreaUpdate]);

  const handleNextArea = () => {
    if (currentArea < 4) {
      setCurrentArea(currentArea + 1);
      stopwatch.reset();
    }
  };

  const handlePrevArea = () => {
    if (currentArea > 0) {
      setCurrentArea(currentArea - 1);
      stopwatch.reset();
    }
  };

  const isAllAreasComplete = areas.every((area) => area.time && area.time !== '');
  const totalPoints = calculateNationalsPoints(areas);

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
        faults: 0,
        qualification: qualifying,
        points: totalPoints,
        areas: areas,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas(
          NATIONALS_AREAS.map((num) => ({
            areaNumber: num,
            time: '',
            correct: 0,
            incorrect: 0,
            alerts: 0,
          }))
        );
        setCurrentArea(0);
        setQualifying('');
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
      <div className="scoresheet-container nationals">
        <div className="scoresheet">
          {/* Header */}
          <header className="page-header mobile-header">
            <button className="back-button" onClick={onBack}>
              <ArrowLeft size={20} />
            </button>
            <div className="header-content">
              <h1>
                <ClipboardCheck className="title-icon" />
                AKC Nationals
              </h1>
              <div className="header-trial-info">
                <span>
                  {entry.element} {entry.level}
                </span>
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

            {/* Area Navigation */}
            <div className="area-tabs nationals-area-tabs">
              {NATIONALS_AREAS.map((num, index) => (
                <button
                  key={num}
                  className={`area-tab ${index === currentArea ? 'active' : ''} ${areas[index].time ? 'completed' : ''}`}
                  onClick={() => setCurrentArea(index)}
                >
                  Area {num}
                </button>
              ))}
            </div>

            {/* Timer Section */}
            <div className="scoresheet-timer-card nationals-timer">
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
                title={stopwatch.isRunning ? 'Reset disabled while timer is running' : 'Reset timer'}
              >
                ⟲
              </button>

              {/* Main timer display */}
              <div
                className={`timer-display-large ${stopwatch.shouldShow30SecondWarning() ? 'warning' : ''} ${stopwatch.isTimeExpired() ? 'expired' : ''}`}
              >
                {stopwatch.formatTime(stopwatch.time)}
              </div>

              {/* Countdown display */}
              <div className="timer-countdown-display">
                {stopwatch.time > 0 ? (
                  <>Remaining: {stopwatch.getRemainingTime()}</>
                ) : (
                  <>Area {currentArea + 1} - Max: {areaMaxTimeStr}</>
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

            {/* Points Counter Section */}
            <div className="nationals-counters">
              <div className="counter-section">
                <label>Correct Alerts</label>
                <div className="counter-controls">
                  <button onClick={() => handleCorrectChange(currentArea, -1)}>
                    <Minus size={18} />
                  </button>
                  <span className="counter-value positive">{areas[currentArea].correct}</span>
                  <button onClick={() => handleCorrectChange(currentArea, 1)}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <div className="counter-section">
                <label>Incorrect Alerts</label>
                <div className="counter-controls">
                  <button onClick={() => handleIncorrectChange(currentArea, -1)}>
                    <Minus size={18} />
                  </button>
                  <span className="counter-value negative">{areas[currentArea].incorrect}</span>
                  <button onClick={() => handleIncorrectChange(currentArea, 1)}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Time Input for Current Area */}
            <div className="scoresheet-time-card">
              <div className="time-input-flutter">
                <div className="scoresheet-time-input-wrapper">
                  <input
                    type="text"
                    value={areas[currentArea].time || ''}
                    onChange={(e) => handleAreaUpdate(currentArea, 'time', e.target.value)}
                    onBlur={(e) =>
                      handleAreaUpdate(currentArea, 'time', parseSmartTime(e.target.value))
                    }
                    placeholder="Type: 12345 or 1:23.45"
                    className="scoresheet-time-input"
                  />
                  {areas[currentArea].time && (
                    <button
                      type="button"
                      className="scoresheet-time-clear-button"
                      onClick={() => handleAreaUpdate(currentArea, 'time', '')}
                      title="Clear time"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Area Navigation Buttons */}
            <div className="area-navigation">
              <button
                className="area-nav-btn prev"
                onClick={handlePrevArea}
                disabled={currentArea === 0}
              >
                ← Previous Area
              </button>
              <button
                className="area-nav-btn next"
                onClick={handleNextArea}
                disabled={currentArea === 4}
              >
                Next Area →
              </button>
            </div>

            {/* Points Summary */}
            <div className="nationals-points-summary">
              <div className="points-label">Total Points</div>
              <div className="points-value">{totalPoints}</div>
            </div>

            {/* Results Section */}
            <div className="results-section">
              <div className="result-chips">
                <button
                  className={`result-chip ${qualifying === 'Q' ? 'selected qualified' : ''}`}
                  onClick={() => setQualifying('Q')}
                >
                  Qualified
                </button>
                <button
                  className={`result-chip ${qualifying === 'ABS' ? 'selected absent' : ''}`}
                  onClick={() => setQualifying('ABS')}
                >
                  Absent
                </button>
                <button
                  className={`result-chip ${qualifying === 'EX' ? 'selected excused' : ''}`}
                  onClick={() => setQualifying('EX')}
                >
                  Excused
                </button>
              </div>
            </div>

            {/* Validation message */}
            {qualifying === 'Q' && !isAllAreasComplete && (
              <div className="validation-warning">⚠️ All 5 areas must have times for a Qualified score</div>
            )}

            {/* Action Buttons */}
            <div className="scoresheet-actions">
              <button className="scoresheet-btn-cancel" onClick={onBack}>
                Cancel
              </button>
              <button
                className="scoresheet-btn-save"
                onClick={handleSubmit}
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isAllAreasComplete)}
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
          <div className="judge-confirmation-dialog nationals">
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

            <div className="score-details nationals-details">
              <div className="result-points-grid">
                <div className="score-item">
                  <span className="item-label">Result</span>
                  <span className={`item-value result-${qualifying.toLowerCase()}`}>
                    {qualifying === 'Q' ? 'Qualified' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                  </span>
                </div>
                <div className="score-item">
                  <span className="item-label">Total Points</span>
                  <span className="item-value points-value">{totalPoints}</span>
                </div>
              </div>

              {/* Area breakdown */}
              <div className="areas-summary">
                {areas.map((area) => (
                  <div key={area.areaNumber} className="area-summary-item">
                    <span className="area-label">Area {area.areaNumber}</span>
                    <span className="area-time">{area.time || '--:--'}</span>
                    <span className="area-correct">+{area.correct * 10}</span>
                    {area.incorrect > 0 && (
                      <span className="area-incorrect">-{area.incorrect * 5}</span>
                    )}
                  </div>
                ))}
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
 * Parse max time string to milliseconds
 */
function parseMaxTime(timeStr: string): number {
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return (mins * 60 + secs) * 1000;
}

/**
 * Format milliseconds to M:SS
 */
function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default AKCNationalsScoresheet;
