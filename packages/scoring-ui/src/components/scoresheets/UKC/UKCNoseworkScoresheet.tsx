/**
 * UKC Nosework Scoresheet - Tailwind version
 *
 * Scoring system: Time + Faults
 * - Single timer for Novice/Advanced (single hide)
 * - Dual timer for Superior/Master/Elite (search time + element time)
 */

import React, { useState, useCallback } from 'react';
import { X, ArrowLeft, Search } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { logger } from '@myk9/core';
import { useStopwatch } from '../../../hooks/useStopwatch';
import type { ResolvedClassRules } from '../../../types/resolvedClassRules';

// Types
interface UKCNoseworkScoresheetProps {
  entry: {
    entryId: string;
    armband: number;
    callName: string;
    breed: string;
    handler: string;
    element?: string;
    level?: string;
  };
  classInfo: {
    name: string;
    maxTime: string;
    level?: string;
  };
  rules?: ResolvedClassRules;
  onSave: (result: ScoringResult) => Promise<void>;
  onNavigate: (direction: 'prev' | 'next') => void;
  onBack: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

interface ScoringResult {
  time: number;
  faults: number;
  qualification: string;
  notes?: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

/** @deprecated Use rules.timerMode === 'dual' from ResolvedClassRules. Remove after backfill migration verifies all classes have rule fields. */
function isDualTimerLevel(level?: string): boolean {
  if (!level) return false;
  const normalizedLevel = level.toLowerCase();
  return ['superior', 'master', 'elite'].includes(normalizedLevel);
}

function parseSmartTime(input: string): string {
  if (!input) return '';
  if (input.includes(':')) return input;
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';
  const padded = digits.padStart(5, '0');
  const minutes = parseInt(padded.slice(0, -4), 10);
  const seconds = padded.slice(-4, -2);
  const hundredths = padded.slice(-2);
  return `${minutes}:${seconds}.${hundredths}`;
}

function parseTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return (mins * 60 + secs) * 1000;
}

function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = (totalSeconds % 60).toFixed(2);
  return `${minutes}:${seconds.padStart(5, '0')}`;
}

export const UKCNoseworkScoresheet: React.FC<UKCNoseworkScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Use rules prop when available, fall back to level-based logic
  const dualTimerMode = rules ? rules.timerMode === 'dual' : isDualTimerLevel(classInfo.level);

  const [searchTime, setSearchTime] = useState('');
  const [elementTime, setElementTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      setSearchTime(formattedTime);
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    },
  });

  const [elementTimerRunning, setElementTimerRunning] = useState(false);
  const [elementTimerMs, setElementTimerMs] = useState(0);

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    setSearchTime(stopwatch.formatTime(stopwatch.time));
    if (dualTimerMode) {
      setElementTimerRunning(false);
      setElementTime(formatMs(elementTimerMs));
    }
  }, [stopwatch, dualTimerMode, elementTimerMs]);

  const handleDualStart = useCallback(() => {
    stopwatch.start();
    setElementTimerRunning(true);
  }, [stopwatch]);

  const handleDualPause = useCallback(() => {
    stopwatch.pause();
  }, [stopwatch]);

  const handleDualResume = useCallback(() => {
    stopwatch.start();
  }, [stopwatch]);

  const handleDualFinish = useCallback(() => {
    stopwatch.pause();
    setElementTimerRunning(false);
    setSearchTime(stopwatch.formatTime(stopwatch.time));
    setElementTime(formatMs(elementTimerMs));
  }, [stopwatch, elementTimerMs]);

  React.useEffect(() => {
    if (!elementTimerRunning) return;
    const interval = setInterval(() => {
      setElementTimerMs((prev) => prev + 10);
    }, 10);
    return () => clearInterval(interval);
  }, [elementTimerRunning]);

  const isTimeComplete = dualTimerMode
    ? searchTime !== '' && elementTime !== ''
    : searchTime !== '';

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeMs = parseTimeToMs(searchTime);
      await onSave({
        time: timeMs,
        faults: faultCount,
        qualification: qualifying,
        notes: nonQualifyingReason || undefined,
      });
      setShowConfirmation(false);
      if (hasNext) {
        setSearchTime('');
        setElementTime('');
        setQualifying('');
        setNonQualifyingReason('');
        setFaultCount(0);
        setElementTimerMs(0);
        stopwatch.reset();
        onNavigate('next');
      } else {
        onBack();
      }
    } catch (error) {
      logger.error('Failed to save score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = dualTimerMode
    ? Math.max(0, maxTimeMs - elementTimerMs)
    : stopwatch.getRemainingTimeMs();
  const remainingSeconds = remainingTimeMs / 1000;

  const getRingColor = (): string => {
    if (remainingSeconds <= 0) return '#ef4444';
    if (remainingSeconds <= 30) return '#ef4444';
    if (remainingSeconds <= 40) return '#f59e0b';
    return '#22c55e';
  };

  const cornerRingSize = 40;
  const strokeWidth = 4;
  const cornerRadius = (cornerRingSize - strokeWidth) / 2;
  const cornerCircumference = 2 * Math.PI * cornerRadius;
  const progress = maxTimeMs > 0 ? Math.max(0, remainingTimeMs / maxTimeMs) : 1;
  const cornerStrokeDashoffset = cornerCircumference * (1 - progress);

  return (
    <>
      <div className="min-h-screen bg-background">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold flex items-center gap-2">
                <Search className="h-5 w-5 text-blue-500" />
                UKC Nosework
              </h1>
              <p className="text-sm text-muted-foreground">
                {entry.element} {entry.level}
              </p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-blue-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.callName}</div>
                  <div className="text-sm text-muted-foreground">{entry.breed}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handler}</div>
                </div>
              </div>
            </Card>

            {/* Timer Section */}
            <Card className="p-6 relative overflow-hidden">
              {/* Countdown ring */}
              {maxTimeMs > 0 && (
                <svg
                  className="absolute top-3 right-3"
                  width={cornerRingSize}
                  height={cornerRingSize}
                  viewBox={`0 0 ${cornerRingSize} ${cornerRingSize}`}
                >
                  <circle cx={cornerRingSize / 2} cy={cornerRingSize / 2} r={cornerRadius}
                    fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
                  <circle cx={cornerRingSize / 2} cy={cornerRingSize / 2} r={cornerRadius}
                    fill="none" stroke={getRingColor()} strokeWidth={strokeWidth} strokeLinecap="round"
                    strokeDasharray={cornerCircumference} strokeDashoffset={cornerStrokeDashoffset}
                    transform={`rotate(-90 ${cornerRingSize / 2} ${cornerRingSize / 2})`} />
                </svg>
              )}

              {/* Dual timer: Element time row */}
              {dualTimerMode && (
                <div className="flex items-center justify-between mb-4 p-3 bg-purple-500/10 rounded-lg">
                  <span className="text-sm font-medium text-purple-600">Element Time:</span>
                  <span className={cn(
                    "font-mono text-xl font-bold",
                    elementTimerRunning ? "text-purple-600" : "text-muted-foreground"
                  )}>
                    {formatMs(elementTimerMs)}
                  </span>
                  {(stopwatch.isRunning || elementTimerRunning) && (
                    <Button size="sm" variant="secondary" onClick={handleDualFinish}>
                      Finish
                    </Button>
                  )}
                </div>
              )}

              {/* Main timer display */}
              <div className="text-center">
                <div className={cn(
                  "text-5xl font-mono font-bold tracking-tight",
                  stopwatch.shouldShow30SecondWarning() && "text-amber-500",
                  stopwatch.isTimeExpired() && "text-destructive"
                )}>
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="text-sm text-muted-foreground mt-2">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.getRemainingTime()}</>
                  ) : (
                    <>Max Time: {classInfo.maxTime}</>
                  )}
                </div>

                <div className="mt-6 flex justify-center gap-3">
                  {dualTimerMode ? (
                    <>
                      {!stopwatch.isRunning && !elementTimerRunning && stopwatch.time === 0 ? (
                        <Button size="lg" className="w-32 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                          onClick={handleDualStart}>Start</Button>
                      ) : stopwatch.isRunning ? (
                        <Button size="lg" variant="secondary" className="h-12 text-lg font-semibold"
                          onClick={handleDualPause}>Pause Search</Button>
                      ) : elementTimerRunning ? (
                        <Button size="lg" variant="secondary" className="h-12 text-lg font-semibold"
                          onClick={handleDualResume}>Resume Search</Button>
                      ) : (
                        <Button size="lg" variant="outline" className="h-12"
                          onClick={() => { stopwatch.reset(); setElementTimerMs(0); }}>Reset</Button>
                      )}
                    </>
                  ) : (
                    <>
                      {stopwatch.isRunning ? (
                        <Button size="lg" variant="destructive" className="w-32 h-12 text-lg font-semibold"
                          onClick={handleStopTimer}>Stop</Button>
                      ) : stopwatch.time > 0 ? (
                        stopwatch.isTimeExpired() ? (
                          <Button size="lg" variant="outline" className="w-32 h-12 text-lg font-semibold"
                            onClick={stopwatch.reset}>Reset</Button>
                        ) : (
                          <Button size="lg" variant="secondary" className="w-32 h-12 text-lg font-semibold"
                            onClick={stopwatch.start}>Resume</Button>
                        )
                      ) : (
                        <Button size="lg" className="w-32 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                          onClick={stopwatch.start}>Start</Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </Card>

            {/* Time Inputs */}
            <Card className="p-4 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Search Time</label>
                <div className="relative">
                  <Input type="text" value={searchTime}
                    onChange={(e) => setSearchTime(e.target.value)}
                    onBlur={(e) => setSearchTime(parseSmartTime(e.target.value))}
                    placeholder="Type: 12345 or 1:23.45" className="text-center text-xl font-mono pr-10" />
                  {searchTime && (
                    <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setSearchTime('')}><X className="h-4 w-4" /></button>
                  )}
                </div>
              </div>

              {dualTimerMode && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Element Time</label>
                  <div className="relative">
                    <Input type="text" value={elementTime}
                      onChange={(e) => setElementTime(e.target.value)}
                      onBlur={(e) => setElementTime(parseSmartTime(e.target.value))}
                      placeholder="Type: 12345 or 1:23.45" className="text-center text-xl font-mono pr-10" />
                    {elementTime && (
                      <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setElementTime('')}><X className="h-4 w-4" /></button>
                    )}
                  </div>
                </div>
              )}
            </Card>

            {/* Faults */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">Faults:</span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" onClick={() => setFaultCount(Math.max(0, faultCount - 1))}>-</Button>
                  <span className="text-xl font-bold w-8 text-center">{faultCount}</span>
                  <Button variant="outline" size="icon" onClick={() => setFaultCount(faultCount + 1)}>+</Button>
                </div>
              </div>
            </Card>

            {/* Results Section */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button variant={qualifying === 'Q' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'Q' && "bg-green-600 hover:bg-green-700")}
                  onClick={() => { setQualifying('Q'); setNonQualifyingReason(''); }}>Qualified</Button>
                <Button variant={qualifying === 'NQ' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'NQ' && "bg-amber-500 hover:bg-amber-600")}
                  onClick={() => { setQualifying('NQ'); setNonQualifyingReason('Fault Limit'); }}>NQ</Button>
                <Button variant={qualifying === 'ABS' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'ABS' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => { setQualifying('ABS'); setNonQualifyingReason('Absent'); }}>Absent</Button>
                <Button variant={qualifying === 'EX' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'EX' && "bg-red-600 hover:bg-red-700")}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Excused'); }}>Excused</Button>
              </div>

              {qualifying === 'NQ' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">NQ Reason:</label>
                  <select value={nonQualifyingReason} onChange={(e) => setNonQualifyingReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background">
                    <option value="Fault Limit">Fault Limit</option>
                    <option value="Max Time">Max Time</option>
                    <option value="False Alert">False Alert</option>
                    <option value="Handler Error">Handler Error</option>
                  </select>
                </div>
              )}
            </Card>

            {qualifying === 'Q' && !isTimeComplete && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                {dualTimerMode ? 'Both times' : 'Time'} must be entered for a Qualified score
              </div>
            )}

            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>Cancel</Button>
              <Button className="flex-1 h-12" onClick={handleSubmit}
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isTimeComplete)}>
                {isSubmitting ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmation && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Score Confirmation</h2>
              <p className="text-sm text-muted-foreground">{entry.element} {entry.level}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-blue-600">#{entry.armband}</span>
              </div>
              <div>
                <div className="font-medium">{entry.callName}</div>
                <div className="text-sm text-muted-foreground">{entry.breed}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Result</span>
                <span className={cn("font-semibold",
                  qualifying === 'Q' && "text-green-600",
                  qualifying === 'NQ' && "text-amber-500",
                  qualifying === 'EX' && "text-red-600")}>
                  {qualifying === 'Q' ? 'Qualified' : qualifying === 'NQ' ? 'NQ' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Search Time</span>
                <span className="font-mono font-semibold">{searchTime || '0:00.00'}</span>
              </div>
              {dualTimerMode && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Element Time</span>
                  <span className="font-mono font-semibold">{elementTime || '0:00.00'}</span>
                </div>
              )}
              {faultCount > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Faults</span>
                  <span className="font-semibold text-amber-500">{faultCount}</span>
                </div>
              )}
              {nonQualifyingReason && qualifying === 'NQ' && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">NQ Reason</span>
                  <span className="font-medium">{nonQualifyingReason}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmation(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleConfirmSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

export default UKCNoseworkScoresheet;
