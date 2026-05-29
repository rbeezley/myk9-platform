/**
 * UKC Obedience Live Scoresheet (Judge View)
 *
 * Points-based scoring (0–200.0, decimal allowed).
 * No timer — obedience is scored purely on points.
 * - Auto-qualifying: 170+ = Q, below 170 = NQ
 * - Manual override: Q/NQ/EX/DQ buttons
 * - Confirmation dialog with points summary
 */

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { LiveScoresheetProps } from '../../../types';

const POINTS_REGEX = /^\d{0,3}(\.\d{0,1})?$/;
const QUALIFYING_THRESHOLD = 170;

type ObedienceResult = 'Q' | 'NQ' | 'EX' | 'DQ';

const RESULT_OPTIONS: { value: ObedienceResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: 'Qualified',
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  { value: 'NQ', label: 'NQ', activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500' },
  { value: 'EX', label: 'Excused', activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500' },
  { value: 'DQ', label: 'DQ', activeClass: 'bg-red-600 hover:bg-red-700 border-red-600' },
];

function calcAutoQualifying(pts: number): 'Q' | 'NQ' {
  return pts >= QUALIFYING_THRESHOLD ? 'Q' : 'NQ';
}

export const UKCObedienceLiveScoresheet: React.FC<LiveScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
}) => {
  const [points, setPoints] = useState(() => {
    const existing = entry.existingScore?.points;
    return existing != null && existing > 0 ? String(existing) : '';
  });
  const [manualResult, setManualResult] = useState<ObedienceResult | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const parsedPoints = parseFloat(points) || 0;
  const autoResult = calcAutoQualifying(parsedPoints);
  const effectiveResult: ObedienceResult = manualResult ?? (points ? autoResult : 'NQ');

  const handlePointsChange = (value: string) => {
    if (value === '' || POINTS_REGEX.test(value)) {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num <= 200) {
        setPoints(value);
        // Clear manual override only if it was auto-derived
        if (manualResult === null) {
          scoring.setQualifying(value ? calcAutoQualifying(parseFloat(value) || 0) : '');
        }
      }
    }
  };

  const handleResultSelect = (result: ObedienceResult) => {
    setManualResult(result);
    // DQ is not in ExtendedResult; map to NQ in hook to keep nonQualifyingReason accessible
    if (result === 'EX') {
      scoring.setQualifying('EX');
      scoring.setNonQualifyingReason('Excused');
    } else if (result === 'Q') {
      scoring.setQualifying('Q');
      scoring.setNonQualifyingReason('');
    } else {
      // NQ or DQ
      scoring.setQualifying('NQ');
    }
  };

  const handleSubmitClick = () => {
    if (!points) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    const pts = parseFloat(points) || 0;
    const deductions = Math.max(0, 200 - pts);
    // Build ScoreData directly — DQ is not in ExtendedResult so we bypass handleSubmit
    const scoreData = scoring.buildScoreData({
      points: pts,
      faultCount: deductions,
      resultText: effectiveResult,
      nonQualifyingReason:
        effectiveResult !== 'Q' ? scoring.nonQualifyingReason || undefined : undefined,
    });
    try {
      await onSubmit(scoreData);
    } finally {
      setShowConfirmation(false);
    }
  };

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
              <h1 className="text-lg font-semibold">UKC Obedience</h1>
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

            {/* Score Input */}
            <Card className="p-6">
              <div className="text-center space-y-4">
                <label
                  htmlFor="obedience-points"
                  className="text-sm font-medium text-muted-foreground block"
                >
                  Score Points
                </label>
                <Input
                  id="obedience-points"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={points}
                  onChange={e => handlePointsChange(e.target.value)}
                  className="text-center text-4xl font-mono font-bold h-16 max-w-[200px] mx-auto"
                  autoFocus
                  data-testid="points-input"
                />
                <div className="text-sm text-muted-foreground">out of 200.0</div>

                {/* Auto-qualifying badge */}
                {points && (
                  <div
                    className={cn(
                      'py-2 px-4 rounded-full inline-block text-sm font-medium',
                      autoResult === 'Q'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-red-500/10 text-red-600'
                    )}
                    data-testid="auto-qualify-badge"
                  >
                    {autoResult === 'Q'
                      ? 'Qualifying (170+ required)'
                      : 'Non-Qualifying (below 170)'}
                  </div>
                )}
              </div>
            </Card>

            {/* Result Buttons */}
            <Card className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {RESULT_OPTIONS.map(opt => (
                  <Button
                    key={opt.value}
                    variant={manualResult === opt.value ? 'default' : 'outline'}
                    className={cn('h-12', manualResult === opt.value && opt.activeClass)}
                    onClick={() => handleResultSelect(opt.value)}
                    data-testid={`result-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>

              {/* NQ/DQ/EX reason input */}
              {effectiveResult !== 'Q' && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason:</label>
                  <textarea
                    value={scoring.nonQualifyingReason}
                    onChange={e => scoring.setNonQualifyingReason(e.target.value)}
                    placeholder={`Enter reason for ${effectiveResult}...`}
                    rows={2}
                    className="w-full px-3 py-2 rounded-md border border-input bg-background resize-none text-sm"
                    data-testid="nq-reason-input"
                  />
                </div>
              )}
            </Card>

            {/* Validation warning */}
            {!points && (
              <div className="px-4 py-3 rounded-lg bg-amber-500/10 text-amber-600 text-center text-sm">
                Score points are required to submit
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2 pb-8">
              <Button variant="outline" className="flex-1 h-12" onClick={onBack}>
                Cancel
              </Button>
              <Button
                className="flex-1 h-12"
                onClick={handleSubmitClick}
                disabled={scoring.isSubmitting || !points}
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
                    effectiveResult === 'Q' && 'text-green-600',
                    effectiveResult === 'NQ' && 'text-amber-500',
                    effectiveResult === 'EX' && 'text-gray-500',
                    effectiveResult === 'DQ' && 'text-red-600'
                  )}
                >
                  {effectiveResult === 'Q'
                    ? 'Qualified'
                    : effectiveResult === 'NQ'
                      ? 'NQ'
                      : effectiveResult === 'EX'
                        ? 'Excused'
                        : 'DQ'}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-muted-foreground">Score</span>
                <span className="font-semibold font-mono">{points || '0'} / 200.0</span>
              </div>
              {scoring.nonQualifyingReason && (
                <div className="flex justify-between py-2 border-b border-border">
                  <span className="text-muted-foreground">Reason</span>
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

registerScoresheet('UKC_OBEDIENCE', 'live', UKCObedienceLiveScoresheet);
