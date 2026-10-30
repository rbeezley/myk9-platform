/**
 * UKC Rally Live Scoresheet (Judge View)
 *
 * Deduction-based scoring: Start at 100, subtract deductions.
 * - Qualifying: 70+ points = Q, below 70 = NQ
 * - Course timer: optional, 5-minute max, used as tiebreaker
 * - Results: Q, NQ only
 */

import React, { useState, useCallback } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { ScoreConfirmationDialog } from '../../ScoreConfirmationDialog';
import { resultLabel } from '../../../utils/resultLabel';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { StopwatchTime } from '../../StopwatchTime';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types';

export const UKCRallyLiveScoresheet: React.FC<LiveScoresheetProps> = ({
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
  const [deductions, setDeductions] = useState(0);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const stopwatch = useStopwatch({
    maxTime: '5:00',
    level: classInfo.level,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      if (scoring.areas.length > 0) {
        scoring.handleAreaUpdate(0, 'time', formattedTime);
      }
    },
  });

  const finalScore = Math.max(0, 100 - deductions);
  const autoQualifying = finalScore >= 70 ? 'Q' : 'NQ';

  const handleStopTimer = useCallback(() => {
    const elapsedMs = stopwatch.pause();
    const formattedTime = stopwatch.formatTime(elapsedMs);
    if (scoring.areas.length > 0) {
      scoring.handleAreaUpdate(0, 'time', formattedTime);
    }
  }, [stopwatch, scoring]);

  const handleDeductionDecrease = () => {
    setDeductions(prev => Math.max(0, prev - 1));
  };

  const handleDeductionIncrease = () => {
    setDeductions(prev => Math.min(100, prev + 1));
  };

  const handleResultSelect = (value: 'Q' | 'NQ') => {
    scoring.setQualifying(value);
    if (value !== 'NQ') {
      scoring.setNonQualifyingReason('');
    }
  };

  const handleSubmitClick = () => {
    // Use explicit result or fall back to auto-qualifying
    const result = scoring.qualifying || autoQualifying;
    if (!result) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    const result = (scoring.qualifying || autoQualifying) as 'Q' | 'NQ';
    // Ensure qualifying is set before building score data
    if (!scoring.qualifying) {
      scoring.setQualifying(result);
    }
    const courseTime = scoring.areas.length > 0 ? scoring.areas[0].time : '';
    await scoring.handleSubmit(onSubmit, {
      points: finalScore,
      faultCount: deductions,
      searchTime: courseTime || '0.00',
      resultText: result,
    });
    setShowConfirmation(false);
  };

  const warningMessage = stopwatch.getWarningMessage();
  const displayResult = scoring.qualifying || autoQualifying;

  const { upButton } = useScoresheetLeave({
    scoring,
    stopwatch,
    extraDirty: () => deductions > 0,
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
          titleLines: ['UKC Rally'],
          subtitle: `${classInfo.element} ${classInfo.level}`,
          headerActions,
        }}
        actions={{
          onCancel: onBack,
          onSave: handleSubmitClick,
          saveDisabled: scoring.isSubmitting,
          isSubmitting: scoring.isSubmitting,
        }}
      >
        <ScoresheetTimerCard
          label="Course Time"
          clock={
            <span
              className={cn(
                'font-mono',
                stopwatch.shouldShow30SecondWarning() && 'text-amber-500',
                stopwatch.isTimeExpired() && 'text-destructive'
              )}
              data-testid="course-timer-display"
            >
              <StopwatchTime stopwatch={stopwatch} />
            </span>
          }
          limit={
            <StopwatchTime stopwatch={stopwatch}>
              {elapsedMs =>
                elapsedMs > 0 ? <>Remaining: {stopwatch.getRemainingTime()}</> : <>Max Time: 5:00</>
              }
            </StopwatchTime>
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
          ) : stopwatch.time > 0 && !stopwatch.isTimeExpired() ? (
            <Button
              variant="secondary"
              className={timerPrimaryButtonClass}
              onClick={stopwatch.start}
            >
              Resume
            </Button>
          ) : stopwatch.time > 0 ? (
            <Button variant="outline" className={timerPrimaryButtonClass} onClick={stopwatch.reset}>
              Reset
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

        {/* Course time: typed here, or filled when the timer stops. */}
        {scoring.areas.length > 0 && (
          <ManualTimeField
            label="Course time"
            inputId="rally-course-time"
            ariaLabel="Course time"
            value={scoring.areas[0].time}
            onChange={value => scoring.handleAreaUpdate(0, 'time', value)}
          />
        )}

        {/* Score Display: three columns */}
        <Card className="p-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-sm text-muted-foreground">Starting</div>
              <div className="text-3xl font-bold" data-testid="starting-score">
                100
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Deductions</div>
              <div className="flex items-center justify-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={handleDeductionDecrease}
                  data-testid="deduction-decrease"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-8 text-center text-3xl font-bold" data-testid="deduction-count">
                  {deductions}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11"
                  onClick={handleDeductionIncrease}
                  data-testid="deduction-increase"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Final Score</div>
              <div
                className={cn(
                  'text-3xl font-bold',
                  finalScore >= 70 ? 'text-green-600' : 'text-red-600'
                )}
                data-testid="final-score"
              >
                {finalScore}
              </div>
              <div
                className={cn('text-xs', finalScore >= 70 ? 'text-green-600' : 'text-red-600')}
                data-testid="auto-qualifying-badge"
              >
                {finalScore >= 70 ? 'Qualifying' : 'Non-Qualifying'}
              </div>
            </div>
          </div>
          <div className="mt-1 text-center text-xs text-muted-foreground">
            70+ required to qualify
          </div>
        </Card>

        {/* Result Buttons */}
        <Card className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant={displayResult === 'Q' ? 'default' : 'outline'}
              className={cn('h-12', displayResult === 'Q' && 'bg-green-600 hover:bg-green-700')}
              onClick={() => handleResultSelect('Q')}
              data-testid="result-Q"
            >
              {resultLabel('Q')}
            </Button>
            <Button
              variant={displayResult === 'NQ' ? 'default' : 'outline'}
              className={cn('h-12', displayResult === 'NQ' && 'bg-amber-500 hover:bg-amber-600')}
              onClick={() => handleResultSelect('NQ')}
              data-testid="result-NQ"
            >
              {resultLabel('NQ')}
            </Button>
          </div>

          {displayResult === 'NQ' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">NQ Reason:</label>
              <Input
                type="text"
                value={scoring.nonQualifyingReason}
                onChange={e => scoring.setNonQualifyingReason(e.target.value)}
                placeholder="Enter reason for NQ..."
                data-testid="nq-reason-input"
              />
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
          result={displayResult}
          rows={[
            { label: 'Final Score', value: `${finalScore}/100` },
            ...(deductions > 0
              ? [{ label: 'Deductions', value: deductions, className: 'text-red-600' }]
              : []),
            ...(scoring.areas.length > 0 && scoring.areas[0].time
              ? [{ label: 'Course Time', value: scoring.areas[0].time, mono: true }]
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

registerScoresheet('UKC_RALLY', 'live', UKCRallyLiveScoresheet);
