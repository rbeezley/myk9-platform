/**
 * AKC Nationals Live Scoresheet (Judge View)
 *
 * Nationals scoring uses 5 search areas with points-based scoring.
 * +10 points per correct alert, -5 points per incorrect alert.
 * Extended results: Q/NQ/EX/ABS plus 1st/2nd/3rd/4th placements.
 */

import React, { useState, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { ScoreConfirmationDialog } from '../../ScoreConfirmationDialog';
import { resultLabel } from '../../../utils/resultLabel';
import { StopwatchTime } from '../../StopwatchTime';
import { MaxTimeRing } from '../../MaxTimeRing';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { maxTimeLabel } from '../../../utils/maxTimeLabel';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps } from '../../../types/scoreData';
import type { ExtendedResult } from '../../../types/scoreData';

const QUALIFYING_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
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

const PLACEMENT_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: '1st',
    label: '1st Place',
    activeClass: 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500',
  },
  {
    value: '2nd',
    label: '2nd Place',
    activeClass: 'bg-slate-400 hover:bg-slate-500 border-slate-400',
  },
  {
    value: '3rd',
    label: '3rd Place',
    activeClass: 'bg-orange-500 hover:bg-orange-600 border-orange-500',
  },
  {
    value: '4th',
    label: '4th Place',
    activeClass: 'bg-violet-500 hover:bg-violet-600 border-violet-500',
  },
];

const PLACEMENT_BONUS: Record<string, number> = {
  '1st': 10,
  '2nd': 7,
  '3rd': 5,
  '4th': 3,
};

const NATIONALS_AREA_COUNT = 5;

function calculatePoints(
  correctAlerts: number[],
  incorrectAlerts: number[],
  placement: string
): number {
  let pts = 0;
  for (let i = 0; i < correctAlerts.length; i++) {
    pts += (correctAlerts[i] ?? 0) * 10;
    pts -= (incorrectAlerts[i] ?? 0) * 5;
  }
  pts += PLACEMENT_BONUS[placement] ?? 0;
  return Math.max(0, pts);
}

export const AKCNationalsLiveScoresheet: React.FC<LiveScoresheetProps> = ({
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
  const areaCount = rules.areaCount ?? NATIONALS_AREA_COUNT;
  const [currentArea, setCurrentArea] = useState(0);
  const [correctAlerts, setCorrectAlerts] = useState<number[]>(() => Array(areaCount).fill(0));
  const [incorrectAlerts, setIncorrectAlerts] = useState<number[]>(() => Array(areaCount).fill(0));
  const [finishCallErrors, setFinishCallErrors] = useState(0);
  const [placement, setPlacement] = useState<string>('');
  const [showConfirmation, setShowConfirmation] = useState(false);

  const areaMaxSeconds =
    rules.maxTimeSeconds > 0 ? Math.floor(rules.maxTimeSeconds / areaCount) : 0; // no limit
  const areaMaxTimeStr = `${Math.floor(areaMaxSeconds / 60)}:${String(areaMaxSeconds % 60).padStart(2, '0')}`;

  const scoring = useScoresheetScoring({
    rules: { ...rules, areaCount },
    existingScore: entry.existingScore,
  });

  const stopwatch = useStopwatch({
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
    const isPlacement = ['1st', '2nd', '3rd', '4th'].includes(value);
    if (isPlacement) {
      setPlacement(prev => (prev === value ? '' : value));
      return;
    }
    // Re-tapping DQ keeps the reason already typed (MYK9-1011).
    if (value === 'DQ' && scoring.qualifying === 'DQ') return;
    scoring.setQualifying(value);
    if (value === 'EX' || value === 'DQ') {
      setCorrectAlerts(Array(areaCount).fill(0));
      setIncorrectAlerts(Array(areaCount).fill(0));
      setFinishCallErrors(0);
      setPlacement('');
    }
    // A DQ must state its own reason; never inherit one from an earlier result.
    if (value === 'DQ') scoring.setNonQualifyingReason('');
  };

  const totalPoints = calculatePoints(correctAlerts, incorrectAlerts, placement);

  const handleSubmitClick = () => {
    if (!scoring.qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    await scoring.handleSubmit(onSubmit, {
      points: totalPoints,
      finishCallErrors,
      correctCount: correctAlerts.reduce((s, v) => s + v, 0),
      incorrectCount: incorrectAlerts.reduce((s, v) => s + v, 0),
      resultText: placement || scoring.qualifying || 'NQ',
    });
    setShowConfirmation(false);
  };

  const warningMessage = stopwatch.getWarningMessage();
  const maxTimeMs = stopwatch.getMaxTimeMs();

  const { upButton } = useScoresheetLeave({
    scoring,
    stopwatch,
    extraDirty: () =>
      placement !== '' ||
      correctAlerts.some(n => n > 0) ||
      incorrectAlerts.some(n => n > 0) ||
      finishCallErrors > 0,
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
            scoring.hasUnresolvedTime,
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
              onClick={stopwatch.start}
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

        <ManualTimeField
          label={`Area ${currentArea + 1}`}
          value={scoring.areas[currentArea]?.time ?? ''}
          onChange={value => scoring.handleAreaUpdate(currentArea, 'time', value)}
          ariaLabel={`Area ${currentArea + 1} time`}
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
              <div className="text-xs text-green-600">+10 pts each</div>
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
              <div className="text-xs text-red-600">-5 pts each</div>
            </div>
          </Card>
        </div>

        {/* Finish Call Errors */}
        <Card className="p-2">
          <div className="flex items-center justify-between">
            <span className="font-medium">Finish Call Errors:</span>
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

          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Placement (optional)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLACEMENT_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  variant={placement === opt.value ? 'default' : 'outline'}
                  className={cn('h-12', placement === opt.value && opt.activeClass)}
                  onClick={() => handleResultSelect(opt.value)}
                  data-testid={`result-${opt.value}`}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>
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
          resultSuffix={placement || undefined}
          rows={[
            { label: 'Total Points', value: totalPoints, className: 'font-bold text-rose-600' },
            ...(finishCallErrors > 0
              ? [
                  {
                    label: 'Finish Call Errors',
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
          {/* Area breakdown */}
          <div className="space-y-1">
            <div className="text-sm font-medium text-muted-foreground">Area Breakdown</div>
            <div className="grid gap-1">
              {scoring.areas.map((area, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-1.5 text-sm"
                >
                  <span className="font-medium">{area.areaName}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{area.time || '--:--'}</span>
                    <span className="text-green-600">+{(correctAlerts[i] ?? 0) * 10}</span>
                    {(incorrectAlerts[i] ?? 0) > 0 && (
                      <span className="text-red-600">-{(incorrectAlerts[i] ?? 0) * 5}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScoreConfirmationDialog>
      )}
    </>
  );
};

registerScoresheet('AKC_SCENT_WORK_NATIONAL', 'live', AKCNationalsLiveScoresheet);
