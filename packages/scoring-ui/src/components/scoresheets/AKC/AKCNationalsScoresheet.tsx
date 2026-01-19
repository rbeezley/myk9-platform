/**
 * AKC Nationals Scent Work Scoresheet - Tailwind version
 *
 * Nationals scoring uses multiple areas (5) and points-based scoring.
 * +10 points per correct alert, -5 points per incorrect alert.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft, Plus, Minus, ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { logger } from '@myk9/core';
import { useStopwatch } from '../../../hooks/useStopwatch';

// Types
interface AKCNationalsScoresheetProps {
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
  points?: number;
  areas?: AreaScore[];
  notes?: string;
}

interface AreaScore {
  areaNumber: number;
  time: string;
  correct: number;
  incorrect: number;
  alerts: number;
}

type QualifyingResult = 'Q' | 'ABS' | 'EX' | '';

// Nationals has 5 areas
const NATIONALS_AREAS = [1, 2, 3, 4, 5];

/**
 * Parse smart time input (e.g., "12345" -> "1:23.45")
 */
function parseSmartTime(input: string): string {
  if (!input) return '';

  // If already formatted (contains colon), validate and return
  if (input.includes(':')) {
    return input;
  }

  // Parse digits only
  const digits = input.replace(/\D/g, '');
  if (digits.length === 0) return '';

  // Pad to 5 digits (M:SS.ss format)
  const padded = digits.padStart(5, '0');
  const minutes = parseInt(padded.slice(0, -4), 10);
  const seconds = padded.slice(-4, -2);
  const hundredths = padded.slice(-2);

  return `${minutes}:${seconds}.${hundredths}`;
}

/**
 * Calculate nationals points based on correct/incorrect alerts
 */
function calculateNationalsPoints(areas: AreaScore[]): number {
  let points = 0;
  for (const area of areas) {
    points += area.correct * 10; // 10 points per correct alert
    points -= area.incorrect * 5; // -5 points per incorrect alert
  }
  return Math.max(0, points);
}

/**
 * Parse max time string to milliseconds
 */
function parseMaxTime(timeStr: string): number {
  const parts = timeStr.split(':');
  const mins = parseInt(parts[0], 10) || 0;
  const secs = parseFloat(parts[1] || '0');
  return (mins * 60 + secs) * 1000;
}

/**
 * Format milliseconds to M:SS
 */
function formatMs(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const AKCNationalsScoresheet: React.FC<AKCNationalsScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state - 5 areas for Nationals
  const [areas, setAreas] = useState<AreaScore[]>(
    NATIONALS_AREAS.map((num) => ({
      areaNumber: num,
      time: '',
      correct: 0,
      incorrect: 0,
      alerts: 0,
    }))
  );
  const [currentArea, setCurrentArea] = useState(0);
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Calculate max time per area (total max time / 5)
  const totalMaxTime = classInfo.maxTime || '4:00';
  const areaMaxTimeMs = parseMaxTime(totalMaxTime) / 5;
  const areaMaxTimeStr = formatMs(areaMaxTimeMs);

  // Stopwatch for current area
  const stopwatch = useStopwatch({
    maxTime: areaMaxTimeStr,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      handleAreaUpdate(currentArea, 'time', formattedTime);
    },
  });

  // Handlers
  const handleAreaUpdate = useCallback(
    (index: number, field: keyof AreaScore, value: string | number) => {
      setAreas((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    []
  );

  const handleCorrectChange = (index: number, delta: number) => {
    const newValue = Math.max(0, areas[index].correct + delta);
    handleAreaUpdate(index, 'correct', newValue);
  };

  const handleIncorrectChange = (index: number, delta: number) => {
    const newValue = Math.max(0, areas[index].incorrect + delta);
    handleAreaUpdate(index, 'incorrect', newValue);
  };

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    handleAreaUpdate(currentArea, 'time', stopwatch.formatTime(stopwatch.time));
  }, [stopwatch, currentArea, handleAreaUpdate]);

  const handleNextArea = () => {
    if (currentArea < 4) {
      setCurrentArea(currentArea + 1);
      stopwatch.reset();
    }
  };

  const handlePrevArea = () => {
    if (currentArea > 0) {
      setCurrentArea(currentArea - 1);
      stopwatch.reset();
    }
  };

  const isAllAreasComplete = areas.every((area) => area.time && area.time !== '');
  const totalPoints = calculateNationalsPoints(areas);

  const handleSubmit = async () => {
    if (!qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const totalMs = areas.reduce((sum, area) => {
        if (!area.time) return sum;
        const parts = area.time.split(':');
        const mins = parseInt(parts[0], 10) || 0;
        const secs = parseFloat(parts[1] || '0');
        return sum + (mins * 60 + secs) * 1000;
      }, 0);

      await onSave({
        time: totalMs,
        faults: 0,
        qualification: qualifying,
        points: totalPoints,
        areas: areas,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas(
          NATIONALS_AREAS.map((num) => ({
            areaNumber: num,
            time: '',
            correct: 0,
            incorrect: 0,
            alerts: 0,
          }))
        );
        setCurrentArea(0);
        setQualifying('');
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

  // Warning message
  const warningMessage = stopwatch.getWarningMessage();
  const maxTimeMs = stopwatch.getMaxTimeMs();
  const remainingTimeMs = stopwatch.getRemainingTimeMs();
  const remainingSeconds = remainingTimeMs / 1000;

  // Ring color for countdown
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
                <ClipboardCheck className="h-5 w-5 text-rose-500" />
                AKC Nationals
              </h1>
              <p className="text-sm text-muted-foreground">{entry.element} {entry.level}</p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-rose-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-rose-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.callName}</div>
                  <div className="text-sm text-muted-foreground">{entry.breed}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handler}</div>
                </div>
              </div>
            </Card>

            {/* Area Navigation Tabs */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg">
              {NATIONALS_AREAS.map((num, index) => (
                <button
                  key={num}
                  className={cn(
                    "flex-1 py-2 text-sm font-medium rounded-md transition-colors",
                    index === currentArea
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                    areas[index].time && index !== currentArea && "text-green-600"
                  )}
                  onClick={() => setCurrentArea(index)}
                >
                  Area {num}
                </button>
              ))}
            </div>

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

              {/* Reset button */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-4 left-4"
                onClick={stopwatch.reset}
                disabled={stopwatch.isRunning}
                title={stopwatch.isRunning ? 'Reset disabled while timer is running' : 'Reset timer'}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>

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
                    <>Area {currentArea + 1} - Max: {areaMaxTimeStr}</>
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
                {warningMessage && (
                  <div className={cn(
                    "mt-4 py-2 px-4 rounded-full inline-block text-sm font-medium",
                    warningMessage === 'Time Expired'
                      ? "bg-red-500/10 text-red-600"
                      : "bg-amber-500/10 text-amber-600"
                  )}>
                    {warningMessage}
                  </div>
                )}
              </div>
            </Card>

            {/* Points Counters */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-sm text-muted-foreground mb-2">Correct Alerts</div>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => handleCorrectChange(currentArea, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-3xl font-bold text-green-600 w-12 text-center">
                      {areas[currentArea].correct}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => handleCorrectChange(currentArea, 1)}
                    >
                      <Plus className="h-4 w-4" />
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
                      className="h-10 w-10"
                      onClick={() => handleIncorrectChange(currentArea, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-3xl font-bold text-red-600 w-12 text-center">
                      {areas[currentArea].incorrect}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => handleIncorrectChange(currentArea, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="text-xs text-red-600 mt-1">-5 pts each</div>
                </div>
              </Card>
            </div>

            {/* Time Input for Current Area */}
            <Card className="p-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Area {currentArea + 1} Time
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={areas[currentArea].time || ''}
                  onChange={(e) => handleAreaUpdate(currentArea, 'time', e.target.value)}
                  onBlur={(e) => handleAreaUpdate(currentArea, 'time', parseSmartTime(e.target.value))}
                  placeholder="Type: 12345 or 1:23.45"
                  className="text-center text-xl font-mono pr-10"
                />
                {areas[currentArea].time && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => handleAreaUpdate(currentArea, 'time', '')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>

            {/* Area Navigation Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={handlePrevArea}
                disabled={currentArea === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous Area
              </Button>
              <Button
                variant="outline"
                className="flex-1 h-12"
                onClick={handleNextArea}
                disabled={currentArea === 4}
              >
                Next Area
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

            {/* Points Summary */}
            <Card className="p-4 bg-rose-500/10 border-rose-500/20">
              <div className="text-center">
                <div className="text-sm text-rose-600 font-medium">Total Points</div>
                <div className="text-4xl font-bold text-rose-600">{totalPoints}</div>
              </div>
            </Card>

            {/* Results Section */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={qualifying === 'Q' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'Q' && "bg-green-600 hover:bg-green-700")}
                  onClick={() => setQualifying('Q')}
                >
                  Qualified
                </Button>
                <Button
                  variant={qualifying === 'ABS' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'ABS' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => setQualifying('ABS')}
                >
                  Absent
                </Button>
                <Button
                  variant={qualifying === 'EX' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'EX' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => setQualifying('EX')}
                >
                  Excused
                </Button>
              </div>
            </Card>

            {/* Validation Warning */}
            {qualifying === 'Q' && !isAllAreasComplete && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                All 5 areas must have times for a Qualified score
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
                disabled={isSubmitting || !qualifying || (qualifying === 'Q' && !isAllAreasComplete)}
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
          <Card className="w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <h2 className="text-xl font-semibold">Score Confirmation</h2>
              <p className="text-sm text-muted-foreground">{entry.element} {entry.level}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-rose-600">#{entry.armband}</span>
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
                  (qualifying === 'ABS' || qualifying === 'EX') && "text-gray-500"
                )}>
                  {qualifying === 'Q' ? 'Qualified' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Total Points</span>
                <span className="font-bold text-rose-600">{totalPoints}</span>
              </div>
            </div>

            {/* Area breakdown */}
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground">Area Breakdown</div>
              <div className="grid gap-2">
                {areas.map((area) => (
                  <div key={area.areaNumber} className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg text-sm">
                    <span className="font-medium">Area {area.areaNumber}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono">{area.time || '--:--'}</span>
                      <span className="text-green-600">+{area.correct * 10}</span>
                      {area.incorrect > 0 && (
                        <span className="text-red-600">-{area.incorrect * 5}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
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

export default AKCNationalsScoresheet;
