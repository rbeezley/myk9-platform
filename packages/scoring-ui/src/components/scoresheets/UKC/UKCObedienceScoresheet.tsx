/**
 * UKC Obedience Scoresheet - Tailwind version
 *
 * Point-based scoring out of 200.
 * Qualifying: 170+ points with no zeroes.
 */

import React, { useState } from 'react';
import { ClipboardCheck, ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { logger } from '@myk9/core';

// Types
interface UKCObedienceScoresheetProps {
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

type QualifyingResult = 'Q' | 'NQ' | 'EX' | 'DQ' | '';

export const UKCObedienceScoresheet: React.FC<UKCObedienceScoresheetProps> = ({
  entry,
  classInfo,
  onSave,
  onNavigate,
  onBack,
  hasNext,
  hasPrev: _hasPrev,
}) => {
  // Scoring state
  const [points, setPoints] = useState('');
  const [qualifying, setQualifying] = useState<QualifyingResult>('');
  const [nonQualifyingReason, setNonQualifyingReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handlePointsChange = (value: string) => {
    // Allow only numbers and one decimal point (max 200.0)
    const regex = /^\d{0,3}(\.\d{0,1})?$/;
    if (regex.test(value) || value === '') {
      setPoints(value);
    }
  };

  const calculateQualifying = (score: number): 'Q' | 'NQ' => {
    // UKC Obedience qualifying score: 170+ out of 200
    return score >= 170 ? 'Q' : 'NQ';
  };

  const handleSubmit = async () => {
    if (!points && !qualifying) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    setIsSubmitting(true);
    try {
      const scoreValue = parseFloat(points) || 0;
      const finalQualifying = qualifying || calculateQualifying(scoreValue);

      await onSave({
        time: 0, // Obedience doesn't use time
        faults: 200 - scoreValue, // Deductions from max
        qualification: finalQualifying,
        notes: nonQualifyingReason || undefined,
      });

      setShowConfirmation(false);

      if (hasNext) {
        // Reset form
        setPoints('');
        setQualifying('');
        setNonQualifyingReason('');
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

  const scoreValue = parseFloat(points) || 0;
  const calculatedQualifying = calculateQualifying(scoreValue);
  const finalResult = qualifying || calculatedQualifying;

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
                <ClipboardCheck className="h-5 w-5 text-indigo-500" />
                UKC Obedience
              </h1>
              <p className="text-sm text-muted-foreground">{classInfo.name}</p>
            </div>
          </header>

          <div className="p-4 space-y-4">
            {/* Dog Info Card */}
            <Card className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <span className="text-lg font-bold text-indigo-600">#{entry.armband}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xl font-semibold truncate">{entry.callName}</div>
                  <div className="text-sm text-muted-foreground">{entry.breed}</div>
                  <div className="text-sm text-muted-foreground">Handler: {entry.handler}</div>
                </div>
              </div>
            </Card>

            {/* Score Input Section */}
            <Card className="p-6">
              <div className="text-center space-y-4">
                <label htmlFor="points" className="text-sm font-medium text-muted-foreground block">
                  Score Points
                </label>
                <Input
                  id="points"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={points}
                  onChange={(e) => handlePointsChange(e.target.value)}
                  className="text-center text-4xl font-bold h-16 max-w-[200px] mx-auto"
                  autoFocus
                />
                <div className="text-sm text-muted-foreground">out of 200.0</div>

                {/* Qualifying indicator */}
                {points && (
                  <div className={cn(
                    "py-2 px-4 rounded-full inline-block text-sm font-medium",
                    calculatedQualifying === 'Q'
                      ? "bg-green-500/10 text-green-600"
                      : "bg-red-500/10 text-red-600"
                  )}>
                    {calculatedQualifying === 'Q'
                      ? 'Qualifying (170+ required)'
                      : 'Non-Qualifying (below 170)'}
                  </div>
                )}
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
                  onClick={() => setQualifying('NQ')}
                >
                  NQ
                </Button>
                <Button
                  variant={qualifying === 'EX' ? 'default' : 'outline'}
                  className={cn("h-12", qualifying === 'EX' && "bg-gray-500 hover:bg-gray-600")}
                  onClick={() => { setQualifying('EX'); setNonQualifyingReason('Excused'); }}
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

            {/* Validation Warning */}
            {!points && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center">
                Score points are required to submit
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
                disabled={isSubmitting || !points}
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
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <span className="text-sm font-bold text-indigo-600">#{entry.armband}</span>
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
                  finalResult === 'Q' && "text-green-600",
                  finalResult === 'NQ' && "text-amber-500",
                  finalResult === 'EX' && "text-gray-500",
                  finalResult === 'DQ' && "text-red-600"
                )}>
                  {finalResult === 'Q' ? 'Qualified' :
                   finalResult === 'NQ' ? 'NQ' :
                   finalResult === 'EX' ? 'Excused' : 'DQ'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold">{points || '0'} / 200.0</span>
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

export default UKCObedienceScoresheet;
