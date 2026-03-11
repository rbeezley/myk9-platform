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
import { ArrowLeft, Zap } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types';

// FastCAT results differ from standard Scent Work (E instead of EX, adds DQ)
type FastCATResult = 'Q' | 'NQ' | 'E' | 'DQ';

const RESULT_OPTIONS: { value: FastCATResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  { value: 'NQ', label: 'NQ', activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500' },
  { value: 'E', label: 'Excused', activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500' },
  { value: 'DQ', label: 'DQ', activeClass: 'bg-red-600 hover:bg-red-700 border-red-600' },
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
    stopwatch.pause();
    scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(stopwatch.time));
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

  const handleSubmitClick = () => {
    if (!fastcatResult) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    if (!fastcatResult) return;
    setIsSubmitting(true);
    try {
      const scoreData = scoring.buildScoreData({
        resultText: fastcatResult,
        points,
        searchTime: runTimeStr || '0.00',
      });
      await onSubmit(scoreData);
    } finally {
      setIsSubmitting(false);
      setShowConfirmation(false);
    }
  };

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                AKC FastCAT
              </h1>
              <p className="text-sm text-muted-foreground">
                {classInfo.element} {classInfo.level}
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.dogName}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handlerName}</div>
                </div>
              </div>
            </Card>

            {/* Timer */}
            <Card className="p-6">
              <div className="text-center">
                <div
                  className={cn(
                    'text-5xl font-mono font-bold tracking-tight',
                    stopwatch.isTimeExpired() && 'text-destructive'
                  )}
                >
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="mt-6">
                  {stopwatch.isRunning ? (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-32 h-12 text-lg font-semibold"
                      onClick={handleStopTimer}
                      data-testid="timer-stop"
                    >
                      Stop
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
                      onClick={stopwatch.start}
                      data-testid="timer-start"
                    >
                      Start
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Run Time Input */}
            <Card className="p-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Run Time
              </label>
              <Input
                type="text"
                value={runTimeStr}
                onChange={e => scoring.handleAreaUpdate(0, 'time', e.target.value)}
                placeholder="0:00.00"
                className="text-center text-xl font-mono"
                aria-label="Run time"
                data-testid="run-time-input"
              />
            </Card>

            {/* Speed & Points */}
            {mph > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center bg-amber-500/10 border-amber-500/20">
                  <div className="text-sm text-amber-600 font-medium">Speed</div>
                  <div className="text-2xl font-bold text-amber-600" data-testid="mph-display">
                    {mph.toFixed(1)} MPH
                  </div>
                </Card>
                <Card className="p-4 text-center bg-green-500/10 border-green-500/20">
                  <div className="text-sm text-green-600 font-medium">Points</div>
                  <div className="text-2xl font-bold text-green-600" data-testid="points-display">
                    {points}
                  </div>
                </Card>
              </div>
            )}

            {/* Result Chips */}
            <Card className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RESULT_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    variant={fastcatResult === opt.value ? 'default' : 'outline'}
                    className={cn('h-12', fastcatResult === opt.value && opt.activeClass)}
                    onClick={() => setFastcatResult(opt.value)}
                    data-testid={`result-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </Card>

            {/* Submit */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmitClick}
                disabled={isSubmitting || !fastcatResult}
                data-testid="submit-btn"
              >
                {isSubmitting ? 'Saving...' : 'Save'}
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
              <p className="text-sm text-muted-foreground">AKC FastCAT</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">#{entry.armband}</span>
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
                    fastcatResult === 'Q' && 'text-green-600',
                    fastcatResult === 'NQ' && 'text-amber-500',
                    fastcatResult === 'E' && 'text-gray-500',
                    fastcatResult === 'DQ' && 'text-red-600'
                  )}
                >
                  {fastcatResult}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Run Time</span>
                <span className="font-mono font-semibold">{runTimeStr || '—'}</span>
              </div>
              {mph > 0 && (
                <>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Speed</span>
                    <span className="font-semibold">{mph.toFixed(2)} MPH</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">Points</span>
                    <span className="font-semibold text-green-600">{points}</span>
                  </div>
                </>
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
                disabled={isSubmitting}
                data-testid="confirm-submit-btn"
              >
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

registerScoresheet('AKC_FASTCAT', 'live', AKCFastCatLiveScoresheet);
