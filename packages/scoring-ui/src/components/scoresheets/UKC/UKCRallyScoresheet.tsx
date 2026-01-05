/**
 * UKC Rally Scoresheet - Tailwind version
 *
 * Point-based scoring: Start at 100, deductions reduce score.
 * Qualifying: 70+ points required.
 */

import React, { useState, useCallback } from 'react';
import { X, ClipboardCheck, ArrowLeft, Minus, Plus } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useStopwatch } from '../../../hooks/useStopwatch';

// Types
interface UKCRallyScoresheetProps {
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

type QualifyingResult = 'Q' | 'NQ' | '';

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

export const UKCRallyScoresheet: React.FC<UKCRallyScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state
  const [totalScore] = useState(100); // UKC Rally starts with 100 points
  const [deductions, setDeductions] = useState(0);
  const [courseTime, setCourseTime] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Timer - 5 minutes max for rally course
  const stopwatch = useStopwatch({
    maxTime: classInfo.maxTime || '5:00.00',
    level: classInfo.level,
  });

  const calculateFinalScore = useCallback(() => {
    return Math.max(0, totalScore - deductions);
  }, [totalScore, deductions]);

  const calculateQualifying = useCallback((): 'Q' | 'NQ' => {
    const finalScore = calculateFinalScore();
    // UKC Rally requires 70+ points to qualify (70% of 100)
    return finalScore >= 70 ? 'Q' : 'NQ';
  }, [calculateFinalScore]);

  // Stop timer and copy time
  const handleStopTimer = useCallback(() => {
    stopwatch.pause();
    setCourseTime(stopwatch.formatTime(stopwatch.time));
  }, [stopwatch]);

  const handleSubmit = async () => {
    if (!qualifying && !courseTime) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const timeMs = parseTimeToMs(courseTime);
      const finalQualifying = qualifying || calculateQualifying();

      await onSave({
        time: timeMs,
        faults: deductions,
        qualification: finalQualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setDeductions(0);
        setCourseTime('');
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

  const finalScore = calculateFinalScore();
  const calculatedQualifying = calculateQualifying();

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
                <ClipboardCheck className="h-5 w-5 text-purple-500" />
                UKC Rally
              </h1>
              <p className="text-sm text-muted-foreground">{classInfo.name}</p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-purple-600">#{entry.armband}</span>
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
                  stopwatch.shouldShow30SecondWarning() && "text-amber-500",
                  stopwatch.isTimeExpired() && "text-destructive"
                )}>
                  {stopwatch.formatTime(stopwatch.time)}
                </div>

                <div className="text-sm text-muted-foreground mt-2">
                  {stopwatch.time > 0 ? (
                    <>Remaining: {stopwatch.getRemainingTime()}</>
                  ) : (
                    <>Max Time: {classInfo.maxTime || '5:00.00'}</>
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
              </div>
            </Card>

            {/* Course Time Input */}
            <Card className="p-4">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Course Time
              </label>
              <div className="relative">
                <Input
                  type="text"
                  value={courseTime}
                  onChange={(e) => setCourseTime(e.target.value)}
                  onBlur={(e) => setCourseTime(parseSmartTime(e.target.value))}
                  placeholder="Type: 12345 or 1:23.45"
                  className="text-center text-xl font-mono pr-10"
                />
                {courseTime && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setCourseTime('')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </Card>

            {/* Score Section */}
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Starting</div>
                  <div className="text-2xl font-bold">{totalScore}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Deductions</div>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeductions(Math.max(0, deductions - 1))}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="text-2xl font-bold w-8">{deductions}</span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeductions(deductions + 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Final Score</div>
                  <div className={cn(
                    "text-2xl font-bold",
                    finalScore >= 70 ? "text-green-600" : "text-red-600"
                  )}>
                    {finalScore}
                  </div>
                  <div className={cn(
                    "text-xs",
                    finalScore >= 70 ? "text-green-600" : "text-red-600"
                  )}>
                    {calculatedQualifying === 'Q' ? 'Qualifying' : 'Non-Qualifying'}
                  </div>
                </div>
              </div>
              <div className="text-center text-xs text-muted-foreground mt-2">
                70+ required to qualify
              </div>
            </Card>

            {/* Results Section */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
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
              </div>

              {qualifying === 'NQ' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">NQ Reason:</label>
                  <textarea
                    value={nonQualifyingReason}
                    onChange={(e) => setNonQualifyingReason(e.target.value)}
                    placeholder="Enter reason for NQ..."
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background resize-none"
                  />
                </div>
              )}
            </Card>

            {/* Validation Warning */}
            {!courseTime && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                Course time is required to submit a score
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
                disabled={isSubmitting || !courseTime}
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
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-purple-600">#{entry.armband}</span>
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
                  (qualifying || calculatedQualifying) === 'Q' ? "text-green-600" : "text-amber-500"
                )}>
                  {(qualifying || calculatedQualifying) === 'Q' ? 'Qualified' : 'NQ'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Final Score</span>
                <span className="font-semibold">{finalScore}/100</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Course Time</span>
                <span className="font-mono font-semibold">{courseTime || '0:00.00'}</span>
              </div>
              {deductions > 0 && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Deductions</span>
                  <span className="font-semibold text-red-600">{deductions}</span>
                </div>
              )}
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

export default UKCRallyScoresheet;
