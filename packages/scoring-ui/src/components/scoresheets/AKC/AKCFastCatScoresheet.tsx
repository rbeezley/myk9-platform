/**
 * AKC FastCAT Scoresheet - Tailwind version
 *
 * Fast Coursing Ability Test - 100-yard dash.
 * Dogs earn points based on their speed (MPH).
 */

import React, { useState, useMemo, useCallback } from 'react';
import { X, ArrowLeft, Zap } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';

// FastCAT constants
const FASTCAT_COURSE = {
  LENGTH_YARDS: 100,
  YARDS_PER_MILE: 1760,
  SECONDS_PER_HOUR: 3600,
  POINTS_MULTIPLIER: 2,
} as const;

// Types
interface AKCFastCatScoresheetProps {
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

type QualifyingResult = 'Q' | 'NQ' | 'E' | 'DQ' | '';

function parseTimeToSeconds(timeString: string): number {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0], 10) || 0;
    const seconds = parseFloat(parts[1]) || 0;
    return (minutes * 60) + seconds;
  }
  return parseFloat(timeString) || 0;
}

export const AKCFastCatScoresheet: React.FC<AKCFastCatScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  const [runTime, setRunTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const stopwatch = useStopwatch({
    maxTime: '1:00.00',
    level: classInfo.level,
  });

  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    const totalMs = stopwatch.time;
    const seconds = (totalMs / 1000).toFixed(2);
    setRunTime(seconds);
  }, [stopwatch]);

  const { mph, points } = useMemo(() => {
    if (!runTime) return { mph: 0, points: 0 };
    const timeInSeconds = parseTimeToSeconds(runTime);
    if (timeInSeconds <= 0) return { mph: 0, points: 0 };
    const calculatedMph = (FASTCAT_COURSE.LENGTH_YARDS * FASTCAT_COURSE.SECONDS_PER_HOUR) /
                          (timeInSeconds * FASTCAT_COURSE.YARDS_PER_MILE);
    const roundedMph = Math.round(calculatedMph * 100) / 100;
    const basePoints = Math.round(calculatedMph * FASTCAT_COURSE.POINTS_MULTIPLIER);
    return { mph: roundedMph, points: basePoints };
  }, [runTime]);

  const handleSubmit = async () => {
    if (!runTime && !qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeInSeconds = parseTimeToSeconds(runTime);
      const finalQualifying = qualifying || 'Q';
      await onSave({
        time: timeInSeconds * 1000,
        faults: 0,
        qualification: finalQualifying,
        notes: nonQualifyingReason || undefined,
      });
      setShowConfirmation(false);
      if (hasNext) {
        setRunTime('');
        setQualifying('');
        setNonQualifyingReason('');
        stopwatch.reset();
        onNavigate('next');
      } else {
        onBack();
      }
    } catch (error) {
      console.error('Failed to save score:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

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
                <Zap className="h-5 w-5 text-amber-500" />
                AKC FastCAT
              </h1>
              <p className="text-sm text-muted-foreground">{classInfo.name}</p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-amber-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.callName}</div>
                  <div className="text-sm text-muted-foreground">{entry.breed}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handler}</div>
                </div>
              </div>
            </Card>

            {/* Timer Section */}
            <Card className="p-6">
              <div className="text-center">
                <div className={cn(
                  "text-5xl font-mono font-bold tracking-tight",
                  stopwatch.isTimeExpired() && "text-destructive"
                )}>
                  {stopwatch.formatTime(stopwatch.time)}
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
                    <Button
                      size="lg"
                      variant="secondary"
                      className="w-28 h-12 text-lg font-semibold"
                      onClick={stopwatch.start}
                    >
                      Resume
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      className="w-28 h-12 text-lg font-semibold bg-green-600 hover:bg-green-700"
                      onClick={stopwatch.start}
                    >
                      Start
                    </Button>
                  )}
                  <Button
                    size="lg"
                    variant="outline"
                    className="h-12"
                    onClick={stopwatch.reset}
                    disabled={stopwatch.isRunning}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </Card>

            {/* Time Input */}
            <Card className="p-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Run Time (seconds)
              </label>
              <div className="relative">
                <Input
                  type="text"
                  placeholder="SS.ss"
                  value={runTime}
                  onChange={(e) => setRunTime(e.target.value)}
                  className="text-center text-xl font-mono pr-10"
                />
                {runTime && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setRunTime('')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>

            {/* Results Display */}
            {runTime && mph > 0 && (
              <div className="grid grid-cols-2 gap-3">
                <Card className="p-4 text-center bg-amber-500/10 border-amber-500/20">
                  <div className="text-sm text-amber-600 font-medium">Speed</div>
                  <div className="text-2xl font-bold text-amber-600">{mph.toFixed(2)} MPH</div>
                </Card>
                <Card className="p-4 text-center bg-green-500/10 border-green-500/20">
                  <div className="text-sm text-green-600 font-medium">Points</div>
                  <div className="text-2xl font-bold text-green-600">{points}</div>
                </Card>
              </div>
            )}

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
                  onClick={() => setQualifying('NQ')}
                >
                  NQ
                </Button>
                <Button
                  variant={qualifying === 'E' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'E' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => { setQualifying('E'); setNonQualifyingReason('Excused'); }}
                >
                  Excused
                </Button>
                <Button
                  variant={qualifying === 'DQ' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'DQ' && "bg-red-600 hover:bg-red-700")}
                  onClick={() => setQualifying('DQ')}
                >
                  DQ
                </Button>
              </div>

              {(qualifying === 'NQ' || qualifying === 'DQ') && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason:</label>
                  <textarea
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    placeholder={`Enter reason for ${qualifying}...`}
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background resize-none"
                  />
                </div>
              )}
            </Card>

            {!runTime && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                Run time is required to submit a score
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
                disabled={isSubmitting || !runTime}
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
              <p className="text-sm text-muted-foreground">{classInfo.name}</p>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-amber-600">#{entry.armband}</span>
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
                  (qualifying === 'Q' || !qualifying) && "text-green-600",
                  qualifying === 'NQ' && "text-amber-500",
                  qualifying === 'DQ' && "text-red-600"
                )}>
                  {qualifying === 'Q' || !qualifying ? 'Qualified' :
                   qualifying === 'NQ' ? 'NQ' :
                   qualifying === 'E' ? 'Excused' : 'DQ'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Run Time</span>
                <span className="font-mono font-semibold">{runTime || '0.00'}s</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Speed</span>
                <span className="font-semibold">{mph.toFixed(2)} MPH</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Points</span>
                <span className="font-semibold text-green-600">{points}</span>
              </div>
              {nonQualifyingReason && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Reason</span>
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

export default AKCFastCatScoresheet;
