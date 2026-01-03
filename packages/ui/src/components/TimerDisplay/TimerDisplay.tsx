import * as React from 'react';
import { cn } from '../../utils/cn';

/**
 * Timer warning state
 */
export type TimerWarningState = 'normal' | 'warning' | 'expired' | null;

/**
 * Props for TimerDisplay component
 */
export interface TimerDisplayProps {
  /** Current timer value in milliseconds */
  time: number;
  /** Whether the timer is currently running */
  isRunning: boolean;
  /** Warning state based on remaining time */
  warningState: TimerWarningState;
  /** Maximum time allowed (formatted as "M:SS") */
  maxTime: string;
  /** Maximum time in milliseconds (for progress ring calculation) */
  maxTimeMs?: number;
  /** Remaining time display (formatted as "M:SS") */
  remainingTime: string;
  /** Remaining time in milliseconds (for progress ring calculation) */
  remainingTimeMs?: number;
  /** Warning message to display (if any) */
  warningMessage?: string;
  /** Show circular progress ring around timer (default: true) */
  showProgressRing?: boolean;
  /** Handler for start/resume button */
  onStart: () => void;
  /** Handler for stop button */
  onStop: () => void;
  /** Handler for reset button */
  onReset: () => void;
  /** Optional haptic feedback callback for interactions */
  onHaptic?: (type: 'light' | 'medium' | 'heavy') => void;
  /** Additional className for the container */
  className?: string;
}

/**
 * TimerDisplay Component
 *
 * Displays a large, prominent timer for scoresheets with:
 * - Large elapsed time display
 * - Countdown/remaining time indicator
 * - Start/Stop/Resume/Reset controls
 * - Visual warnings (30 seconds remaining, time expired)
 * - Optional circular progress ring
 *
 * @example
 * ```tsx
 * <TimerDisplay
 *   time={45000}
 *   isRunning={false}
 *   warningState="normal"
 *   maxTime="3:00"
 *   maxTimeMs={180000}
 *   remainingTime="2:15"
 *   remainingTimeMs={135000}
 *   onStart={handleStart}
 *   onStop={handleStop}
 *   onReset={handleReset}
 * />
 * ```
 */
export function TimerDisplay({
  time,
  isRunning,
  warningState,
  maxTime,
  maxTimeMs,
  remainingTime,
  remainingTimeMs,
  warningMessage,
  showProgressRing = true,
  onStart,
  onStop,
  onReset,
  onHaptic,
  className,
}: TimerDisplayProps): React.ReactElement {
  // Format milliseconds to M:SS.ss
  const formatTime = (ms: number): string => {
    const totalSeconds = ms / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(2);
    return `${minutes}:${seconds.padStart(5, '0')}`;
  };

  // Countdown ring values for corner position
  const cornerRingSize = 40;
  const strokeWidth = 4;
  const cornerRadius = (cornerRingSize - strokeWidth) / 2;
  const cornerCircumference = 2 * Math.PI * cornerRadius;

  // Progress: 1 at start (full), 0 when time expired (empty) - COUNTDOWN style
  const remainingMsValue = remainingTimeMs ?? 0;
  const progress = maxTimeMs && maxTimeMs > 0 ? Math.max(0, remainingMsValue / maxTimeMs) : 1;
  const cornerStrokeDashoffset = cornerCircumference * (1 - progress);
  const remainingSeconds = remainingMsValue / 1000;

  // Ring color based on remaining seconds
  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444'; // Red - expired
    if (remainingSeconds <= 30) return '#ef4444'; // Red - 30s warning
    if (remainingSeconds <= 40) return '#f59e0b'; // Orange - 40s warning
    return '#22c55e'; // Green
  };

  const handleStart = () => {
    onHaptic?.(time > 0 ? 'medium' : 'heavy');
    onStart();
  };

  const handleStop = () => {
    onHaptic?.('heavy');
    onStop();
  };

  const handleReset = () => {
    onHaptic?.('heavy');
    onReset();
  };

  return (
    <>
      <div
        className={cn(
          'relative rounded-2xl p-6 mb-4 shadow-md',
          'bg-gradient-to-br from-indigo-500 to-purple-600',
          className
        )}
      >
        {/* Countdown ring - top left corner */}
        {showProgressRing && maxTimeMs && maxTimeMs > 0 && (
          <svg
            className="absolute top-3 left-3"
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

        {/* Reset button - top right corner */}
        <button
          type="button"
          className={cn(
            'absolute top-3 right-3',
            'w-10 h-10 rounded-full text-xl text-white',
            'bg-white/20 border-none cursor-pointer',
            'transition-all duration-200',
            'hover:bg-white/30 hover:rotate-180',
            'disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:rotate-0'
          )}
          onClick={handleReset}
          disabled={isRunning}
          title={isRunning ? 'Reset disabled while timer is running' : 'Reset timer'}
        >
          &#x27F2;
        </button>

        {/* Main timer display */}
        <div
          className={cn(
            'text-5xl font-bold text-white text-center mb-2',
            'tabular-nums transition-colors duration-300',
            warningState === 'warning' && 'text-amber-300',
            warningState === 'expired' && 'text-red-400 animate-pulse'
          )}
        >
          {formatTime(time)}
        </div>

        {/* Countdown/Max Time display */}
        <div className="text-base text-white/90 text-center mb-4">
          {time > 0 ? (
            <>Remaining: {remainingTime}</>
          ) : (
            <>Max Time: {maxTime}</>
          )}
        </div>

        {/* Control buttons */}
        <div className="flex justify-center gap-3">
          {isRunning ? (
            // Timer is running - show Stop button
            <button
              type="button"
              className={cn(
                'w-36 h-12 rounded-xl text-base font-semibold',
                'bg-red-500 text-white border-none cursor-pointer',
                'shadow-md transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg',
                'flex items-center justify-center'
              )}
              onClick={handleStop}
            >
              Stop
            </button>
          ) : time > 0 ? (
            // Timer is stopped with time recorded - show Resume button
            <button
              type="button"
              className={cn(
                'w-36 h-12 rounded-xl text-base font-semibold',
                'bg-teal-500 text-white border-none cursor-pointer',
                'shadow-md transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg',
                'flex items-center justify-center'
              )}
              onClick={handleStart}
              title="Continue timing"
            >
              Resume
            </button>
          ) : (
            // Timer is at zero - show Start button
            <button
              type="button"
              className={cn(
                'w-36 h-12 rounded-xl text-base font-semibold',
                'bg-white text-indigo-500 border-none cursor-pointer',
                'shadow-md transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg',
                'flex items-center justify-center'
              )}
              onClick={handleStart}
            >
              Start
            </button>
          )}
        </div>
      </div>

      {/* Timer Warning Message */}
      {warningMessage && (
        <div
          className={cn(
            'text-center p-3 rounded-lg mb-4 font-semibold text-sm',
            warningState === 'expired'
              ? 'bg-red-500/10 border border-red-500 text-red-600'
              : 'bg-amber-400/10 border border-amber-400 text-amber-500'
          )}
        >
          {warningMessage}
        </div>
      )}
    </>
  );
}
