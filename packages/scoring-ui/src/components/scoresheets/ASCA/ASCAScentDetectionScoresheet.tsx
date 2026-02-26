/**
 * ASCA Scent Detection Scoresheet - Tailwind version
 *
 * Australian Shepherd Club of America Scent Detection scoresheet.
 * Similar to AKC Scent Work with timer and area inputs.
 */

import React, { useState, useCallback, useMemo } from 'react';
import { X, ClipboardCheck, ArrowLeft, Minus, Plus } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { logger } from '@myk9/core';
import { useStopwatch } from '../../../hooks/useStopwatch';
import type { ResolvedClassRules } from '../../../types/resolvedClassRules';

// Types
interface ASCAScentDetectionScoresheetProps {
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
    maxTime?: string;
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

interface AreaTime {
  time: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

/**
 * Determine area count based on level
 */
function getAreaCount(level?: string): number {
  if (!level) return 1;
  const normalizedLevel = level.toLowerCase();
  if (normalizedLevel.includes('excellent') || normalizedLevel.includes('elite')) return 3;
  if (normalizedLevel.includes('advanced') || normalizedLevel.includes('open')) return 2;
  return 1;
}

/**
 * Parse smart time input (e.g., "12345" -> "1:23.45")
 */
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

/**
 * Parse time string to milliseconds
 */
function parseTimeToMs(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return (mins * 60 + secs) * 1000;
}

export const ASCAScentDetectionScoresheet: React.FC<ASCAScentDetectionScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Determine number of areas — use rules prop when available, fall back to level-based logic
  const areaCount = useMemo(
    () => rules?.areaCount ?? getAreaCount(classInfo.level),
    [rules?.areaCount, classInfo.level],
  );

  // Scoring state
  const [areas, setAreas] = useState<AreaTime[]>(
    Array(areaCount).fill(null).map(() => ({ time: '' }))
  );
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Timer
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime || '3:00.00',
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      // Auto-fill first empty area time
      const emptyIndex = areas.findIndex(a => !a.time);
      if (emptyIndex >= 0) {
        handleAreaTimeChange(emptyIndex, formattedTime);
      }
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    },
  });

  const handleAreaTimeChange = useCallback((index: number, time: string) => {
    setAreas(prev => {
      const newAreas = [...prev];
      newAreas[index] = { time };
      return newAreas;
    });
  }, []);

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    // For single-area classes, auto-fill time
    if (areaCount === 1 && !areas[0].time) {
      handleAreaTimeChange(0, stopwatch.formatTime(stopwatch.time));
    }
  }, [stopwatch, areaCount, areas, handleAreaTimeChange]);

  const recordTimeForArea = useCallback((index: number) => {
    handleAreaTimeChange(index, stopwatch.formatTime(stopwatch.time));
    stopwatch.reset();
  }, [stopwatch, handleAreaTimeChange]);

  const getNextEmptyAreaIndex = useCallback((): number => {
    return areas.findIndex(area => !area.time);
  }, [areas]);

  const calculateTotalTime = useCallback(() => {
    return areas.reduce((total, area) => total + parseTimeToMs(area.time), 0);
  }, [areas]);

  const isAllTimesComplete = areas.every(area => area.time && area.time !== '');

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      await onSave({
        time: calculateTotalTime(),
        faults: faultCount,
        qualification: qualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas(Array(areaCount).fill(null).map(() => ({ time: '' })));
        setQualifying('');
        setNonQualifyingReason('');
        setFaultCount(0);
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

  // Progress ring calculations
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
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
                <ClipboardCheck className="h-5 w-5 text-teal-500" />
                ASCA Scent Detection
              </h1>
              <p className="text-sm text-muted-foreground">{entry.element} {entry.level}</p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-teal-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-teal-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.callName}</div>
                  <div className="text-sm text-muted-foreground">{entry.breed}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handler}</div>
                </div>
              </div>
            </Card>

            {/* Timer Section */}
            <Card className="p-6 relative">
              {/* Countdown ring */}
              {maxTimeMs > 0 && (
                <svg
                  className="absolute top-4 right-4"
                  width={cornerRingSize}
                  height={cornerRingSize}
                  viewBox={`0 0 ${cornerRingSize} ${cornerRingSize}`}
                >
                  <circle
                    cx={cornerRingSize / 2}
                    cy={cornerRingSize / 2}
                    r={cornerRadius}
                    fill="none"
                    stroke="currentColor"
                    className="text-muted/20"
                    strokeWidth={strokeWidth}
                  />
                  <circle
                    cx={cornerRingSize / 2}
                    cy={cornerRingSize / 2}
                    r={cornerRadius}
                    fill="none"
                    stroke={getRingColor()}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={cornerCircumference}
                    strokeDashoffset={cornerStrokeDashoffset}
                    transform={`rotate(-90 ${cornerRingSize / 2} ${cornerRingSize / 2})`}
                  />
                </svg>
              )}

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
                    <>Max Time: {classInfo.maxTime || '3:00.00'}</>
                  )}
                </div>

                <div className="flex justify-center gap-3 mt-6">
                  {stopwatch.isRunning ? (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-28 h-12 text-lg font-semibold"
                      onClick={handleStopTimer}
                    >
                      Stop
                    </Button>
                  ) : stopwatch.time > 0 ? (
                    stopwatch.isTimeExpired() ? (
                      <Button
                        size="lg"
                        variant="secondary"
                        className="w-28 h-12 text-lg font-semibold"
                        onClick={stopwatch.reset}
                      >
                        Reset
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        variant="secondary"
                        className="w-28 h-12 text-lg font-semibold"
                        onClick={stopwatch.start}
                      >
                        Resume
                      </Button>
                    )
                  ) : (
                    <Button
                      size="lg"
                      className="w-28 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                      onClick={stopwatch.start}
                    >
                      Start
                    </Button>
                  )}
                </div>

                {/* Warning message */}
                {stopwatch.getWarningMessage() && (
                  <div className={cn(
                    "mt-4 py-2 px-4 rounded-full inline-block text-sm font-medium",
                    stopwatch.getWarningMessage() === 'Time Expired'
                      ? "bg-red-500/10 text-red-600"
                      : "bg-amber-500/10 text-amber-600"
                  )}>
                    {stopwatch.getWarningMessage()}
                  </div>
                )}
              </div>
            </Card>

            {/* Time Inputs */}
            {areas.map((area, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-2">
                  {areaCount > 1 && (
                    <>
                      {!area.time ? (
                        <Button
                          variant={getNextEmptyAreaIndex() === index && stopwatch.time > 0 && !stopwatch.isRunning ? 'default' : 'outline'}
                          className={cn(
                            "w-full mb-2",
                            getNextEmptyAreaIndex() === index && stopwatch.time > 0 && !stopwatch.isRunning && "bg-teal-600 hover:bg-teal-700"
                          )}
                          onClick={() => recordTimeForArea(index)}
                        >
                          Record Area {index + 1}
                        </Button>
                      ) : (
                        <div className="inline-flex items-center px-3 py-1 rounded-full bg-teal-500/10 text-teal-600 text-sm font-medium mb-2">
                          Area {index + 1}
                        </div>
                      )}
                    </>
                  )}
                  {areaCount === 1 && (
                    <label className="text-sm font-medium text-muted-foreground block">Search Time</label>
                  )}
                  <div className="relative">
                    <Input
                      type="text"
                      value={area.time || ''}
                      onChange={(e) => handleAreaTimeChange(index, e.target.value)}
                      onBlur={(e) => handleAreaTimeChange(index, parseSmartTime(e.target.value))}
                      placeholder="Type: 12345 or 1:23.45"
                      className="text-center text-xl font-mono pr-10"
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => handleAreaTimeChange(index, '')}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {/* Faults */}
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Faults</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setFaultCount(Math.max(0, faultCount - 1))}
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <span className="text-xl font-bold w-8 text-center">{faultCount}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setFaultCount(faultCount + 1)}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>

            {/* Results Section */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  variant={qualifying === 'Q' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'Q' && "bg-green-600 hover:bg-green-700")}
                  onClick={() => { setQualifying('Q'); setNonQualifyingReason(''); }}
                >
                  Qualified
                </Button>
                <Button
                  variant={qualifying === 'NQ' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'NQ' && "bg-amber-500 hover:bg-amber-600")}
                  onClick={() => { setQualifying('NQ'); setNonQualifyingReason('Incorrect Call'); }}
                >
                  NQ
                </Button>
                <Button
                  variant={qualifying === 'ABS' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'ABS' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => { setQualifying('ABS'); setNonQualifyingReason('Absent'); }}
                >
                  Absent
                </Button>
                <Button
                  variant={qualifying === 'EX' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'EX' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Excused'); }}
                >
                  Excused
                </Button>
              </div>

              {qualifying === 'NQ' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">NQ Reason:</label>
                  <select
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background"
                  >
                    <option value="Incorrect Call">Incorrect Call</option>
                    <option value="Max Time">Max Time</option>
                    <option value="False Alert">False Alert</option>
                    <option value="Handler Error">Handler Error</option>
                  </select>
                </div>
              )}
            </Card>

            {/* Validation Warning */}
            {qualifying === 'Q' && !isAllTimesComplete && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                {areaCount > 1 ? 'All area times' : 'Time'} must be entered for a Qualified score
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmit}
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isAllTimesComplete)}
              >
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
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-teal-600">#{entry.armband}</span>
              </div>
              <div>
                <div className="font-medium">{entry.callName}</div>
                <div className="text-sm text-muted-foreground">{entry.breed}</div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Result</span>
                <span className={cn(
                  "font-semibold",
                  qualifying === 'Q' && "text-green-600",
                  qualifying === 'NQ' && "text-amber-500",
                  (qualifying === 'ABS' || qualifying === 'EX') && "text-gray-500"
                )}>
                  {qualifying === 'Q' ? 'Qualified' : qualifying === 'NQ' ? 'NQ' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                </span>
              </div>
              {areas.map((area, index) => (
                <div key={index} className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{areaCount > 1 ? `Area ${index + 1}` : 'Search Time'}</span>
                  <span className="font-mono font-semibold">{area.time || '0:00.00'}</span>
                </div>
              ))}
              {faultCount > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Faults</span>
                  <span className="font-semibold text-red-600">{faultCount}</span>
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
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmation(false)}>
                Cancel
              </Button>
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

export default ASCAScentDetectionScoresheet;
