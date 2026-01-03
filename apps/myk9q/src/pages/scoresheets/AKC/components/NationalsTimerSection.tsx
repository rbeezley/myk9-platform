/**
 * Nationals Timer Section Component
 *
 * Extracted from AKCNationalsScoresheet.tsx to reduce complexity.
 * Contains timer display, controls, and warning logic.
 */

import React from 'react';
import { formatStopwatchTime } from '../AKCNationalsScoresheetHelpers';
import { haptic } from '@/hooks/useHapticFeedback';

interface NationalsTimerSectionProps {
  stopwatchTime: number;
  isStopwatchRunning: boolean;
  showWarning: boolean;
  isExpired: boolean;
  remainingTime: string;
  remainingTimeMs: number;
  maxTimeDisplay: string;
  maxTimeMs: number;
  warningMessage: string | null;
  onReset: () => void;
  onStart: () => void;
  onStop: () => void;
}

export const NationalsTimerSection: React.FC<NationalsTimerSectionProps> = ({
  stopwatchTime,
  isStopwatchRunning,
  showWarning,
  isExpired,
  remainingTime,
  remainingTimeMs,
  maxTimeDisplay,
  maxTimeMs,
  warningMessage,
  onReset,
  onStart,
  onStop
}) => {
  // Progress ring calculations
  const progress = maxTimeMs > 0 ? Math.max(0, remainingTimeMs / maxTimeMs) : 1;
  const remainingSeconds = remainingTimeMs / 1000;
  const ringSize = 40;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444'; // Red - expired
    if (remainingSeconds <= 30) return '#ef4444'; // Red - 30s warning
    if (remainingSeconds <= 40) return '#f59e0b'; // Orange - 40s warning
    return '#22c55e'; // Green
  };

  return (
    <>
      <div className="scoresheet-timer-card">
        {/* Countdown ring - top left corner */}
        {maxTimeMs > 0 && (
          <svg
            className="timer-countdown-ring-corner"
            width={ringSize}
            height={ringSize}
            viewBox={`0 0 ${ringSize} ${ringSize}`}
          >
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={radius}
              fill="none"
              stroke={getRingColor()}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
            />
          </svg>
        )}

        <button
          className="timer-btn-reset btn-destructive"
          onClick={() => { haptic.heavy(); onReset(); }}
          disabled={isStopwatchRunning}
          title={isStopwatchRunning ? "Reset disabled while timer is running" : "Reset timer"}
        >
          ⟲
        </button>

        <div className={`timer-display-large ${showWarning ? 'warning' : ''} ${isExpired ? 'expired' : ''}`}>
          {formatStopwatchTime(stopwatchTime)}
        </div>
        <div className="timer-countdown-display">
          {stopwatchTime > 0 ? (
            <>Remaining: {remainingTime}</>
          ) : (
            <>Max Time: {maxTimeDisplay}</>
          )}
        </div>
        <div className="timer-controls-flutter">
          {isStopwatchRunning ? (
            <button
              className="timer-btn-start stop btn-destructive"
              onClick={() => { haptic.heavy(); onStop(); }}
            >
              Stop
            </button>
          ) : stopwatchTime > 0 ? (
            <button
              className="timer-btn-start resume btn-primary"
              onClick={() => { haptic.medium(); onStart(); }}
              title="Continue timing"
            >
              Resume
            </button>
          ) : (
            <button
              className="timer-btn-start start btn-primary"
              onClick={() => { haptic.heavy(); onStart(); }}
            >
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
    </>
  );
};

export default NationalsTimerSection;
