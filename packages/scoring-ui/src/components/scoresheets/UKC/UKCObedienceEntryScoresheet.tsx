/**
 * UKC Obedience Entry Scoresheet (Secretary View)
 *
 * Compact form for manual score entry.
 * - Points input (0–200.0)
 * - Result select (Q/NQ/EX/DQ)
 * - Auto-qualifying hint text
 * - NQ reason input
 * - Save / Save & Next / Cancel actions
 */

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { EntryScoresheetProps } from '../../../types';

const POINTS_REGEX = /^\d{0,3}(\.\d{0,1})?$/;
const QUALIFYING_THRESHOLD = 170;

const RESULT_VALUES = [
  { value: 'Q', label: 'Qualified (Q)' },
  { value: 'NQ', label: 'Not Qualified (NQ)' },
  { value: 'EX', label: 'Excused (EX)' },
  { value: 'DQ', label: 'Disqualified (DQ)' },
] as const;

type ObedienceResult = (typeof RESULT_VALUES)[number]['value'];

export const UKCObedienceEntryScoresheet: React.FC<EntryScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onNext,
}) => {
  const [points, setPoints] = useState(() => {
    const existing = entry.existingScore?.points;
    return existing != null && existing > 0 ? String(existing) : '';
  });
  // Local result includes DQ which is not in ExtendedResult
  const [localResult, setLocalResult] = useState<ObedienceResult | ''>(() => {
    const r = entry.existingScore?.resultText;
    if (r === 'Q' || r === 'NQ' || r === 'EX' || r === 'DQ') return r;
    return '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const parsedPoints = parseFloat(points);
  const autoResult = !isNaN(parsedPoints)
    ? parsedPoints >= QUALIFYING_THRESHOLD
      ? 'Q'
      : 'NQ'
    : null;

  const handlePointsChange = (value: string) => {
    if (value === '' || POINTS_REGEX.test(value)) {
      const num = parseFloat(value);
      if (value === '' || isNaN(num) || num <= 200) {
        setPoints(value);
        setValidationError('');
      }
    }
  };

  const handleResultChange = (value: string) => {
    setValidationError('');
    setLocalResult(value as ObedienceResult | '');
    // DQ is not in ExtendedResult; map it to NQ in hook so nonQualifyingReason is accessible
    if (value === 'EX') {
      scoring.setQualifying('EX');
      scoring.setNonQualifyingReason('Excused');
    } else if (value === 'DQ') {
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('Disqualified');
    } else if (value === 'Q') {
      scoring.setQualifying('Q');
      scoring.setNonQualifyingReason('');
    } else if (value === 'NQ') {
      scoring.setQualifying('NQ');
      scoring.setNonQualifyingReason('');
    } else {
      scoring.setQualifying('');
    }
  };

  const buildAndSubmit = async (): Promise<boolean> => {
    if (!localResult) {
      setValidationError('Please select a result');
      return false;
    }
    const pts = parseFloat(points) || 0;
    const deductions = Math.max(0, 200 - pts);
    // Build ScoreData directly — DQ is not in ExtendedResult so we bypass handleSubmit
    const scoreData = scoring.buildScoreData({
      points: pts,
      faultCount: deductions,
      resultText: localResult,
      nonQualifyingReason:
        localResult !== 'Q' ? scoring.nonQualifyingReason || undefined : undefined,
    });
    setIsSubmitting(true);
    try {
      await onSubmit(scoreData);
      return true;
    } catch {
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSave = async () => {
    await buildAndSubmit();
  };

  const handleSaveAndNext = async () => {
    const ok = await buildAndSubmit();
    if (ok) onNext?.();
  };

  // Show NQ reason when result is not Q (use localResult for DQ display)
  const showNqReason = localResult && localResult !== 'Q';

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">#{entry.armband}</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold">{entry.dogName}</span>
            <span className="text-muted-foreground mx-2">|</span>
            <span className="text-sm text-muted-foreground">Handler: {entry.handlerName}</span>
          </div>
          <div className="text-sm text-muted-foreground shrink-0">
            {classInfo.element} {classInfo.level}
          </div>
        </div>
      </Card>

      {/* Score & Result */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Points input */}
          <div className="space-y-1">
            <label htmlFor="entry-points" className="text-sm font-medium">
              Points (out of 200.0)
            </label>
            <Input
              id="entry-points"
              type="text"
              inputMode="decimal"
              placeholder="0.0"
              value={points}
              onChange={e => handlePointsChange(e.target.value)}
              className="h-10 font-mono"
              data-testid="points-input"
            />
            {/* Auto-qualifying hint */}
            {autoResult !== null && (
              <p
                className={cn(
                  'text-xs mt-1',
                  autoResult === 'Q' ? 'text-green-600' : 'text-amber-600'
                )}
                data-testid="auto-qualify-hint"
              >
                {autoResult === 'Q'
                  ? 'Auto-qualifying (170+ pts)'
                  : 'Auto non-qualifying (below 170)'}
              </p>
            )}
          </div>

          {/* Result select */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Result</label>
            <select
              value={localResult}
              onChange={e => handleResultChange(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              data-testid="result-select"
            >
              <option value="">Select result...</option>
              {RESULT_VALUES.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* NQ/DQ/EX reason */}
        {showNqReason && (
          <div className="space-y-1">
            <label className="text-sm font-medium">Reason</label>
            <Input
              type="text"
              value={scoring.nonQualifyingReason}
              onChange={e => scoring.setNonQualifyingReason(e.target.value)}
              placeholder={`Reason for ${localResult}...`}
              className="h-10"
              data-testid="nq-reason-input"
            />
          </div>
        )}
      </Card>

      {/* Validation error */}
      {validationError && (
        <div
          className="px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-center text-sm"
          data-testid="validation-error"
        >
          {validationError}
        </div>
      )}

      {/* Actions */}
      <div className={cn('flex gap-3 pt-2 pb-4', onNext ? 'justify-between' : 'justify-end')}>
        <Button variant="outline" onClick={onBack} data-testid="cancel-btn">
          Cancel
        </Button>
        <div className="flex gap-2">
          {onNext ? (
            <>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={isSubmitting}
                data-testid="save-btn"
              >
                Save
              </Button>
              <Button
                onClick={handleSaveAndNext}
                disabled={isSubmitting}
                data-testid="save-next-btn"
              >
                Save &amp; Next
              </Button>
            </>
          ) : (
            <Button onClick={handleSave} disabled={isSubmitting} data-testid="save-btn">
              Save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

registerScoresheet('UKC_OBEDIENCE', 'entry', UKCObedienceEntryScoresheet);
