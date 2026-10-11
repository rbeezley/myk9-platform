/**
 * UKC Nosework Live Scoresheet (Judge View)
 *
 * Touch-friendly in-ring scoresheet with dual or single timer mode.
 * - Dual mode (Superior/Master/Elite): Search timer + continuous Element timer
 * - Single mode (Novice/Advanced): Search timer only
 *
 * UKC Nosework is always ONE search area (owner, MYK9-1086): the sheet forces a
 * single area whatever the class record says, shows one editable recorded time,
 * and records no found/correct flags (UKC judges never use them).
 * Fault counter and result chips as usual.
 */

import React, { useState, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { ScoresheetDogCard } from '../../ScoresheetDogCard';
import { TimerResetButton } from '../../TimerResetButton';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useElementTimer } from '../../../hooks/useElementTimer';
import {
  useElementMaxTimeStatus,
  type ElementMaxTimeStatus,
} from '../../../hooks/useElementMaxTimeStatus';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps, ResolvedClassRules, StopwatchReturn } from '../../../types';
import type { ExtendedResult } from '../../../types/scoreData';

const RESULT_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  { value: 'NQ', label: 'NQ', activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500' },
  { value: 'ABS', label: 'Absent', activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500' },
  { value: 'EX', label: 'Excused', activeClass: 'bg-red-600 hover:bg-red-700 border-red-600' },
  { value: 'DQ', label: 'DQ', activeClass: DQ_ACTIVE_CLASS },
];

const NQ_REASONS = ['Fault Limit', 'Max Time', 'False Alert', 'Handler Error'];

/**
 * Which clock carries the max. The rulebook maximum is an ELEMENT time
 * (MYK9-1093): single mode has one clock, so it carries the max; in dual mode
 * the element clock does, and the search clock (which pauses at each alert)
 * has none of its own.
 */
function splitMaxTime(isDual: boolean, rules: ResolvedClassRules, maxTimeStr: string) {
  const maxTimeMs = rules.maxTimeSeconds * 1000;
  return {
    maxTimeMs,
    searchMaxTime: isDual ? undefined : maxTimeStr,
    // Undefined = no element limit: single mode, or a class with none (0).
    elementMaxTimeMs: isDual && maxTimeMs > 0 ? maxTimeMs : undefined,
  };
}

/**
 * A dual-mode search time as recorded: never past the element max, which a late
 * tick (locked phone) or a Finish just past the max would otherwise allow. No
 * element max, no cap -- a class without a limit records the real time.
 */
function capAtElementMax(searchMs: number, elementMaxTimeMs: number | undefined): number {
  return elementMaxTimeMs === undefined ? searchMs : Math.min(searchMs, elementMaxTimeMs);
}

/** Warning / expiry / remaining time from whichever clock carries the max. */
function timerStatus(isDual: boolean, element: ElementMaxTimeStatus, stopwatch: StopwatchReturn) {
  return isDual
    ? {
        warningMessage: element.warningMessage,
        // The search digits stay neutral: the paused search clock is not the one
        // running out -- the ring and banner carry the element warning.
        isWarning: false,
        isExpired: false,
        remainingTimeMs: element.remainingMs,
      }
    : {
        warningMessage: stopwatch.getWarningMessage(),
        isWarning: stopwatch.shouldShow30SecondWarning(),
        isExpired: stopwatch.isTimeExpired(),
        remainingTimeMs: stopwatch.getRemainingTimeMs(),
      };
}

export const UKCNoseworkLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  headerActions,
  onWarningChime,
  onVoiceAnnouncement,
  enableVoiceAnnouncements,
}) => {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const isDual = rules.timerMode === 'dual';

  const maxTimeStr = `${Math.floor(rules.maxTimeSeconds / 60)}:${String(rules.maxTimeSeconds % 60).padStart(2, '0')}`;

  const scoring = useScoresheetScoring({
    rules: { ...rules, areaCount: 1 },
    existingScore: entry.existingScore,
    recordFinds: false,
  });

  const { maxTimeMs, searchMaxTime, elementMaxTimeMs } = splitMaxTime(isDual, rules, maxTimeStr);

  const stopwatch = useStopwatch({
    maxTime: searchMaxTime,
    level: classInfo.level,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      if (scoring.areas.length > 0) {
        scoring.handleAreaUpdate(0, 'time', formattedTime);
      }
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('Max Time');
    },
  });

  const elementTimer = useElementTimer({
    maxTimeMs: elementMaxTimeMs,
    onExpired: () => {
      const elapsedMs = capAtElementMax(stopwatch.pause(), elementMaxTimeMs);
      if (scoring.areas.length > 0) {
        scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
      }
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('Max Time');
    },
  });
  const elementStatus = useElementMaxTimeStatus({
    enabled: isDual,
    maxTimeMs,
    elementTimeMs: elementTimer.time,
    isRunning: elementTimer.isRunning,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
  });

  // Start both timers (dual mode) or just search timer (single mode)
  const handleStart = useCallback(() => {
    stopwatch.start();
    if (isDual) {
      elementTimer.start();
    }
  }, [stopwatch, elementTimer, isDual]);

  // Pause search timer only (element timer keeps running in dual mode)
  const handlePauseSearch = useCallback(() => {
    stopwatch.pause();
  }, [stopwatch]);

  // Resume search timer (element timer was never paused)
  const handleResumeSearch = useCallback(() => {
    stopwatch.start();
  }, [stopwatch]);

  // Finish: stop both timers, capture times into area 0
  const handleFinish = useCallback(() => {
    const elapsedMs = capAtElementMax(stopwatch.pause(), elementMaxTimeMs);
    const reachedMax = isDual && elementTimer.stop();
    if (scoring.areas.length > 0) {
      scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
    }
    // Finish tapped past the element max, before a tick noticed it.
    if (reachedMax) {
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('Max Time');
    }
  }, [stopwatch, elementTimer, isDual, scoring, elementMaxTimeMs]);

  // Stop single-timer mode
  const handleStop = useCallback(() => {
    const elapsedMs = stopwatch.pause();
    if (scoring.areas.length > 0) {
      scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
    }
  }, [stopwatch, scoring]);

  const handleResultSelect = (value: ExtendedResult) => {
    // Re-tapping DQ keeps the reason already typed (MYK9-1011).
    if (value === 'DQ' && scoring.qualifying === 'DQ') return;
    scoring.setQualifying(value);
    if (value === 'NQ') scoring.setNonQualifyingReason('Fault Limit');
    else if (value === 'ABS') scoring.setNonQualifyingReason('Absent');
    else if (value === 'EX') scoring.setNonQualifyingReason('Excused');
    else scoring.setNonQualifyingReason('');
  };

  const handleSubmitClick = () => {
    if (!scoring.qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    // Pass element time as extra data when dual
    const extra = isDual ? { element: elementTimer.formatTime(elementTimer.time) } : undefined;
    await scoring.handleSubmit(onSubmit, extra);
    setShowConfirmation(false);
  };

  // Timer visuals
  const { warningMessage, isWarning, isExpired, remainingTimeMs } = timerStatus(
    isDual,
    elementStatus,
    stopwatch
  );
  const remainingSeconds = remainingTimeMs / 1000;

  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444';
    if (remainingSeconds <= 30) return '#ef4444';
    if (remainingSeconds <= 40) return '#f59e0b';
    return '#22c55e';
  };

  const ringSize = 40;
  const strokeWidth = 4;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = maxTimeMs > 0 ? Math.max(0, remainingTimeMs / maxTimeMs) : 1;
  const dashOffset = circumference * (1 - progress);

  const isStarted = stopwatch.time > 0 || elementTimer.time > 0;
  const isBothStopped = !stopwatch.isRunning && !elementTimer.isRunning;

  // Remaining max time. In dual mode it counts down the ELEMENT time, so it lives in
  // that row; pinned in the card's corner it covered the row's time and Finish button
  // (owner, 2026-10-09).
  const renderRing = (className: string) =>
    maxTimeMs > 0 ? (
      <svg
        className={className}
        aria-hidden="true"
        data-testid="max-time-ring"
        width={ringSize}
        height={ringSize}
        viewBox={`0 0 ${ringSize} ${ringSize}`}
      >
        <circle
          cx={ringSize / 2}
          cy={ringSize / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
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
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`}
        />
      </svg>
    ) : null;

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <Button
              variant="ghost"
              size="icon"
              className="h-11 w-11"
              onClick={onBack}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg max-sm:text-base font-semibold">UKC Nosework</h1>
              <p className="text-sm text-muted-foreground">{formatScoresheetSubtitle(classInfo)}</p>
            </div>
            {headerActions}
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info */}
            <ScoresheetDogCard
              armband={entry.armband}
              dogName={entry.dogName}
              breed={entry.breed}
              handlerName={entry.handlerName}
            />

            {/* Timer Card */}
            <Card className="p-6 relative overflow-hidden">
              {!isDual && renderRing('absolute top-3 right-3')}

              {/* Element timer row — dual mode only */}
              {isDual && (
                <div
                  className="flex items-center justify-between gap-2 mb-4 p-3 bg-violet-500/10 rounded-lg"
                  data-testid="element-timer-row"
                >
                  <span className="text-sm font-medium text-violet-600">Element Time:</span>
                  <span
                    className={cn(
                      'font-mono text-xl font-bold',
                      elementTimer.isRunning ? 'text-violet-600' : 'text-muted-foreground'
                    )}
                  >
                    {elementTimer.formatTime(elementTimer.time)}
                  </span>
                  {(stopwatch.isRunning || elementTimer.isRunning) && (
                    <Button size="sm" variant="secondary" onClick={handleFinish}>
                      Finish
                    </Button>
                  )}
                  {renderRing('shrink-0')}
                </div>
              )}

              {/* Search timer display */}
              <div className="text-center pt-2">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  {isDual ? 'Search Time' : 'Time'}
                </div>
                <div
                  className={cn(
                    'text-5xl font-mono font-bold tracking-tight',
                    isWarning && 'text-amber-500',
                    isExpired && 'text-destructive'
                  )}
                  data-testid="search-timer-display"
                >
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="text-sm text-muted-foreground mt-2 tabular-nums">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.formatTime(remainingTimeMs)}</>
                  ) : (
                    <>Max Time: {maxTimeStr}</>
                  )}
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  {isDual ? (
                    <>
                      {!isStarted ? (
                        <Button
                          size="lg"
                          className="w-32 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                          onClick={handleStart}
                          data-testid="timer-start"
                        >
                          Start
                        </Button>
                      ) : stopwatch.isRunning ? (
                        <Button
                          size="lg"
                          variant="secondary"
                          className="h-12 text-lg font-semibold"
                          onClick={handlePauseSearch}
                          data-testid="timer-pause"
                        >
                          Pause Search
                        </Button>
                      ) : elementTimer.isRunning && !stopwatch.isRunning ? (
                        <Button
                          size="lg"
                          variant="secondary"
                          className="h-12 text-lg font-semibold"
                          onClick={handleResumeSearch}
                          data-testid="timer-resume"
                        >
                          Resume Search
                        </Button>
                      ) : isBothStopped && isStarted ? (
                        <Button
                          size="lg"
                          variant="outline"
                          className="h-12"
                          onClick={() => {
                            stopwatch.reset();
                            elementTimer.reset();
                          }}
                        >
                          Reset
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {stopwatch.isRunning ? (
                        <Button
                          size="lg"
                          variant="destructive"
                          className="w-32 h-12 text-lg font-semibold"
                          onClick={handleStop}
                          data-testid="timer-stop"
                        >
                          Stop
                        </Button>
                      ) : stopwatch.time > 0 && stopwatch.isTimeExpired() ? (
                        <Button
                          size="lg"
                          variant="outline"
                          className="w-32 h-12 text-lg font-semibold"
                          onClick={stopwatch.reset}
                        >
                          Reset
                        </Button>
                      ) : stopwatch.time > 0 ? (
                        <Button
                          size="lg"
                          variant="secondary"
                          className="w-32 h-12 text-lg font-semibold"
                          onClick={stopwatch.start}
                        >
                          Resume
                        </Button>
                      ) : (
                        <Button
                          size="lg"
                          className="w-32 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                          onClick={handleStart}
                          data-testid="timer-start"
                        >
                          Start
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {/* Single timer: once stopped, the main button reads Resume, so
                    reset gets its own labelled control. Expiry already shows Reset
                    as the main button; the dual timer has its own. */}
                <TimerResetButton
                  visible={
                    !isDual &&
                    !stopwatch.isRunning &&
                    stopwatch.time > 0 &&
                    !stopwatch.isTimeExpired()
                  }
                  onReset={stopwatch.reset}
                />
              </div>
            </Card>

            {/* Warning */}
            {warningMessage && (
              <div
                className={cn(
                  'px-4 py-3 rounded-lg text-center font-medium',
                  warningMessage === 'Time Expired'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-amber-500/10 text-amber-600'
                )}
              >
                {warningMessage}
              </div>
            )}

            {/* Recorded time: the one UKC search area. Filled when the timer stops;
                editable for a hand correction. */}
            {scoring.areas[0] && (
              <Card className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="ukc-recorded-time" className="font-medium">
                    Recorded time
                  </label>
                  <Input
                    id="ukc-recorded-time"
                    type="text"
                    inputMode="decimal"
                    value={scoring.areas[0].time}
                    onChange={e => scoring.handleAreaUpdate(0, 'time', e.target.value)}
                    placeholder="0:00.00"
                    className="h-12 w-40 text-center text-xl font-mono"
                    data-testid="ukc-recorded-time"
                  />
                </div>
              </Card>
            )}

            {/* Faults */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Faults:</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => scoring.setFaultCount(Math.max(0, scoring.faultCount - 1))}
                    data-testid="fault-decrease"
                  >
                    -
                  </Button>
                  <span className="text-xl font-bold w-8 text-center" data-testid="fault-count">
                    {scoring.faultCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => scoring.setFaultCount(scoring.faultCount + 1)}
                    data-testid="fault-increase"
                  >
                    +
                  </Button>
                </div>
              </div>
            </Card>

            {/* Result Chips */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {RESULT_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    variant={scoring.qualifying === opt.value ? 'default' : 'outline'}
                    className={cn('h-12', scoring.qualifying === opt.value && opt.activeClass)}
                    onClick={() => handleResultSelect(opt.value)}
                    data-testid={`result-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {scoring.qualifying === 'DQ' && (
                <DisqualifyReason
                  sportType="UKC_NOSEWORK"
                  reason={scoring.nonQualifyingReason}
                  onReasonChange={scoring.setNonQualifyingReason}
                />
              )}

              {/* NQ Reason */}
              {scoring.qualifying === 'NQ' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">NQ Reason:</label>
                  <select
                    value={scoring.nonQualifyingReason}
                    onChange={e => scoring.setNonQualifyingReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    data-testid="nq-reason-select"
                  >
                    {NQ_REASONS.map(reason => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </Card>

            {/* Submit */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmitClick}
                disabled={
                  scoring.isSubmitting || !scoring.qualifying || scoring.disqualifyReasonMissing
                }
                data-testid="submit-btn"
              >
                {scoring.isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          data-testid="confirmation-dialog"
        >
          <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div>
              <h2 className="text-xl font-semibold">Score Confirmation</h2>
              <p className="text-sm text-muted-foreground">{formatScoresheetSubtitle(classInfo)}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary flex items-center justify-center shadow-sm">
                <span className="text-sm font-bold text-primary-foreground">{entry.armband}</span>
              </div>
              <div>
                <div className="font-medium">{entry.dogName}</div>
                <div className="text-xs text-muted-foreground">Handler: {entry.handlerName}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Result</span>
                <span
                  className={cn(
                    'font-semibold',
                    scoring.qualifying === 'Q' && 'text-green-600',
                    scoring.qualifying === 'NQ' && 'text-amber-500',
                    scoring.qualifying === 'ABS' && 'text-gray-500',
                    scoring.qualifying === 'EX' && 'text-red-600',
                    scoring.qualifying === 'DQ' && 'font-bold'
                  )}
                >
                  {scoring.qualifying}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Search Time</span>
                <span className="font-mono font-semibold">{scoring.calculateTotalTime()}</span>
              </div>
              {isDual && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Element Time</span>
                  <span className="font-mono font-semibold">
                    {elementTimer.formatTime(elementTimer.time)}
                  </span>
                </div>
              )}
              {scoring.qualifying === 'DQ' && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">DQ Reason</span>
                  <span className="font-medium">{scoring.nonQualifyingReason}</span>
                </div>
              )}
              {scoring.faultCount > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Faults</span>
                  <span className="font-semibold text-amber-500">{scoring.faultCount}</span>
                </div>
              )}
              {scoring.qualifying === 'NQ' && scoring.nonQualifyingReason && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">NQ Reason</span>
                  <span className="font-medium">{scoring.nonQualifyingReason}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmation(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirmSubmit}
                disabled={scoring.isSubmitting}
                data-testid="confirm-submit-btn"
              >
                {scoring.isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

registerScoresheet('UKC_NOSEWORK', 'live', UKCNoseworkLiveScoresheet);
