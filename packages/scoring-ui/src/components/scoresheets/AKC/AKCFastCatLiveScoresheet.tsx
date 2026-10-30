/**
 * AKC FastCAT Live Scoresheet (Judge View)
 *
 * Touch-friendly in-ring scoresheet for the 100-yard dash.
 * Shows stopwatch, auto-calculated MPH and Points, and large result chips.
 *
 * Formula: mph = (100 * 3600) / (timeInSeconds * 1760)
 *          points = mph * 2 (rounded to nearest integer)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Button, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoresheetTimerCard, timerPrimaryButtonClass } from '../../ScoresheetTimerCard';
import { ManualTimeField } from '../../ManualTimeField';
import { ScoreConfirmationDialog } from '../../ScoreConfirmationDialog';
import { resultLabel } from '../../../utils/resultLabel';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { StopwatchTime } from '../../StopwatchTime';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps } from '../../../types';

// FastCAT results: the standard codes plus DQ
type FastCATResult = 'Q' | 'NQ' | 'EX' | 'DQ';

const RESULT_OPTIONS: { value: FastCATResult; label: string; activeClass: string }[] = [
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
    value: 'EX',
    label: resultLabel('EX'),
    activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500',
  },
  { value: 'DQ', label: resultLabel('DQ'), activeClass: DQ_ACTIVE_CLASS },
];

// 100 yards / time → MPH
// mph = (100yd × 3600s/hr) / (timeInSeconds × 1760yd/mi)
function calcMph(timeInSeconds: number): number {
  if (timeInSeconds <= 0) return 0;
  return (100 * 3600) / (timeInSeconds * 1760);
}

function parseTimeToSeconds(timeString: string): number {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  if (parts.length === 2) {
    return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
  }
  return parseFloat(timeString) || 0;
}

export const AKCFastCatLiveScoresheet: React.FC<LiveScoresheetProps> = ({
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
  const [fastcatResult, setFastcatResult] = useState<FastCATResult | ''>('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const stopwatch = useStopwatch({
    maxTime: '1:00.00',
    level: classInfo.level,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
  });

  const handleStopTimer = useCallback(() => {
    const elapsedMs = stopwatch.pause();
    scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(elapsedMs));
  }, [stopwatch, scoring]);

  // Derive run time from the single area
  const runTimeStr = scoring.areas[0]?.time ?? '';

  const { mph, points } = useMemo(() => {
    const secs = parseTimeToSeconds(runTimeStr);
    if (secs <= 0) return { mph: 0, points: 0 };
    const calculatedMph = calcMph(secs);
    return {
      mph: Math.round(calculatedMph * 100) / 100,
      points: Math.round(calculatedMph * 2),
    };
  }, [runTimeStr]);

  // A DQ is an official record: it cannot be saved without its reason (MYK9-1011).
  const reasonMissing = fastcatResult === 'DQ' && !scoring.nonQualifyingReason.trim();

  const handleResultSelect = (value: FastCATResult) => {
    if (value === 'DQ' && fastcatResult !== 'DQ') scoring.setNonQualifyingReason('');
    setFastcatResult(value);
  };

  const handleSubmitClick = () => {
    if (!fastcatResult || reasonMissing) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    if (!fastcatResult || reasonMissing) return;
    setIsSubmitting(true);
    try {
      const scoreData = scoring.buildScoreData({
        resultText: fastcatResult,
        points,
        searchTime: runTimeStr || '0.00',
        nonQualifyingReason:
          fastcatResult === 'DQ' ? scoring.nonQualifyingReason.trim() : undefined,
      });
      await onSubmit(scoreData);
    } finally {
      setIsSubmitting(false);
      setShowConfirmation(false);
    }
  };

  const { upButton } = useScoresheetLeave({
    scoring,
    stopwatch,
    extraDirty: () => fastcatResult !== '',
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
          titleLines: ['AKC FastCAT'],
          subtitle: `${classInfo.element} ${classInfo.level}`,
          headerActions,
        }}
        actions={{
          onCancel: onBack,
          onSave: handleSubmitClick,
          saveDisabled: isSubmitting || !fastcatResult || reasonMissing,
          isSubmitting,
        }}
      >
        <ScoresheetTimerCard
          clock={
            <span className={cn('font-mono', stopwatch.isTimeExpired() && 'text-destructive')}>
              <StopwatchTime stopwatch={stopwatch} />
            </span>
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

        <ManualTimeField
          label="Run time"
          inputId="fastcat-run-time"
          testId="run-time-input"
          ariaLabel="Run time"
          value={runTimeStr}
          onChange={value => scoring.handleAreaUpdate(0, 'time', value)}
        />

        {/* Speed & Points */}
        {mph > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Card className="border-amber-500/20 bg-amber-500/10 p-2 text-center">
              <div className="text-sm font-medium text-amber-600">Speed</div>
              <div className="text-xl font-bold text-amber-600" data-testid="mph-display">
                {mph.toFixed(1)} MPH
              </div>
            </Card>
            <Card className="border-green-500/20 bg-green-500/10 p-2 text-center">
              <div className="text-sm font-medium text-green-600">Points</div>
              <div className="text-xl font-bold text-green-600" data-testid="points-display">
                {points}
              </div>
            </Card>
          </div>
        )}

        <Card className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {RESULT_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={fastcatResult === opt.value ? 'default' : 'outline'}
                className={cn('h-12', fastcatResult === opt.value && opt.activeClass)}
                onClick={() => handleResultSelect(opt.value)}
                data-testid={`result-${opt.value}`}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {fastcatResult === 'DQ' && (
            <DisqualifyReason
              sportType="AKC_FASTCAT"
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
          subtitle="AKC FastCAT"
          armband={entry.armband}
          dogName={entry.dogName}
          handlerName={entry.handlerName}
          result={fastcatResult}
          rows={[
            { label: 'Run Time', value: runTimeStr || 'Not entered', mono: true },
            ...(mph > 0
              ? [
                  { label: 'Speed', value: `${mph.toFixed(2)} MPH` },
                  { label: 'Points', value: points, className: 'text-green-600' },
                ]
              : []),
          ]}
          // Only a DQ saves a reason on this sheet (see handleConfirmSubmit).
          reason={fastcatResult === 'DQ' ? scoring.nonQualifyingReason : undefined}
          isSubmitting={isSubmitting}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </>
  );
};

registerScoresheet('AKC_FASTCAT', 'live', AKCFastCatLiveScoresheet);
