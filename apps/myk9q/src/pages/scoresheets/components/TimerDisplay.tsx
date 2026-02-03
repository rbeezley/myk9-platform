/**
 * TimerDisplay Component
 *
 * Displays the scoresheet timer with controls, countdown, and warning states.
 * Features Flutter-style modern UI with start/stop/resume/reset functionality.
 *
 * Extracted from AKCScentWorkScoresheet.tsx
 */

import React from 'react';
import { haptic } from '@myk9/scoring-ui';
import { cn } from '@/lib/utils';

/** Tailwind styles for TimerDisplay */
const styles = {
  card: cn(
    "relative p-6 mb-4 rounded-2xl",
    "bg-gradient-to-br from-[#667eea] to-[#764ba2]",
    "shadow-[0_4px_6px_rgba(0,0,0,0.1)]"
  ),
  resetBtn: cn(
    "absolute top-3 right-3",
    "w-10 h-10 rounded-full border-none",
    "bg-white/20 text-white text-xl cursor-pointer",
    "transition-all duration-200",
    "hover:enabled:bg-white/30 hover:enabled:rotate-180",
    "disabled:opacity-30 disabled:cursor-not-allowed"
  ),
  countdownRing: "absolute top-3 left-3 block",
  timerDisplay: cn(
    "text-5xl font-bold text-white text-center mb-2",
    "tabular-nums transition-colors duration-300"
  ),
  timerWarning: "text-amber-400",
  timerExpired: "text-red-500 animate-[pulse_1s_infinite]",
  countdownDisplay: "text-base text-white/90 text-center mb-4",
  controls: "flex justify-center gap-3",
  startBtn: cn(
    "w-[140px] min-w-[140px] max-w-[140px] h-12",
    "px-6 py-3 rounded-xl border-none",
    "text-base font-semibold cursor-pointer",
    "transition-all duration-200",
    "shadow-[0_2px_4px_rgba(0,0,0,0.1)]",
    "flex items-center justify-center flex-shrink-0 flex-grow-0",
    "hover:translate-y-[-2px] hover:shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
  ),
  startBtnStart: "bg-white text-[#667eea]",
  startBtnStop: "bg-red-500 text-white",
  startBtnResume: "bg-teal-500 text-white",
  warningBox: cn(
    "text-center p-3 rounded-lg mb-4",
    "font-semibold text-sm"
  ),
  warningBoxWarning: "bg-amber-400/10 border border-amber-400 text-amber-500",
  warningBoxExpired: "bg-red-500/10 border border-red-500 text-red-600",
};

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
}

/**
 * TimerDisplay Component
 *
 * Displays a large, prominent timer for scoresheets with:
 * - Large elapsed time display
 * - Countdown/remaining time indicator
 * - Start/Stop/Resume/Reset controls
 * - Visual warnings (30 seconds remaining, time expired)
 * - Disabled reset during timing
 *
 * **Features**:
 * - Flutter-style modern card design
 * - Color-coded warning states (yellow warning, red expired)
 * - Smart button states (Start → Stop → Resume)
 * - Always-visible reset button (top-right corner)
 * - Max time display before timing starts
 *
 * **Use Cases**:
 * - AKC Scent Work scoresheets
 * - FastCAT scoresheets
 * - Any timed scoring event
 * - Real-time judging with countdown
 *
 * @example
 * ```tsx
 * <TimerDisplay
 *   time={45000}
 *   isRunning={false}
 *   warningState="normal"
 *   maxTime="3:00"
 *   remainingTime="2:15"
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
  onReset
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

  return (
    <>
      <div className={styles.card}>
        {/* Countdown ring - top left corner */}
        {showProgressRing && maxTimeMs && maxTimeMs > 0 && (
          <svg
            className={styles.countdownRing}
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
          className={cn(styles.resetBtn, "btn-destructive")}
          onClick={() => { haptic.heavy(); onReset(); }}
          disabled={isRunning}
          title={isRunning ? "Reset disabled while timer is running" : "Reset timer"}
        >
          ⟲
        </button>

        {/* Main timer display */}
        <div
          className={cn(
            styles.timerDisplay,
            warningState === 'warning' && styles.timerWarning,
            warningState === 'expired' && styles.timerExpired
          )}
        >
          {formatTime(time)}
        </div>

        {/* Countdown/Max Time display */}
        <div className={styles.countdownDisplay}>
          {time > 0 ? (
            <>Remaining: {remainingTime}</>
          ) : (
            <>Max Time: {maxTime}</>
          )}
        </div>

        {/* Control buttons */}
        <div className={styles.controls}>
          {isRunning ? (
            // Timer is running - show Stop button (centered)
            <button
              className={cn(styles.startBtn, styles.startBtnStop, "btn-destructive")}
              onClick={() => { haptic.heavy(); onStop(); }}
            >
              Stop
            </button>
          ) : time > 0 ? (
            // Timer is stopped with time recorded - show Resume button
            <button
              className={cn(styles.startBtn, styles.startBtnResume, "btn-primary")}
              onClick={() => { haptic.medium(); onStart(); }}
              title="Continue timing"
            >
              Resume
            </button>
          ) : (
            // Timer is at zero - show Start button (centered)
            <button
              className={cn(styles.startBtn, styles.startBtnStart, "btn-primary")}
              onClick={() => { haptic.heavy(); onStart(); }}
            >
              Start
            </button>
          )}
        </div>
      </div>

      {/* Timer Warning Message */}
      {warningMessage && (
        <div className={cn(
          styles.warningBox,
          warningState === 'expired' ? styles.warningBoxExpired : styles.warningBoxWarning
        )}>
          {warningMessage}
        </div>
      )}
    </>
  );
}
