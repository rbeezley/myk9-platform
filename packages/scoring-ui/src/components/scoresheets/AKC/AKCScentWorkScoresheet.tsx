/**
 * AKC Scent Work Scoresheet
 *
 * Tailwind-based scoresheet component using @myk9/ui components.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { logger } from '@myk9/core';
import { useStopwatch } from '../../../hooks/useStopwatch';

// Types
interface AKCScentWorkScoresheetProps {
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
  notes?: string;
}

interface AreaScore {
  time: string;
  areaName: string;
}

type QualifyingResult = 'Q' | 'NQ' | 'ABS' | 'EX' | '';

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

export const AKCScentWorkScoresheet: React.FC<AKCScentWorkScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state
  const [areas, setAreas] = useState<AreaScore[]>([{ time: '', areaName: 'Search' }]);
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [faultCount, setFaultCount] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Stopwatch
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime,
    level: classInfo.level,
    onTimeExpired: (formattedTime) => {
      handleAreaUpdate(0, 'time', formattedTime);
      setQualifying('NQ');
      setNonQualifyingReason('Max Time');
    }
  });

  // Handlers
  const handleAreaUpdate = useCallback((index: number, field: 'time', value: string) => {
    setAreas(prev => {
      const updated = [...prev];
      const current = updated[index];
      if (!current) return prev;
      updated[index] = {
        time: field === 'time' ? value : current.time,
        areaName: current.areaName
      };
      return updated;
    });
  }, []);

  const handleSmartTimeInput = (index: number, value: string) => {
    handleAreaUpdate(index, 'time', value);
  };

  const handleTimeInputBlur = (index: number, value: string) => {
    const parsed = parseSmartTime(value);
    handleAreaUpdate(index, 'time', parsed);
  };

  const clearTimeInput = (index: number) => {
    handleAreaUpdate(index, 'time', '');
  };

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    if (areas.length === 1) {
      handleAreaUpdate(0, 'time', stopwatch.formatTime(stopwatch.time));
    }
  }, [stopwatch, areas.length, handleAreaUpdate]);

  const isAllTimesComplete = areas.every(area => area.time && area.time !== '');

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
        const mins = parseInt(parts[0] || '0', 10) || 0;
        const secs = parseFloat(parts[1] || '0');
        return sum + (mins * 60 + secs) * 1000;
      }, 0);

      await onSave({
        time: totalMs,
        faults: faultCount,
        qualification: qualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setAreas([{ time: '', areaName: 'Search' }]);
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
                <ClipboardCheck className="h-5 w-5 text-primary" />
                AKC Scent Work
              </h1>
              <p className="text-sm text-muted-foreground">
                {entry.element} {entry.level}
              </p>
            </div>
          </header>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">#{entry.armband}</span>
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
              {/* Countdown ring - top right */}
              {maxTimeMs > 0 && (
                <svg
                  className="absolute top-3 right-3"
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
                    strokeWidth={strokeWidth}
                    className="text-muted/20"
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

              {/* Reset button - top left */}
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-3 left-3 text-muted-foreground hover:text-foreground"
                onClick={stopwatch.reset}
                disabled={stopwatch.isRunning}
                title={stopwatch.isRunning ? "Reset disabled while timer is running" : "Reset timer"}
              >
                <span className="text-xl">⟲</span>
              </Button>

              {/* Main timer display */}
              <div className="text-center pt-8">
                <div className={cn(
                  "text-5xl font-mono font-bold tracking-tight",
                  stopwatch.shouldShow30SecondWarning() && "text-amber-500",
                  stopwatch.isTimeExpired() && "text-destructive"
                )}>
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                {/* Countdown display */}
                <div className="text-sm text-muted-foreground mt-2">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.getRemainingTime()}</>
                  ) : (
                    <>Max Time: {classInfo.maxTime}</>
                  )}
                </div>

                {/* Timer controls */}
                <div className="mt-6">
                  {stopwatch.isRunning ? (
                    <Button
                      size="lg"
                      variant="destructive"
                      className="w-32 h-12 text-lg font-semibold"
                      onClick={handleStopTimer}
                    >
                      Stop
                    </Button>
                  ) : stopwatch.time > 0 ? (
                    stopwatch.isTimeExpired() ? (
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
                        variant="secondary"
                        className="w-32 h-12 text-lg font-semibold"
                        onClick={stopwatch.start}
                      >
                        Resume
                      </Button>
                    )
                  ) : (
                    <Button
                      size="lg"
                      className="w-32 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                      onClick={stopwatch.start}
                    >
                      Start
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            {/* Timer Warning Message */}
            {warningMessage && (
              <div className={cn(
                "px-4 py-3 rounded-lg text-center font-medium",
                warningMessage === 'Time Expired'
                  ? "bg-destructive/10 text-destructive"
                  : "bg-amber-500/10 text-amber-600"
              )}>
                {warningMessage}
              </div>
            )}

            {/* Time Input */}
            {areas.map((area, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      type="text"
                      value={area.time || ''}
                      onChange={(e) => handleSmartTimeInput(index, e.target.value)}
                      onBlur={(e) => handleTimeInputBlur(index, e.target.value)}
                      placeholder="Type: 12345 or 1:23.45"
                      className="text-center text-xl font-mono pr-10"
                    />
                    {area.time && (
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => clearTimeInput(index)}
                        title="Clear time"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <div className="text-center text-sm text-muted-foreground">
                    Max: {classInfo.maxTime}
                  </div>
                </div>
              </Card>
            ))}

            {/* Results Section */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Button
                  variant={qualifying === 'Q' ? 'default' : 'outline'}
                  className={cn(
                    "h-12",
                    qualifying === 'Q' && "bg-green-600 hover:bg-green-700 border-green-600"
                  )}
                  onClick={() => { setQualifying('Q'); setNonQualifyingReason(''); }}
                >
                  Qualified
                </Button>
                <Button
                  variant={qualifying === 'NQ' ? 'default' : 'outline'}
                  className={cn(
                    "h-12",
                    qualifying === 'NQ' && "bg-amber-500 hover:bg-amber-600 border-amber-500"
                  )}
                  onClick={() => { setQualifying('NQ'); setNonQualifyingReason('Incorrect Call'); }}
                >
                  NQ
                </Button>
                <Button
                  variant={qualifying === 'ABS' ? 'default' : 'outline'}
                  className={cn(
                    "h-12",
                    qualifying === 'ABS' && "bg-gray-500 hover:bg-gray-600 border-gray-500"
                  )}
                  onClick={() => { setQualifying('ABS'); setNonQualifyingReason('Absent'); }}
                >
                  Absent
                </Button>
                <Button
                  variant={qualifying === 'EX' ? 'default' : 'outline'}
                  className={cn(
                    "h-12",
                    qualifying === 'EX' && "bg-red-600 hover:bg-red-700 border-red-600"
                  )}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Dog Eliminated in Area'); }}
                >
                  Excused
                </Button>
              </div>

              {/* Faults */}
              {qualifying === 'Q' && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="font-medium">Faults:</span>
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setFaultCount(Math.max(0, faultCount - 1))}
                    >
                      -
                    </Button>
                    <span className="text-xl font-bold w-8 text-center">{faultCount}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setFaultCount(faultCount + 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              )}

              {/* NQ Reason */}
              {qualifying === 'NQ' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">NQ Reason:</label>
                  <select
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                  >
                    <option value="Incorrect Call">Incorrect Call</option>
                    <option value="Max Time">Max Time</option>
                    <option value="Point to Hide">Point to Hide</option>
                    <option value="Harsh Correction">Harsh Correction</option>
                    <option value="Significant Disruption">Significant Disruption</option>
                  </select>
                </div>
              )}
            </Card>

            {/* Validation message */}
            {qualifying === 'Q' && !isAllTimesComplete && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                Time must be entered for a Qualified score
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
          <Card className="w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div>
              <h2 className="text-xl font-semibold">Score Confirmation</h2>
              <p className="text-sm text-muted-foreground">
                {entry.element} {entry.level}
              </p>
            </div>

            {/* Dog info in dialog */}
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-bold text-primary">#{entry.armband}</span>
              </div>
              <div>
                <div className="font-medium">{entry.callName}</div>
                <div className="text-sm text-muted-foreground">{entry.breed}</div>
                <div className="text-xs text-muted-foreground">Handler: {entry.handler}</div>
              </div>
            </div>

            {/* Score details */}
            <div className="space-y-2">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Result</span>
                <span className={cn(
                  "font-semibold",
                  qualifying === 'Q' && "text-green-600",
                  qualifying === 'NQ' && "text-amber-500",
                  qualifying === 'ABS' && "text-gray-500",
                  qualifying === 'EX' && "text-red-600"
                )}>
                  {qualifying === 'Q' ? 'Qualified' : qualifying === 'NQ' ? 'NQ' : qualifying === 'ABS' ? 'Absent' : 'Excused'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Time</span>
                <span className="font-mono font-semibold">
                  {qualifying !== 'Q' ? '0:00.00' : (areas[0]?.time || '0:00.00')}
                </span>
              </div>
              {faultCount > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Faults</span>
                  <span className="font-semibold text-amber-500">{faultCount}</span>
                </div>
              )}
              {nonQualifyingReason && (qualifying === 'NQ' || qualifying === 'EX') && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">{qualifying === 'EX' ? 'Excused' : 'NQ'} Reason</span>
                  <span className="font-medium">{nonQualifyingReason}</span>
                </div>
              )}
            </div>

            {/* Dialog actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowConfirmation(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
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

export default AKCScentWorkScoresheet;
