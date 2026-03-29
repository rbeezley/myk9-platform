/**
 * AKC Scent Work Live Scoresheet (Judge View)
 *
 * Touch-friendly in-ring scoresheet with stopwatch timer,
 * countdown ring, and large result chips.
 *
 * Uses useScoresheetScoring for state and useStopwatch for timer.
 */

import React, { useState } from 'react';
import { ArrowLeft, ClipboardCheck, X, RotateCcw } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types/scoreData';
import type { ExtendedResult } from '../../../types/scoreData';

/** Lookup map for result display text in confirmation dialog */
const RESULT_LABELS: Record<string, string> = {
  Q: 'Qualified',
  NQ: 'NQ',
  ABS: 'Absent',
  EX: 'Excused',
};

/** Shared base classes for pill-shaped timer control buttons (Start/Stop/Resume) */
const timerButtonBase =
  'rounded-full border-0 text-white text-[1.375rem] font-semibold cursor-pointer transition-all duration-200 shadow-lg';

/** Shared base classes for submit/cancel action buttons */
const actionButtonBase =
  'flex-1 h-14 rounded-xl border-0 text-white text-lg font-semibold cursor-pointer transition-all duration-200';

const RESULT_OPTIONS: { value: ExtendedResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    activeClass: 'bg-blue-600 hover:bg-blue-700 border-blue-600 shadow-lg shadow-blue-600/20',
  },
  {
    value: 'NQ',
    label: 'NQ',
    activeClass: 'bg-red-600 hover:bg-red-700 border-red-600 shadow-lg shadow-red-600/20',
  },
  {
    value: 'ABS',
    label: 'Absent',
    activeClass:
      'bg-purple-600 hover:bg-purple-700 border-purple-600 shadow-lg shadow-purple-600/20',
  },
  {
    value: 'EX',
    label: 'Excused',
    activeClass: 'bg-red-700 hover:bg-red-800 border-red-700 shadow-lg shadow-red-700/20',
  },
];

const NQ_REASONS = [
  'Incorrect Call',
  'Max Time',
  'Point to Hide',
  'Harsh Correction',
  'Significant Disruption',
];

export const AKCScentWorkLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onWarningChime,
  onVoiceAnnouncement,
  enableVoiceAnnouncements,
}) => {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const maxTimeStr = `${Math.floor(rules.maxTimeSeconds / 60)}:${String(rules.maxTimeSeconds % 60).padStart(2, '0')}`;

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const stopwatch = useStopwatch({
    maxTime: maxTimeStr,
    level: classInfo.level,
    enableVoiceAnnouncements,
    onWarningChime,
    onVoiceAnnouncement,
    onTimeExpired: formattedTime => {
      scoring.handleAreaUpdate(0, 'time', formattedTime);
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('Max Time');
    },
  });

  const handleStopTimer = () => {
    stopwatch.pause();
    if (scoring.areas.length === 1) {
      scoring.handleAreaUpdate(0, 'time', stopwatch.formatTime(stopwatch.time));
    }
  };

  const handleResultSelect = (value: ExtendedResult) => {
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
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
  const remainingSeconds = remainingTimeMs / 1000;

  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444';
    if (remainingSeconds <= 30) return '#ef4444';
    if (remainingSeconds <= 40) return '#f59e0b';
    return '#22c55e';
  };

  const progressPct = maxTimeMs > 0 ? Math.max(0, remainingTimeMs / maxTimeMs) * 100 : 100;

  // Build header title from trial date + number, fallback to sport name
  const headerTitle = (() => {
    if (!classInfo.trialDate) return 'AKC Scent Work';
    const formatted = new Date(classInfo.trialDate + 'T00:00:00').toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return classInfo.trialNumber ? `${formatted} — Trial ${classInfo.trialNumber}` : formatted;
  })();

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
                <ClipboardCheck className="h-5 w-5 text-primary" />
                {headerTitle}
              </h1>
              <p className="text-sm text-muted-foreground">
                {classInfo.element}
                {classInfo.level && classInfo.level !== 'Unknown' ? ` ${classInfo.level}` : ''}
              </p>
            </div>
          </header>

          <div className="p-4 space-y-3">
            {/* Dog Info Card - matches myK9Q layout */}
            <Card className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-md shadow-blue-500/30">
                  <span className="text-xl font-bold text-white">{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="text-lg font-semibold truncate leading-tight">
                    {entry.dogName}
                  </div>
                  <div className="text-[13px] text-muted-foreground">
                    Handler: {entry.handlerName}
                  </div>
                </div>
              </div>
            </Card>

            {/* Timer Card */}
            <Card className="relative p-6 overflow-hidden">
              {/* Reset button - top right corner */}
              <button
                className="absolute top-3 right-3 w-10 h-10 rounded-full bg-muted border-0 text-muted-foreground flex items-center justify-center cursor-pointer transition-all duration-200 hover:enabled:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                onClick={stopwatch.reset}
                disabled={stopwatch.isRunning}
                title={
                  stopwatch.isRunning ? 'Reset disabled while timer is running' : 'Reset timer'
                }
              >
                <RotateCcw className="h-5 w-5" />
              </button>

              <div className="text-center">
                <div
                  className={cn(
                    'text-5xl font-bold text-foreground tabular-nums tracking-tight transition-colors duration-300',
                    stopwatch.shouldShow30SecondWarning() && 'text-amber-400',
                    stopwatch.isTimeExpired() && 'text-red-500 animate-pulse'
                  )}
                >
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="text-base text-muted-foreground mt-2">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.getRemainingTime()}</>
                  ) : (
                    <>Max Time: {maxTimeStr}</>
                  )}
                </div>

                {/* Time remaining progress bar */}
                {maxTimeMs > 0 && (
                  <div className="w-full h-1.5 rounded-full bg-muted mt-3 mb-4 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300 ease-linear"
                      style={{ width: `${progressPct}%`, backgroundColor: getRingColor() }}
                    />
                  </div>
                )}

                {/* Pill-shaped control buttons matching myK9Q */}
                <div className="flex justify-center">
                  {stopwatch.isRunning ? (
                    <button
                      className={cn(
                        timerButtonBase,
                        'w-48 h-[72px] bg-red-500 hover:brightness-110 hover:scale-105 active:scale-95'
                      )}
                      onClick={handleStopTimer}
                      data-testid="timer-stop"
                    >
                      Stop
                    </button>
                  ) : stopwatch.time > 0 ? (
                    <button
                      className={cn(
                        timerButtonBase,
                        'w-48 h-[72px] bg-teal-500 hover:brightness-110 hover:scale-105 active:scale-95'
                      )}
                      onClick={stopwatch.start}
                    >
                      Resume
                    </button>
                  ) : (
                    <button
                      className={cn(
                        timerButtonBase,
                        'w-48 h-[72px] bg-teal-500 hover:brightness-110 hover:scale-105 active:scale-95'
                      )}
                      onClick={stopwatch.start}
                      data-testid="timer-start"
                    >
                      Start
                    </button>
                  )}
                </div>
              </div>
            </Card>

            {/* Warning */}
            {warningMessage && (
              <div
                className={cn(
                  'px-4 py-3 rounded-lg text-center font-semibold text-sm border',
                  warningMessage === 'Time Expired'
                    ? 'bg-red-500/10 border-red-500 text-red-600'
                    : 'bg-amber-400/10 border-amber-400 text-amber-500'
                )}
              >
                {warningMessage}
              </div>
            )}

            {/* Area Times - compact card style */}
            {scoring.areas.map((area, index) => (
              <Card key={index} className="p-3">
                <div className="flex items-center justify-center gap-3">
                  {scoring.areas.length > 1 && (
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex-shrink-0">
                      {area.areaName}
                    </span>
                  )}
                  <div className="relative flex-1 max-w-48">
                    <Input
                      type="text"
                      value={area.time}
                      onChange={e => scoring.handleAreaUpdate(index, 'time', e.target.value)}
                      placeholder="0:00.00"
                      className="text-center text-base font-mono font-medium pr-8 h-12 rounded-xl border-2 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      aria-label={`${area.areaName} time`}
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        onClick={() => scoring.handleAreaUpdate(index, 'time', '')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    Max: {maxTimeStr}
                  </span>
                </div>
              </Card>
            ))}

            {/* Result Choice Chips - pill-shaped, matching myK9Q */}
            <Card className="p-4 space-y-4">
              <div className="flex gap-1.5 justify-center">
                {RESULT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={cn(
                      'px-3 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all duration-200',
                      'hover:-translate-y-px active:scale-[0.98]',
                      scoring.qualifying === opt.value
                        ? cn('text-white -translate-y-px', opt.activeClass)
                        : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                    onClick={() => handleResultSelect(opt.value)}
                    data-testid={`result-${opt.value}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Fault Counter - circular buttons matching myK9Q */}
              {scoring.qualifying === 'Q' && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <h3 className="text-base font-semibold text-center">Faults Count</h3>
                  <div className="flex items-center justify-center gap-5">
                    <button
                      className="w-11 h-11 rounded-full border-2 border-border bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-px disabled:opacity-40 disabled:cursor-not-allowed"
                      onClick={() => scoring.setFaultCount(Math.max(0, scoring.faultCount - 1))}
                      disabled={scoring.faultCount === 0}
                    >
                      -
                    </button>
                    <span className="text-2xl font-bold w-10 text-center tabular-nums">
                      {scoring.faultCount}
                    </span>
                    <button
                      className="w-11 h-11 rounded-full border-2 border-border bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center cursor-pointer transition-all duration-200 hover:brightness-110 hover:-translate-y-px"
                      onClick={() => scoring.setFaultCount(scoring.faultCount + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* NQ Reason - choice chips matching myK9Q */}
              {scoring.qualifying === 'NQ' && (
                <div className="flex flex-col items-center gap-3 py-2">
                  <h3 className="text-base font-semibold text-center">Non-Qualifying Reason</h3>
                  <div className="flex gap-2 justify-center flex-wrap">
                    {NQ_REASONS.map(reason => (
                      <button
                        key={reason}
                        className={cn(
                          'px-4 py-2 rounded-full border-2 text-sm font-semibold cursor-pointer transition-all duration-200',
                          'hover:-translate-y-px active:scale-[0.98]',
                          scoring.nonQualifyingReason === reason
                            ? 'bg-primary text-white border-primary shadow-md'
                            : 'bg-muted border-border text-muted-foreground hover:bg-accent hover:border-primary hover:text-foreground'
                        )}
                        onClick={() => scoring.setNonQualifyingReason(reason)}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {/* Submit */}
            <div className="flex gap-3 pt-1 pb-8">
              <button
                className={cn(
                  actionButtonBase,
                  'bg-gray-500/80 hover:bg-gray-500 hover:scale-[1.02] active:scale-[0.98]'
                )}
                onClick={onBack}
              >
                Cancel
              </button>
              <button
                className={cn(
                  actionButtonBase,
                  'bg-primary hover:brightness-110 hover:scale-[1.02] active:scale-[0.98]',
                  (scoring.isSubmitting || !scoring.qualifying) &&
                    'opacity-40 cursor-not-allowed hover:scale-100 hover:brightness-100'
                )}
                onClick={handleSubmitClick}
                disabled={scoring.isSubmitting || !scoring.qualifying}
                data-testid="submit-btn"
              >
                {scoring.isSubmitting ? 'Saving...' : 'Save'}
              </button>
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
                {classInfo.element}
                {classInfo.level && classInfo.level !== 'Unknown' ? ` ${classInfo.level}` : ''}
              </p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-sm">
                <span className="text-sm font-bold text-white">{entry.armband}</span>
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
                    scoring.qualifying === 'Q' && 'text-blue-600',
                    scoring.qualifying === 'NQ' && 'text-red-600',
                    scoring.qualifying === 'ABS' && 'text-purple-600',
                    scoring.qualifying === 'EX' && 'text-red-700'
                  )}
                >
                  {RESULT_LABELS[scoring.qualifying ?? ''] ?? scoring.qualifying}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Time</span>
                <span className="font-mono font-semibold">{scoring.calculateTotalTime()}</span>
              </div>
              {scoring.faultCount > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Faults</span>
                  <span className="font-semibold text-red-500">{scoring.faultCount}</span>
                </div>
              )}
              {scoring.nonQualifyingReason &&
                (scoring.qualifying === 'NQ' || scoring.qualifying === 'EX') && (
                  <div className="flex justify-between py-2 border-b border-border">
                    <span className="text-muted-foreground">
                      {scoring.qualifying === 'EX' ? 'Excused' : 'NQ'} Reason
                    </span>
                    <span className="font-semibold">{scoring.nonQualifyingReason}</span>
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

registerScoresheet('AKC_SCENT_WORK', 'live', AKCScentWorkLiveScoresheet);
