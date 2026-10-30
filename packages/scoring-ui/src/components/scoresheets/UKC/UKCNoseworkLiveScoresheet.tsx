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
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { FaultStepper } from '../../FaultStepper';
import { ScoreConfirmationDialog, timeRows } from '../../ScoreConfirmationDialog';
import { resultLabel } from '../../../utils/resultLabel';
import { UKCTimerControls } from './UKCTimerControls';
import { StopwatchTime } from '../../StopwatchTime';
import { MaxTimeRing } from '../../MaxTimeRing';
import { TimerResetButton } from '../../TimerResetButton';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useElementTimer } from '../../../hooks/useElementTimer';
import {
  useElementMaxTimeStatus,
  type ElementMaxTimeStatus,
} from '../../../hooks/useElementMaxTimeStatus';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { timerLimitLine } from '../../../utils/maxTimeLabel';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps, ResolvedClassRules, StopwatchReturn } from '../../../types';
import type { ExtendedResult } from '../../../types/scoreData';

const RESULT_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: resultLabel('Q'),
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  {
    value: 'NQ',
    label: resultLabel('NQ'),
    activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500',
  },
  {
    value: 'ABS',
    label: resultLabel('ABS'),
    activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500',
  },
  {
    value: 'EX',
    label: resultLabel('EX'),
    activeClass: 'bg-red-600 hover:bg-red-700 border-red-600',
  },
  { value: 'DQ', label: resultLabel('DQ'), activeClass: DQ_ACTIVE_CLASS },
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
      }
    : {
        warningMessage: stopwatch.getWarningMessage(),
        isWarning: stopwatch.shouldShow30SecondWarning(),
        isExpired: stopwatch.isTimeExpired(),
      };
}

export const UKCNoseworkLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  backLabel,
  onDirtyChange,
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
    thirtySecondWarning: rules.thirtySecondWarning,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      if (scoring.areas.length > 0) {
        scoring.handleAreaUpdate(0, 'time', formattedTime);
      }
      scoring.applyMaxTimeNQ();
    },
  });

  const elementTimer = useElementTimer({
    maxTimeMs: elementMaxTimeMs,
    onExpired: () => {
      const elapsedMs = capAtElementMax(stopwatch.pause(), elementMaxTimeMs);
      if (scoring.areas.length > 0) {
        scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
      }
      scoring.applyMaxTimeNQ();
    },
  });
  const elementStatus = useElementMaxTimeStatus({
    enabled: isDual,
    maxTimeMs,
    elementTimeMs: elementTimer.time,
    isRunning: elementTimer.isRunning,
    thirtySecondWarning: rules.thirtySecondWarning,
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
      scoring.applyMaxTimeNQ();
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
    // Pass element time as extra data when dual. The live clock, not `time`: Save
    // does not wait for Finish, so the element clock may still be running.
    const extra = isDual
      ? { element: elementTimer.formatTime(elementTimer.getTimeMs()) }
      : undefined;
    await scoring.handleSubmit(onSubmit, extra);
    setShowConfirmation(false);
  };

  // Timer visuals
  const { warningMessage, isWarning, isExpired } = timerStatus(isDual, elementStatus, stopwatch);

  // Running counts as started: neither `time` is live in the host's render, so
  // right after Start both still read 0 (MYK9-1364, MYK9-1375).
  const isStarted =
    stopwatch.isRunning || elementTimer.isRunning || stopwatch.time > 0 || elementTimer.time > 0;
  const isBothStopped = !stopwatch.isRunning && !elementTimer.isRunning;

  // The clock that carries the max (see splitMaxTime).
  const maxTimeClock = isDual ? elementTimer : stopwatch;

  // Remaining max time. In dual mode it counts down the ELEMENT time, so it lives in
  // that row; pinned in the card's corner it covered the row's time and Finish button
  // (owner, 2026-10-09).
  const renderRing = (className: string) => {
    if (maxTimeMs <= 0) return null;
    // Dual counts the element clock down, single the search clock; either way
    // only the ring follows the live paint, not this sheet.
    return (
      <StopwatchTime stopwatch={maxTimeClock}>
        {elapsedMs => (
          <MaxTimeRing
            className={className}
            remainingMs={Math.max(0, maxTimeClock.getMaxTimeMs() - elapsedMs)}
            maxTimeMs={maxTimeMs}
            testId="max-time-ring"
            decorative
          />
        )}
      </StopwatchTime>
    );
  };

  const { upButton } = useScoresheetLeave({
    scoring,
    stopwatch,
    onBack,
    backLabel,
    onDirtyChange,
  });

  return (
    <>
      <ScoresheetShell
        header={{
          upButton,
          armband: entry.armband,
          dogName: entry.dogName,
          breed: entry.breed,
          handlerName: entry.handlerName,
          titleLines: ['UKC Nosework'],
          subtitle: formatScoresheetSubtitle(classInfo),
          headerActions,
        }}
        actions={{
          onCancel: onBack,
          onSave: handleSubmitClick,
          saveDisabled:
            scoring.isSubmitting || !scoring.qualifying || scoring.disqualifyReasonMissing,
          isSubmitting: scoring.isSubmitting,
        }}
      >
        <ScoresheetTimerCard
          label={isDual ? 'Search Time' : 'Time'}
          clock={
            <span
              className={cn(
                'font-mono',
                isWarning && 'text-amber-500',
                isExpired && 'text-destructive'
              )}
              data-testid="search-timer-display"
            >
              <StopwatchTime stopwatch={stopwatch} />
            </span>
          }
          limit={
            <StopwatchTime stopwatch={maxTimeClock}>
              {elapsedMs =>
                timerLimitLine(
                  elapsedMs,
                  rules.maxTimeSeconds,
                  maxTimeClock.formatTime(Math.max(0, maxTimeClock.getMaxTimeMs() - elapsedMs))
                )
              }
            </StopwatchTime>
          }
          aside={!isDual && renderRing('flex-shrink-0')}
          above={
            isDual && (
              <div
                className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-violet-500/10 p-2"
                data-testid="element-timer-row"
              >
                <span className="text-sm font-medium text-violet-600">Element Time:</span>
                <span
                  className={cn(
                    'font-mono text-xl font-bold',
                    elementTimer.isRunning ? 'text-violet-600' : 'text-muted-foreground'
                  )}
                >
                  <StopwatchTime stopwatch={elementTimer} />
                </span>
                {(stopwatch.isRunning || elementTimer.isRunning) && (
                  <Button size="sm" variant="secondary" className="h-11" onClick={handleFinish}>
                    Finish
                  </Button>
                )}
                {renderRing('shrink-0')}
              </div>
            )
          }
        >
          <UKCTimerControls
            isDual={isDual}
            isStarted={isStarted}
            isBothStopped={isBothStopped}
            stopwatch={stopwatch}
            elementTimer={elementTimer}
            onStart={handleStart}
            onStop={handleStop}
            onPauseSearch={handlePauseSearch}
            onResumeSearch={handleResumeSearch}
          />
          {/* Single timer: once stopped, the main button reads Resume, so reset gets
              its own labelled control beside it. Expiry already shows Reset as the
              main button; the dual timer has its own. */}
          <TimerResetButton
            visible={
              !isDual && !stopwatch.isRunning && stopwatch.time > 0 && !stopwatch.isTimeExpired()
            }
            onReset={stopwatch.reset}
          />
        </ScoresheetTimerCard>

        {warningMessage && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-center text-sm font-medium',
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
          <ManualTimeField
            label="Recorded time"
            inputId="ukc-recorded-time"
            testId="ukc-recorded-time"
            ariaLabel="Recorded time"
            value={scoring.areas[0].time}
            onChange={value => scoring.handleAreaUpdate(0, 'time', value)}
          />
        )}

        <Card className="space-y-2 p-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
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

          <FaultStepper
            value={scoring.faultCount}
            onChange={scoring.setFaultCount}
            testIds={{
              decrement: 'fault-decrease',
              increment: 'fault-increase',
              count: 'fault-count',
            }}
          />

          {scoring.qualifying === 'DQ' && (
            <DisqualifyReason
              sportType="UKC_NOSEWORK"
              reason={scoring.nonQualifyingReason}
              onReasonChange={scoring.setNonQualifyingReason}
            />
          )}

          {scoring.qualifying === 'NQ' && (
            <div className="flex items-center gap-2">
              <label className="flex-shrink-0 text-sm font-medium">NQ Reason:</label>
              <select
                value={scoring.nonQualifyingReason}
                onChange={e => scoring.setNonQualifyingReason(e.target.value)}
                className="h-11 w-full rounded-md border border-input bg-background px-3"
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
      </ScoresheetShell>

      {showConfirmation && (
        // INTENT: the Score Confirmation is the read-back the judge copies onto the
        // paper scoresheet. Do not remove it, skip it or auto-dismiss it (MYK9-1501).
        <ScoreConfirmationDialog
          subtitle={formatScoresheetSubtitle(classInfo)}
          armband={entry.armband}
          dogName={entry.dogName}
          handlerName={entry.handlerName}
          result={scoring.qualifying}
          rows={[
            ...timeRows(scoring.areas, scoring.calculateTotalTime(), 'Search Time'),
            ...(isDual
              ? [
                  {
                    label: 'Element Time',
                    value: <StopwatchTime stopwatch={elementTimer} />,
                    mono: true,
                  },
                ]
              : []),
            ...(scoring.faultCount > 0
              ? [{ label: 'Faults', value: scoring.faultCount, className: 'text-amber-500' }]
              : []),
          ]}
          reason={scoring.nonQualifyingReason}
          isSubmitting={scoring.isSubmitting}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </>
  );
};

registerScoresheet('UKC_NOSEWORK', 'live', UKCNoseworkLiveScoresheet);
