/**
 * ASCA Scent Detection Live Scoresheet (Judge View)
 *
 * Touch-friendly in-ring scoresheet with stopwatch timer,
 * countdown ring, and large result chips.
 *
 * Uses useScoresheetScoring for state and useStopwatch for timer.
 * Pattern mirrors AKCScentWorkLiveScoresheet for the ASCA sport type.
 */

import React, { useState, useCallback } from 'react';
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { FaultStepper } from '../../FaultStepper';
import { ScoreConfirmationDialog, timeRows } from '../../ScoreConfirmationDialog';
import { TimerResetButton } from '../../TimerResetButton';
import { resultLabel } from '../../../utils/resultLabel';
import { StopwatchTime } from '../../StopwatchTime';
import { MaxTimeRing } from '../../MaxTimeRing';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { useTimedArea } from '../../../hooks/useTimedArea';
import { maxTimeForArea } from '../../../utils/buildResolvedClassRules';
import { RecordAreaTimeButton } from '../../RecordAreaTimeButton';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { maxTimeLabel, timerLimitLine } from '../../../utils/maxTimeLabel';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps } from '../../../types/scoreData';
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

const NQ_REASONS = ['Incorrect Call', 'Max Time', 'False Alert', 'Handler Error'];

export const ASCAScentDetectionLiveScoresheet: React.FC<LiveScoresheetProps> = ({
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

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  // Each area runs against its own max time, as on the AKC sheet (MYK9-1103).
  const area = useTimedArea(scoring.areas.map(a => a.time));
  const areaMaxSeconds = maxTimeForArea(rules, area.timedArea);
  const maxTimeStr = `${Math.floor(areaMaxSeconds / 60)}:${String(areaMaxSeconds % 60).padStart(2, '0')}`;

  const stopwatch = useStopwatch({
    maxTime: maxTimeStr,
    level: classInfo.level,
    thirtySecondWarning: rules.thirtySecondWarning,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      scoring.handleAreaUpdate(area.timedAreaRef.current, 'time', formattedTime);
      scoring.applyMaxTimeNQ();
    },
  });

  const handleStartTimer = () => {
    area.pinOnStart(stopwatch.time);
    stopwatch.start();
  };

  const handleResetTimer = () => {
    area.release();
    stopwatch.reset();
  };

  // Multi-area: record the clock into the area it timed; reset for the next.
  const handleRecordArea = () => {
    scoring.handleAreaUpdate(area.timedArea, 'time', stopwatch.formatTime(stopwatch.time));
    handleResetTimer();
  };

  const handleStopTimer = useCallback(() => {
    const elapsedMs = stopwatch.pause();
    if (scoring.areas.length === 1) {
      scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
    }
  }, [stopwatch, scoring]);

  const handleResultSelect = (value: ExtendedResult) => {
    // Re-tapping DQ keeps the reason already typed (MYK9-1011).
    if (value === 'DQ' && scoring.qualifying === 'DQ') return;
    scoring.setQualifying(value);
    if (value === 'NQ') scoring.setNonQualifyingReason('Incorrect Call');
    else if (value === 'ABS') scoring.setNonQualifyingReason('Absent');
    else if (value === 'EX') scoring.setNonQualifyingReason('Dog Eliminated in Area');
    else scoring.setNonQualifyingReason('');
  };

  const handleSubmitClick = () => {
    if (!scoring.qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    await scoring.handleSubmit(onSubmit);
    setShowConfirmation(false);
  };

  // Timer visuals
  const warningMessage = stopwatch.getWarningMessage();
  const maxTimeMs = stopwatch.getMaxTimeMs();

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
          titleLines: ['ASCA Scent Detection'],
          subtitle: formatScoresheetSubtitle(classInfo),
          headerActions,
        }}
        actions={{
          onCancel: onBack,
          onSave: handleSubmitClick,
          saveDisabled:
            scoring.isSubmitting ||
            !scoring.qualifying ||
            scoring.disqualifyReasonMissing ||
            scoring.hasUnresolvedTime,
          isSubmitting: scoring.isSubmitting,
        }}
      >
        <ScoresheetTimerCard
          clock={
            <span
              className={cn(
                'font-mono',
                stopwatch.shouldShow30SecondWarning() && 'text-amber-500',
                stopwatch.isTimeExpired() && 'text-destructive'
              )}
            >
              <StopwatchTime stopwatch={stopwatch} />
            </span>
          }
          limit={
            <StopwatchTime stopwatch={stopwatch}>
              {elapsedMs => timerLimitLine(elapsedMs, areaMaxSeconds, stopwatch.getRemainingTime())}
            </StopwatchTime>
          }
          aside={
            maxTimeMs > 0 && (
              <StopwatchTime stopwatch={stopwatch}>
                {elapsedMs => (
                  <MaxTimeRing
                    className="flex-shrink-0"
                    remainingMs={Math.max(0, maxTimeMs - elapsedMs)}
                    maxTimeMs={maxTimeMs}
                  />
                )}
              </StopwatchTime>
            )
          }
        >
          {stopwatch.isRunning ? (
            <Button
              variant="destructive"
              className={timerPrimaryButtonClass}
              onClick={handleStopTimer}
              data-testid="timer-stop"
            >
              Stop
            </Button>
          ) : stopwatch.time > 0 && stopwatch.isTimeExpired() ? (
            <Button
              variant="outline"
              className={timerPrimaryButtonClass}
              onClick={handleResetTimer}
            >
              Reset
            </Button>
          ) : (
            <Button
              variant={stopwatch.time > 0 ? 'secondary' : 'default'}
              className={cn(
                timerPrimaryButtonClass,
                stopwatch.time === 0 && 'bg-green-600 hover:bg-green-700'
              )}
              onClick={handleStartTimer}
              data-testid={stopwatch.time > 0 ? undefined : 'timer-start'}
            >
              {stopwatch.time > 0 ? 'Resume' : 'Start'}
            </Button>
          )}
          <TimerResetButton
            visible={!stopwatch.isRunning && stopwatch.time > 0 && !stopwatch.isTimeExpired()}
            onReset={handleResetTimer}
          />
          <RecordAreaTimeButton
            areaNames={scoring.areas.map(a => a.areaName)}
            timedArea={area.timedArea}
            isRunning={stopwatch.isRunning}
            elapsedMs={stopwatch.time}
            onRecord={handleRecordArea}
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

        {scoring.areas.map((searchArea, index) => (
          <ManualTimeField
            key={index}
            label={scoring.areas.length > 1 ? searchArea.areaName : undefined}
            value={searchArea.time}
            onChange={value => scoring.handleAreaUpdate(index, 'time', value)}
            ariaLabel={`${searchArea.areaName} time`}
            maxLabel={maxTimeLabel(maxTimeForArea(rules, index))}
          />
        ))}

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

          {scoring.qualifying === 'Q' && (
            <FaultStepper
              value={scoring.faultCount}
              onChange={scoring.setFaultCount}
              testIds={{ decrement: 'fault-decrement', increment: 'fault-increment' }}
            />
          )}

          {scoring.qualifying === 'DQ' && (
            <DisqualifyReason
              sportType="ASCA_SCENT_DETECTION"
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
            ...timeRows(scoring.areas, scoring.calculateTotalTime()),
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

registerScoresheet('ASCA_SCENT_DETECTION', 'live', ASCAScentDetectionLiveScoresheet);
