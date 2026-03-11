/**
 * UKC Rally Entry Scoresheet (Secretary View)
 *
 * Deduction-based scoring entry form.
 * - No stopwatch — manual course time input with smart parsing
 * - Deductions number input, final score displayed (100 - deductions)
 * - Results: Q or NQ only
 */

import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { parseSmartTime } from '../../../utils/parseSmartTime';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { EntryScoresheetProps } from '../../../types';

export const UKCRallyEntryScoresheet: React.FC<EntryScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onNext,
}) => {
  const [deductions, setDeductions] = useState(
    entry.existingScore ? 100 - (entry.existingScore.points ?? 100) : 0
  );
  const [courseTime, setCourseTime] = useState(entry.existingScore?.searchTime ?? '');
  const [validationError, setValidationError] = useState('');

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const finalScore = Math.max(0, 100 - deductions);

  const handleCourseTimeBlur = (value: string) => {
    const parsed = parseSmartTime(value);
    setCourseTime(parsed);
    if (scoring.areas.length > 0) {
      scoring.handleAreaUpdate(0, 'time', parsed);
    }
  };

  const handleResultChange = (value: string) => {
    setValidationError('');
    scoring.setQualifying(value as 'Q' | 'NQ');
    if (value !== 'NQ') {
      scoring.setNonQualifyingReason('');
    }
  };

  const buildAndSubmit = async (andNext: boolean) => {
    if (!scoring.qualifying) {
      setValidationError('Please select a result');
      return;
    }

    const courseTimeFinal = courseTime;
    await scoring.handleSubmit(onSubmit, {
      points: finalScore,
      faultCount: deductions,
      searchTime: courseTimeFinal || '0.00',
      resultText: scoring.qualifying,
    });

    if (andNext) {
      onNext?.();
    }
  };

  const handleSave = () => buildAndSubmit(false);
  const handleSaveAndNext = () => buildAndSubmit(true);

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

      {/* Score Entry */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Deductions */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Deductions</label>
            <Input
              type="number"
              min={0}
              max={100}
              value={deductions}
              onChange={e =>
                setDeductions(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))
              }
              className="h-10"
              data-testid="deductions-input"
            />
          </div>

          {/* Final Score (computed) */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Final Score</label>
            <div
              className={cn(
                'h-10 px-3 flex items-center rounded-md border border-input bg-muted text-lg font-bold',
                finalScore >= 70 ? 'text-green-600' : 'text-red-600'
              )}
              data-testid="final-score-display"
            >
              {finalScore}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {finalScore >= 70 ? '(Q)' : '(NQ)'}
              </span>
            </div>
          </div>
        </div>

        {/* Course Time */}
        <div className="space-y-1">
          <label className="text-sm font-medium">Course Time</label>
          <Input
            type="text"
            value={courseTime}
            onChange={e => setCourseTime(e.target.value)}
            onBlur={e => handleCourseTimeBlur(e.target.value)}
            placeholder="Type: 12345 or 1:23.45"
            className="font-mono"
            data-testid="course-time-input"
          />
        </div>
      </Card>

      {/* Result & NQ Reason */}
      <Card className="p-4 space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Result</label>
          <select
            value={scoring.qualifying}
            onChange={e => handleResultChange(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background"
            data-testid="result-select"
          >
            <option value="">Select result...</option>
            <option value="Q">Qualified (Q)</option>
            <option value="NQ">Not Qualified (NQ)</option>
          </select>
        </div>

        {scoring.qualifying === 'NQ' && (
          <div className="space-y-1">
            <label className="text-sm font-medium">NQ Reason</label>
            <Input
              type="text"
              value={scoring.nonQualifyingReason}
              onChange={e => scoring.setNonQualifyingReason(e.target.value)}
              placeholder="Enter reason for NQ..."
              data-testid="nq-reason-input"
            />
          </div>
        )}
      </Card>

      {/* Validation Error */}
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
              <Button variant="secondary" onClick={handleSave} data-testid="save-btn">
                Save
              </Button>
              <Button onClick={handleSaveAndNext} data-testid="save-next-btn">
                Save &amp; Next
              </Button>
            </>
          ) : (
            <Button onClick={handleSave} data-testid="save-btn">
              Save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

registerScoresheet('UKC_RALLY', 'entry', UKCRallyEntryScoresheet);
