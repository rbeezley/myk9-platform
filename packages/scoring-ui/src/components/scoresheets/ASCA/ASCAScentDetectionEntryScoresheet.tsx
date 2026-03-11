/**
 * ASCA Scent Detection Entry Scoresheet (Secretary View)
 *
 * Compact, keyboard-optimized form for manual score entry
 * from paper scoresheets. No stopwatch — pure text inputs
 * with smart time parsing.
 *
 * Uses useScoresheetScoring for state and parseSmartTime for input.
 * Pattern mirrors AKCScentWorkEntryScoresheet for the ASCA sport type.
 */

import React, { useState } from 'react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { parseSmartTime } from '../../../utils/parseSmartTime';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { EntryScoresheetProps } from '../../../types/scoreData';
import type { ExtendedResult } from '../../../types/scoreData';

const RESULT_VALUES: { value: ExtendedResult; label: string }[] = [
  { value: 'Q', label: 'Qualified (Q)' },
  { value: 'NQ', label: 'Not Qualified (NQ)' },
  { value: 'ABS', label: 'Absent (ABS)' },
  { value: 'EX', label: 'Excused (EX)' },
];

const NQ_REASONS = ['Incorrect Call', 'Max Time', 'False Alert', 'Handler Error'];

export const ASCAScentDetectionEntryScoresheet: React.FC<EntryScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onNext,
}) => {
  const [validationError, setValidationError] = useState('');

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const handleTimeBlur = (index: number, value: string) => {
    const parsed = parseSmartTime(value);
    scoring.handleAreaUpdate(index, 'time', parsed);
  };

  const handleResultChange = (value: string) => {
    setValidationError('');
    scoring.setQualifying(value as ExtendedResult);
    if (value === 'NQ') scoring.setNonQualifyingReason('Incorrect Call');
    else if (value === 'ABS') scoring.setNonQualifyingReason('Absent');
    else if (value === 'EX') scoring.setNonQualifyingReason('Dog Eliminated in Area');
    else scoring.setNonQualifyingReason('');
  };

  const handleSave = async () => {
    const validation = scoring.validate();
    if (!validation.valid) {
      setValidationError(validation.errors[0] ?? 'Validation failed');
      return;
    }
    await scoring.handleSubmit(onSubmit);
  };

  const handleSaveAndNext = async () => {
    const validation = scoring.validate();
    if (!validation.valid) {
      setValidationError(validation.errors[0] ?? 'Validation failed');
      return;
    }
    await scoring.handleSubmit(onSubmit);
    onNext?.();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">#{entry.armband}</span>
          </div>
          <div className="flex-1 min-w-0">
            <span className="font-semibold">{entry.dogName}</span>
            <span className="text-muted-foreground mx-2">|</span>
            <span className="text-sm text-muted-foreground">Handler: {entry.handlerName}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {classInfo.element} {classInfo.level}
          </div>
        </div>
      </Card>

      {/* Area Times */}
      <Card className="p-4">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm text-muted-foreground border-b border-border">
              <th className="pb-2 font-medium">Area</th>
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium text-center">Found</th>
              <th className="pb-2 font-medium text-center">Correct</th>
            </tr>
          </thead>
          <tbody>
            {scoring.areas.map((area, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="py-2 text-sm font-medium">{area.areaName}</td>
                <td className="py-2">
                  <Input
                    type="text"
                    value={area.time}
                    onChange={e => scoring.handleAreaUpdate(index, 'time', e.target.value)}
                    onBlur={e => handleTimeBlur(index, e.target.value)}
                    placeholder="123 or 1:23"
                    className="font-mono text-sm h-8 w-32"
                    aria-label={`${area.areaName} time`}
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={area.found}
                    onChange={e => scoring.handleAreaUpdate(index, 'found', e.target.checked)}
                    className="h-4 w-4"
                    aria-label={`${area.areaName} found`}
                  />
                </td>
                <td className="py-2 text-center">
                  <input
                    type="checkbox"
                    checked={area.correct}
                    onChange={e => scoring.handleAreaUpdate(index, 'correct', e.target.checked)}
                    className="h-4 w-4"
                    aria-label={`${area.areaName} correct`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Result & Details */}
      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Result */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Result</label>
            <select
              value={scoring.qualifying}
              onChange={e => handleResultChange(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
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

          {/* Faults */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Faults</label>
            <Input
              type="number"
              min={0}
              value={scoring.faultCount}
              onChange={e => scoring.setFaultCount(parseInt(e.target.value) || 0)}
              className="h-10"
              data-testid="fault-input"
            />
          </div>
        </div>

        {/* NQ Reason */}
        {scoring.qualifying === 'NQ' && (
          <div className="space-y-1">
            <label className="text-sm font-medium">NQ Reason</label>
            <select
              value={scoring.nonQualifyingReason}
              onChange={e => scoring.setNonQualifyingReason(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              data-testid="nq-reason-select"
            >
              {NQ_REASONS.map(reason => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
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
                Save & Next
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

registerScoresheet('ASCA_SCENT_DETECTION', 'entry', ASCAScentDetectionEntryScoresheet);
