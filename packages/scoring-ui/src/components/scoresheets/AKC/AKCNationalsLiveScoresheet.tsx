/**
 * AKC Nationals Live Scoresheet (Judge View)
 *
 * Nationals scoring uses 5 search areas with points-based scoring.
 * +10 points per correct alert, -5 per incorrect alert and -5 per finish call error
 * (NATIONALS_SCORING, MYK9-1835).
 * Results: Q/NQ/ABS/EX/DQ. Placement is the server's ranking, never set here.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { Check } from 'lucide-react';
import { NATIONALS_SCORING } from '@myk9/core';
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { ScoreConfirmationDialog } from '../../ScoreConfirmationDialog';
import { StopwatchTime } from '../../StopwatchTime';
import { MaxTimeRing } from '../../MaxTimeRing';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { maxTimeLabel } from '../../../utils/maxTimeLabel';
import { DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps } from '../../../types/scoreData';
import type { ExtendedResult } from '../../../types/scoreData';
import { QUALIFYING_OPTIONS } from './nationalsResultOptions';
import { NationalsAreaBreakdown } from './NationalsAreaBreakdown';
import {
  calculatePoints,
  NATIONALS_AREA_COUNT,
  nationalsAreaLimitSeconds,
  seedAlerts,
  sum,
} from './nationalsAlerts';
import { scoringSource, timerPersist } from '../../../utils/timerPersist';

export const AKCNationalsLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  backLabel,
  onDirtyChange,
  headerActions,
  onRunStart,
  onWarningChime,
  onVoiceAnnouncement,
  enableVoiceAnnouncements,
}) => {
  const areaCount = NATIONALS_AREA_COUNT;
  const [currentArea, setCurrentArea] = useState(0);
  // MYK9-2006: only totals are stored; a reopened score carries them in Area 1.
  const [saved] = useState(() => entry.existingScore);
  const [correctAlerts, setCorrectAlerts] = useState<number[]>(() =>
    seedAlerts(areaCount, entry.existingScore?.correctCount)
  );
  const [incorrectAlerts, setIncorrectAlerts] = useState<number[]>(() =>
    seedAlerts(areaCount, entry.existingScore?.incorrectCount)
  );
  const [finishCallErrors, setFinishCallErrors] = useState(
    entry.existingScore?.finishCallErrors ?? 0
  );
  const [showConfirmation, setShowConfirmation] = useState(false);

  // MYK9-2019: the one limit the timer stops at, "Use max time" fills and a Qualified
  // is checked against. 0 = no limit.
  const areaMaxSeconds = nationalsAreaLimitSeconds(rules.maxTimeSeconds, areaCount);
  const areaMaxTimeStr = `${Math.floor(areaMaxSeconds / 60)}:${String(areaMaxSeconds % 60).padStart(2, '0')}`;

  const scoringRules = useMemo(
    () => ({
      ...rules,
      areaCount,
      areaMaxTimeSeconds: Array.from({ length: areaCount }, () => areaMaxSeconds),
    }),
    [rules, areaCount, areaMaxSeconds]
  );

  const scoring = useScoresheetScoring({
    rules: scoringRules,
    qualifiedRules: { keepUnstoredAreaBlank: true },
    ...scoringSource(entry),
  });

  const stopwatch = useStopwatch({
    ...timerPersist(entry),
    maxTime: areaMaxTimeStr,
    level: classInfo.level,
    thirtySecondWarning: rules.thirtySecondWarning,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      scoring.handleAreaUpdate(currentArea, 'time', formattedTime);
    },
  });

  const handleStartTimer = () => {
    onRunStart?.();
    stopwatch.start();
  };

  const handleStopTimer = useCallback(() => {
    const elapsedMs = stopwatch.pause();
    scoring.handleAreaUpdate(currentArea, 'time', stopwatch.formatTime(elapsedMs));
  }, [stopwatch, scoring, currentArea]);

  const handleAreaSelect = (index: number) => {
    setCurrentArea(index);
    stopwatch.reset();
  };

  const handleCorrectChange = (delta: number) => {
    setCorrectAlerts(prev => {
      const next = [...prev];
      next[currentArea] = Math.max(0, (next[currentArea] ?? 0) + delta);
      return next;
    });
  };

  const handleIncorrectChange = (delta: number) => {
    setIncorrectAlerts(prev => {
      const next = [...prev];
      next[currentArea] = Math.max(0, (next[currentArea] ?? 0) + delta);
      return next;
    });
  };

  const handleResultSelect = (value: ExtendedResult) => {
    // Re-tapping DQ keeps the reason already typed (MYK9-1011).
    if (value === 'DQ' && scoring.qualifying === 'DQ') return;
    scoring.setQualifying(value);
    if (value === 'EX' || value === 'DQ') {
      setCorrectAlerts(Array(areaCount).fill(0));
      setIncorrectAlerts(Array(areaCount).fill(0));
      setFinishCallErrors(0);
    }
    // A DQ must state its own reason; never inherit one from an earlier result.
    if (value === 'DQ') scoring.setNonQualifyingReason('');
  };

  const totalPoints = calculatePoints(correctAlerts, incorrectAlerts, finishCallErrors);

  // The sentence for a Qualified that cannot be saved: this area's, else the first other area's.
  const otherAreaProblem = scoring.qualifiedTimeProblems.findIndex(p => p !== null);
  const timeProblem =
    scoring.qualifiedTimeProblems[currentArea] ??
    (otherAreaProblem >= 0
      ? `Area ${otherAreaProblem + 1}: ${scoring.qualifiedTimeProblems[otherAreaProblem]}`
      : null);

  const handleSubmitClick = () => {
    if (!scoring.qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    await scoring.handleSubmit(onSubmit, {
      points: totalPoints,
      finishCallErrors,
      correctCount: sum(correctAlerts),
      incorrectCount: sum(incorrectAlerts),
      // The result is the qualification. A placement is not a result status and
      // the save path refuses one (MYK9-1806).
      resultText: scoring.qualifying || 'NQ',
    });
    setShowConfirmation(false);
  };

  const warningMessage = stopwatch.getWarningMessage();
  const maxTimeMs = stopwatch.getMaxTimeMs();

  const { upButton } = useScoresheetLeave({
    scoring,
    stopwatch,
    // Compared with what the sheet opened with: a reopened score is not dirty until edited.
    extraDirty: () =>
      sum(correctAlerts) !== (saved?.correctCount ?? 0) ||
      sum(incorrectAlerts) !== (saved?.incorrectCount ?? 0) ||
      finishCallErrors !== (saved?.finishCallErrors ?? 0),
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
          titleLines: ['AKC Nationals'],
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
            scoring.hasUnresolvedTime ||
            scoring.qualifiedBlocked,
          isSubmitting: scoring.isSubmitting,
        }}
      >
        {/* Area Navigation Tabs */}
        <div className="flex gap-1 rounded-lg bg-muted p-1" data-testid="area-tabs">
          {Array.from({ length: areaCount }, (_, i) => (
            <button
              key={i}
              className={cn(
                'relative min-h-11 flex-1 rounded-md text-sm font-medium transition-colors',
                i === currentArea
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => handleAreaSelect(i)}
              data-testid={`area-tab-${i + 1}`}
            >
              Area {i + 1}
              {scoring.areas[i]?.time && i !== currentArea && (
                <Check className="absolute right-1 top-1 h-3 w-3 text-green-600" />
              )}
            </button>
          ))}
        </div>

        <ScoresheetTimerCard
          recovery={stopwatch.recovery}
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
          limit={`Area ${currentArea + 1} · Max: ${maxTimeLabel(areaMaxSeconds)}`}
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
            <Button variant="outline" className={timerPrimaryButtonClass} onClick={stopwatch.reset}>
              Reset
            </Button>
          ) : stopwatch.time > 0 ? (
            <Button
              variant="secondary"
              className={timerPrimaryButtonClass}
              onClick={stopwatch.start}
            >
              Resume
            </Button>
          ) : (
            <Button
              className={cn(timerPrimaryButtonClass, 'bg-green-600 hover:bg-green-700')}
              onClick={handleStartTimer}
              data-testid="timer-start"
            >
              Start
            </Button>
          )}
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

        {/* One field per area: a shared one shows the last area's digits for a frame (MYK9-1835). */}
        <ManualTimeField
          key={currentArea}
          label={`Area ${currentArea + 1}`}
          value={scoring.areas[currentArea]?.time ?? ''}
          onChange={value => scoring.handleAreaUpdate(currentArea, 'time', value)}
          ariaLabel={`Area ${currentArea + 1} time`}
          maxLabel={maxTimeLabel(areaMaxSeconds)}
          problem={timeProblem}
          onUseMax={scoring.setToMaxTime(currentArea)}
        />

        {/* Alert Counters */}
        <div className="grid grid-cols-2 gap-2">
          <Card className="p-2">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Correct Alerts</div>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  className="h-11 w-11 shrink-0 p-0"
                  onClick={() => handleCorrectChange(-1)}
                  data-testid="correct-dec"
                >
                  -
                </Button>
                <span
                  className="w-12 text-center text-3xl font-bold text-green-600"
                  data-testid="correct-count"
                >
                  {correctAlerts[currentArea] ?? 0}
                </span>
                <Button
                  variant="outline"
                  className="h-11 w-11 shrink-0 p-0"
                  onClick={() => handleCorrectChange(1)}
                  data-testid="correct-inc"
                >
                  +
                </Button>
              </div>
              <div className="text-xs text-green-600">
                +{NATIONALS_SCORING.CORRECT_ALERT_POINTS} pts each
              </div>
            </div>
          </Card>
          <Card className="p-2">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Incorrect Alerts</div>
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  className="h-11 w-11 shrink-0 p-0"
                  onClick={() => handleIncorrectChange(-1)}
                  data-testid="incorrect-dec"
                >
                  -
                </Button>
                <span
                  className="w-12 text-center text-3xl font-bold text-red-600"
                  data-testid="incorrect-count"
                >
                  {incorrectAlerts[currentArea] ?? 0}
                </span>
                <Button
                  variant="outline"
                  className="h-11 w-11 shrink-0 p-0"
                  onClick={() => handleIncorrectChange(1)}
                  data-testid="incorrect-inc"
                >
                  +
                </Button>
              </div>
              <div className="text-xs text-red-600">
                -{NATIONALS_SCORING.INCORRECT_ALERT_PENALTY} pts each
              </div>
            </div>
          </Card>
        </div>

        {/* Finish Call Errors */}
        <Card className="p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              Finish Call Errors:{' '}
              <span className="text-xs font-normal text-red-600">
                -{NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY} pts each
              </span>
            </span>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="h-11 w-11 shrink-0 p-0"
                onClick={() => setFinishCallErrors(v => Math.max(0, v - 1))}
                data-testid="fce-dec"
              >
                -
              </Button>
              <span className="w-8 text-center text-xl font-bold" data-testid="fce-count">
                {finishCallErrors}
              </span>
              <Button
                variant="outline"
                className="h-11 w-11 shrink-0 p-0"
                onClick={() => setFinishCallErrors(v => v + 1)}
                data-testid="fce-inc"
              >
                +
              </Button>
            </div>
          </div>
        </Card>

        {/* Points Summary */}
        <Card className="border-rose-500/20 bg-rose-500/10 p-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-rose-600">Total Points</div>
            <div className="text-3xl font-bold text-rose-600" data-testid="total-points">
              {totalPoints}
            </div>
          </div>
        </Card>

        {/* Result Chips */}
        <Card className="space-y-2 p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Qualifying Result</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {QUALIFYING_OPTIONS.map(opt => (
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
          </div>

          {scoring.qualifying === 'DQ' && (
            <DisqualifyReason
              sportType="AKC_SCENT_WORK_NATIONAL"
              reason={scoring.nonQualifyingReason}
              onReasonChange={scoring.setNonQualifyingReason}
            />
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
            { label: 'Total Points', value: totalPoints, className: 'font-bold text-rose-600' },
            ...(finishCallErrors > 0
              ? [
                  {
                    label: `Finish Call Errors (-${NATIONALS_SCORING.FINISH_CALL_ERROR_PENALTY} each)`,
                    value: finishCallErrors,
                    className: 'text-amber-500',
                  },
                ]
              : []),
          ]}
          reason={scoring.nonQualifyingReason}
          isSubmitting={scoring.isSubmitting}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={handleConfirmSubmit}
        >
          <NationalsAreaBreakdown
            areas={scoring.areas}
            correctAlerts={correctAlerts}
            incorrectAlerts={incorrectAlerts}
            finishCallErrors={finishCallErrors}
          />
        </ScoreConfirmationDialog>
      )}
    </>
  );
};

registerScoresheet('AKC_SCENT_WORK_NATIONAL', 'live', AKCNationalsLiveScoresheet);
