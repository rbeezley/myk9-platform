/**
 * AKC Nationals Live Scoresheet (Judge View)
 *
 * Nationals scoring uses 5 search areas with points-based scoring.
 * +10 points per correct alert, -5 points per incorrect alert.
 * Extended results: Q/NQ/EX/ABS plus 1st/2nd/3rd/4th placements.
 */

import React, { useState, useCallback } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types/scoreData';
import type { ExtendedResult } from '../../../types/scoreData';

const QUALIFYING_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  { value: 'NQ', label: 'NQ', activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500' },
  { value: 'ABS', label: 'Absent', activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500' },
  { value: 'EX', label: 'Excused', activeClass: 'bg-red-600 hover:bg-red-700 border-red-600' },
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
    rules.maxTimeSeconds > 0 ? Math.floor(rules.maxTimeSeconds / areaCount) : 180;
  const areaMaxTimeStr = `${Math.floor(areaMaxSeconds / 60)}:${String(areaMaxSeconds % 60).padStart(2, '0')}`;

  const scoring = useScoresheetScoring({
    rules: { ...rules, areaCount },
    existingScore: entry.existingScore,
  });

  const stopwatch = useStopwatch({
    maxTime: areaMaxTimeStr,
    level: classInfo.level,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      scoring.handleAreaUpdate(currentArea, 'time', formattedTime);
    },
  });

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    scoring.handleAreaUpdate(currentArea, 'time', stopwatch.formatTime(stopwatch.time));
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
    scoring.setQualifying(value);
    if (value === 'EX') {
      setCorrectAlerts(Array(areaCount).fill(0));
      setIncorrectAlerts(Array(areaCount).fill(0));
      setFinishCallErrors(0);
      setPlacement('');
    }
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
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
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
              <h1 className="text-lg font-semibold">AKC Nationals</h1>
              <p className="text-sm text-muted-foreground">
                {classInfo.element} {classInfo.level}
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-primary flex items-center justify-center shadow-md">
                  <span className="text-xl font-bold text-primary-foreground">{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.dogName}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handlerName}</div>
                </div>
              </div>
            </Card>

            {/* Area Navigation Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg" data-testid="area-tabs">
              {Array.from({ length: areaCount }, (_, i) => (
                <button
                  key={i}
                  className={cn(
                    'flex-1 py-2 text-sm font-medium rounded-md transition-colors relative',
                    i === currentArea
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => handleAreaSelect(i)}
                  data-testid={`area-tab-${i + 1}`}
                >
                  Area {i + 1}
                  {scoring.areas[i]?.time && i !== currentArea && (
                    <Check className="h-3 w-3 text-green-600 absolute top-1 right-1" />
                  )}
                </button>
              ))}
            </div>

            {/* Timer */}
            <Card className="p-6 relative overflow-hidden">
              {maxTimeMs > 0 && (
                <svg
                  className="absolute top-3 right-3"
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
              )}

              <div className="text-center pt-8">
                <div
                  className={cn(
                    'text-5xl font-mono font-bold tracking-tight',
                    stopwatch.shouldShow30SecondWarning() && 'text-amber-500',
                    stopwatch.isTimeExpired() && 'text-destructive'
                  )}
                >
                  {stopwatch.formatTime(stopwatch.time)}
                </div>
                <div className="text-sm text-muted-foreground mt-2">
                  Area {currentArea + 1} — Max: {areaMaxTimeStr}
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

            {/* Area Time Input */}
            <Card className="p-4">
              <label className="text-sm font-medium text-muted-foreground mb-1 block">
                Area {currentArea + 1} Time
              </label>
              <Input
                type="text"
                value={scoring.areas[currentArea]?.time ?? ''}
                onChange={e => scoring.handleAreaUpdate(currentArea, 'time', e.target.value)}
                placeholder="0:00.00"
                className="text-center text-xl font-mono"
                aria-label={`Area ${currentArea + 1} time`}
              />
            </Card>

            {/* Alert Counters */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Correct Alerts</div>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCorrectChange(-1)}
                      data-testid="correct-dec"
                    >
                      -
                    </Button>
                    <span
                      className="text-3xl font-bold text-green-600 w-12 text-center"
                      data-testid="correct-count"
                    >
                      {correctAlerts[currentArea] ?? 0}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleCorrectChange(1)}
                      data-testid="correct-inc"
                    >
                      +
                    </Button>
                  </div>
                  <div className="text-xs text-green-600 mt-1">+10 pts each</div>
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Incorrect Alerts</div>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleIncorrectChange(-1)}
                      data-testid="incorrect-dec"
                    >
                      -
                    </Button>
                    <span
                      className="text-3xl font-bold text-red-600 w-12 text-center"
                      data-testid="incorrect-count"
                    >
                      {incorrectAlerts[currentArea] ?? 0}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleIncorrectChange(1)}
                      data-testid="incorrect-inc"
                    >
                      +
                    </Button>
                  </div>
                  <div className="text-xs text-red-600 mt-1">-5 pts each</div>
                </div>
              </Card>
            </div>

            {/* Finish Call Errors */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Finish Call Errors:</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFinishCallErrors(v => Math.max(0, v - 1))}
                    data-testid="fce-dec"
                  >
                    -
                  </Button>
                  <span className="text-xl font-bold w-8 text-center" data-testid="fce-count">
                    {finishCallErrors}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setFinishCallErrors(v => v + 1)}
                    data-testid="fce-inc"
                  >
                    +
                  </Button>
                </div>
              </div>
            </Card>

            {/* Points Summary */}
            <Card className="p-4 bg-rose-500/10 border-rose-500/20">
              <div className="text-center">
                <div className="text-sm text-rose-600 font-medium">Total Points</div>
                <div className="text-4xl font-bold text-rose-600" data-testid="total-points">
                  {totalPoints}
                </div>
              </div>
            </Card>

            {/* Result Chips */}
            <Card className="p-4 space-y-3">
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Qualifying Result</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">
                  Placement (optional)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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

            {/* Submit */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmitClick}
                disabled={scoring.isSubmitting || !scoring.qualifying}
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
          <Card className="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95">
            <div>
              <h2 className="text-xl font-semibold">Score Confirmation</h2>
              <p className="text-sm text-muted-foreground">
                {classInfo.element} {classInfo.level}
              </p>
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
                    scoring.qualifying === 'EX' && 'text-red-600'
                  )}
                >
                  {placement ? `${scoring.qualifying} / ${placement}` : scoring.qualifying}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Points</span>
                <span className="font-bold text-rose-600">{totalPoints}</span>
              </div>
              {finishCallErrors > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Finish Call Errors</span>
                  <span className="font-semibold text-amber-500">{finishCallErrors}</span>
                </div>
              )}
            </div>

            {/* Area breakdown */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Area Breakdown</div>
              <div className="grid gap-2">
                {scoring.areas.map((area, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg text-sm"
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

registerScoresheet('AKC_SCENT_WORK_NATIONAL', 'live', AKCNationalsLiveScoresheet);
