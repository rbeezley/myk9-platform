/**
 * UKC Rally Live Scoresheet (Judge View)
 *
 * Deduction-based scoring: Start at 100, subtract deductions.
 * - Qualifying: 70+ points = Q, below 70 = NQ
 * - Course timer: optional, 5-minute max, used as tiebreaker
 * - Results: Q, NQ only
 */

import React, { useState, useCallback } from 'react';
import { ArrowLeft, Minus, Plus } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types';

export const UKCRallyLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
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
    stopwatch.pause();
    const formattedTime = stopwatch.formatTime(stopwatch.time);
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
              <h1 className="text-lg font-semibold">UKC Rally</h1>
              <p className="text-sm text-muted-foreground">
                {classInfo.element} {classInfo.level}
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.dogName}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handlerName}</div>
                </div>
              </div>
            </Card>

            {/* Timer Card */}
            <Card className="p-6">
              <div className="text-center">
                <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                  Course Time
                </div>
                <div
                  className={cn(
                    'text-5xl font-mono font-bold tracking-tight',
                    stopwatch.shouldShow30SecondWarning() && 'text-amber-500',
                    stopwatch.isTimeExpired() && 'text-destructive'
                  )}
                  data-testid="course-timer-display"
                >
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="text-sm text-muted-foreground mt-2 tabular-nums">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.getRemainingTime()}</>
                  ) : (
                    <>Max Time: 5:00</>
                  )}
                </div>

                <div className="mt-6 flex justify-center gap-3">
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
                  ) : stopwatch.time > 0 && !stopwatch.isTimeExpired() ? (
                    <Button
                      size="lg"
                      variant="secondary"
                      className="w-32 h-12 text-lg font-semibold"
                      onClick={stopwatch.start}
                    >
                      Resume
                    </Button>
                  ) : stopwatch.time > 0 ? (
                    <Button
                      size="lg"
                      variant="outline"
                      className="w-32 h-12 text-lg font-semibold"
                      onClick={stopwatch.reset}
                    >
                      Reset
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

            {/* Score Display — three columns */}
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                {/* Starting Score */}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Starting</div>
                  <div className="text-3xl font-bold" data-testid="starting-score">
                    100
                  </div>
                </div>

                {/* Deductions Counter */}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Deductions</div>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleDeductionDecrease}
                      data-testid="deduction-decrease"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span
                      className="text-3xl font-bold w-10 text-center"
                      data-testid="deduction-count"
                    >
                      {deductions}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleDeductionIncrease}
                      data-testid="deduction-increase"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Final Score */}
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Final Score</div>
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
                    className={cn(
                      'text-xs mt-1',
                      finalScore >= 70 ? 'text-green-600' : 'text-red-600'
                    )}
                    data-testid="auto-qualifying-badge"
                  >
                    {finalScore >= 70 ? 'Qualifying' : 'Non-Qualifying'}
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-muted-foreground mt-3">
                70+ required to qualify
              </div>
            </Card>

            {/* Result Buttons */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={displayResult === 'Q' ? 'default' : 'outline'}
                  className={cn('h-12', displayResult === 'Q' && 'bg-green-600 hover:bg-green-700')}
                  onClick={() => handleResultSelect('Q')}
                  data-testid="result-Q"
                >
                  Qualified
                </Button>
                <Button
                  variant={displayResult === 'NQ' ? 'default' : 'outline'}
                  className={cn(
                    'h-12',
                    displayResult === 'NQ' && 'bg-amber-500 hover:bg-amber-600'
                  )}
                  onClick={() => handleResultSelect('NQ')}
                  data-testid="result-NQ"
                >
                  NQ
                </Button>
              </div>

              {/* NQ Reason */}
              {displayResult === 'NQ' && (
                <div className="space-y-2">
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

            {/* Course Time Manual Override */}
            {scoring.areas.length > 0 && (
              <Card className="p-4">
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Course Time (manual override)
                </label>
                <Input
                  type="text"
                  value={scoring.areas[0].time}
                  onChange={e => scoring.handleAreaUpdate(0, 'time', e.target.value)}
                  placeholder="0:00.00"
                  className="text-center text-xl font-mono"
                  aria-label="Course time"
                />
              </Card>
            )}

            {/* Submit */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmitClick}
                disabled={scoring.isSubmitting}
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
              <p className="text-sm text-muted-foreground">
                {classInfo.element} {classInfo.level}
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">#{entry.armband}</span>
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
                    displayResult === 'Q' ? 'text-green-600' : 'text-amber-500'
                  )}
                >
                  {displayResult === 'Q' ? 'Qualified' : 'NQ'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Final Score</span>
                <span className="font-semibold">{finalScore}/100</span>
              </div>
              {deductions > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Deductions</span>
                  <span className="font-semibold text-red-600">{deductions}</span>
                </div>
              )}
              {scoring.areas.length > 0 && scoring.areas[0].time && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Course Time</span>
                  <span className="font-mono font-semibold">{scoring.areas[0].time}</span>
                </div>
              )}
              {displayResult === 'NQ' && scoring.nonQualifyingReason && (
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

registerScoresheet('UKC_RALLY', 'live', UKCRallyLiveScoresheet);
