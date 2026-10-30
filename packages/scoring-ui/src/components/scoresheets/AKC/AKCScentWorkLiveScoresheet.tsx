/**
 * AKC Scent Work Live Scoresheet (Judge View)
 *
 * Touch-friendly in-ring scoresheet with stopwatch timer,
 * countdown ring, and large result chips.
 *
 * Uses useScoresheetScoring for state and useStopwatch for timer.
 */

import React, { useState } from 'react';
import { formatTrialLabel } from '@myk9/core';
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { ScoreConfirmationDialog, timeRows } from '../../ScoreConfirmationDialog';
import { TimerResetButton } from '../../TimerResetButton';
import { RecordAreaTimeButton } from '../../RecordAreaTimeButton';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { StopwatchTime } from '../../StopwatchTime';
import { remainingColor } from '../../MaxTimeRing';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { useTimedArea } from '../../../hooks/useTimedArea';
import { maxTimeForArea } from '../../../utils/buildResolvedClassRules';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { maxTimeLabel, timerLimitLine } from '../../../utils/maxTimeLabel';
import { ResultChoiceChips } from '../../ResultChoiceChips';
import type { LiveScoresheetProps, QualifyingResult } from '../../../types/scoreData';

/**
 * Header title lines: trial date, then the trial's label on its own line (MYK9-704;
 * no em dash), falling back to the sport name.
 */
function buildHeaderTitle(classInfo: LiveScoresheetProps['classInfo']): string[] {
  if (!classInfo.trialDate) return ['AKC Scent Work'];
  const formatted = new Date(classInfo.trialDate + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const { trialName, trialNumber } = classInfo;
  return trialName || trialNumber
    ? [formatted, formatTrialLabel({ name: trialName, trialNumber })]
    : [formatted];
}

export const AKCScentWorkLiveScoresheet: React.FC<LiveScoresheetProps> = ({
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

  // Each area runs against its own max time (MYK9-1098).
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

  // Multi-area: the judge records the clock into the area it timed, and the
  // clock resets for the next area.
  const handleRecordArea = () => {
    scoring.handleAreaUpdate(area.timedArea, 'time', stopwatch.formatTime(stopwatch.time));
    handleResetTimer();
  };

  const handleStopTimer = () => {
    const elapsedMs = stopwatch.pause();
    if (scoring.areas.length === 1) {
      scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
    }
  };

  const handleResultSelect = (value: QualifyingResult) => {
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

  const headerTitle = buildHeaderTitle(classInfo);

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
          titleLines: headerTitle,
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
        {/* Timer: neutral surface; the Start button carries the accent. */}
        <ScoresheetTimerCard
          clock={
            <span
              className={cn(
                'transition-colors duration-300',
                stopwatch.shouldShow30SecondWarning() && 'text-amber-500',
                stopwatch.isTimeExpired() && 'text-red-500 animate-pulse'
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
          progress={
            maxTimeMs > 0 && (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <StopwatchTime stopwatch={stopwatch}>
                  {elapsedMs => {
                    const remainingMs = Math.max(0, maxTimeMs - elapsedMs);
                    return (
                      <div
                        className="h-full rounded-full transition-all duration-300 ease-linear"
                        style={{
                          width: `${(remainingMs / maxTimeMs) * 100}%`,
                          backgroundColor: remainingColor(remainingMs),
                        }}
                      />
                    );
                  }}
                </StopwatchTime>
              </div>
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
          ) : (
            <Button
              className={cn(timerPrimaryButtonClass, 'bg-primary text-primary-foreground')}
              onClick={handleStartTimer}
              data-testid={stopwatch.time > 0 ? undefined : 'timer-start'}
            >
              {stopwatch.time > 0 ? 'Resume' : 'Start'}
            </Button>
          )}
          <TimerResetButton
            visible={!stopwatch.isRunning && stopwatch.time > 0}
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

        {/* Warning */}
        {warningMessage && (
          <div
            className={cn(
              'rounded-lg border px-3 py-2 text-center text-sm font-semibold',
              warningMessage === 'Time Expired'
                ? 'border-red-500 bg-red-500/10 text-red-600'
                : 'border-amber-400 bg-amber-400/10 text-amber-500'
            )}
          >
            {warningMessage}
          </div>
        )}

        {/* Typed time, one row per area: the manual path stays one tap away. */}
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

        {/* Result chips, faults and any NQ, Excused or DQ reason */}
        <Card className="p-3">
          <ResultChoiceChips
            selectedResult={
              scoring.qualifying === 'Q' ||
              scoring.qualifying === 'NQ' ||
              scoring.qualifying === 'ABS' ||
              scoring.qualifying === 'EX' ||
              scoring.qualifying === 'DQ'
                ? scoring.qualifying
                : null
            }
            onResultChange={handleResultSelect}
            faultCount={scoring.faultCount}
            onFaultCountChange={scoring.setFaultCount}
            nqReason={scoring.nonQualifyingReason}
            onNQReasonChange={scoring.setNonQualifyingReason}
            excusedReason={scoring.nonQualifyingReason}
            onExcusedReasonChange={scoring.setNonQualifyingReason}
            disqualifyReason={scoring.nonQualifyingReason}
            onDisqualifyReasonChange={scoring.setNonQualifyingReason}
            sportType="AKC_SCENT_WORK"
          />
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
              ? [{ label: 'Faults', value: scoring.faultCount, className: 'text-red-500' }]
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

registerScoresheet('AKC_SCENT_WORK', 'live', AKCScentWorkLiveScoresheet);
