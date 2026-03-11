/**
 * AKC Nationals Entry Scoresheet (Secretary View)
 *
 * Compact, keyboard-optimized table for manual entry from paper scoresheets.
 * 5 search areas, per-area correct/incorrect alert counters, points auto-calc.
 * Extended results include placements: 1st/2nd/3rd/4th.
 */

import React, { useState } from 'react';
import { Button, Input, Card, cn } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { parseSmartTime } from '../../../utils/parseSmartTime';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { EntryScoresheetProps } from '../../../types/scoreData';

const RESULT_OPTIONS = [
  { value: 'Q', label: 'Qualified (Q)' },
  { value: 'NQ', label: 'Not Qualified (NQ)' },
  { value: 'ABS', label: 'Absent (ABS)' },
  { value: 'EX', label: 'Excused (EX)' },
  { value: '1st', label: '1st Place' },
  { value: '2nd', label: '2nd Place' },
  { value: '3rd', label: '3rd Place' },
  { value: '4th', label: '4th Place' },
];

const PLACEMENT_BONUS: Record<string, number> = {
  '1st': 10,
  '2nd': 7,
  '3rd': 5,
  '4th': 3,
};

const NATIONALS_AREA_COUNT = 5;

function calculatePoints(
  correctAlerts: number[],
  incorrectAlerts: number[],
  result: string
): number {
  let pts = 0;
  for (let i = 0; i < correctAlerts.length; i++) {
    pts += (correctAlerts[i] ?? 0) * 10;
    pts -= (incorrectAlerts[i] ?? 0) * 5;
  }
  pts += PLACEMENT_BONUS[result] ?? 0;
  return Math.max(0, pts);
}

export const AKCNationalsEntryScoresheet: React.FC<EntryScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onNext,
}) => {
  const areaCount = rules.areaCount ?? NATIONALS_AREA_COUNT;

  const [correctAlerts, setCorrectAlerts] = useState<number[]>(() => {
    if (entry.existingScore?.correctCount !== undefined) {
      // Distribute existing correct count evenly as a best-effort pre-fill
      return Array(areaCount).fill(0);
    }
    return Array(areaCount).fill(0);
  });
  const [incorrectAlerts, setIncorrectAlerts] = useState<number[]>(() => Array(areaCount).fill(0));
  const [finishCallErrors, setFinishCallErrors] = useState(
    entry.existingScore?.finishCallErrors ?? 0
  );
  const [validationError, setValidationError] = useState('');

  const scoring = useScoresheetScoring({
    rules: { ...rules, areaCount },
    existingScore: entry.existingScore,
  });

  const totalPoints = calculatePoints(correctAlerts, incorrectAlerts, scoring.qualifying);

  const handleTimeBlur = (index: number, value: string) => {
    const parsed = parseSmartTime(value);
    scoring.handleAreaUpdate(index, 'time', parsed);
  };

  const handleCorrectChange = (index: number, delta: number) => {
    setCorrectAlerts(prev => {
      const next = [...prev];
      next[index] = Math.max(0, (next[index] ?? 0) + delta);
      return next;
    });
  };

  const handleIncorrectChange = (index: number, delta: number) => {
    setIncorrectAlerts(prev => {
      const next = [...prev];
      next[index] = Math.max(0, (next[index] ?? 0) + delta);
      return next;
    });
  };

  const handleResultChange = (value: string) => {
    setValidationError('');
    scoring.setQualifying(value as Parameters<typeof scoring.setQualifying>[0]);
    if (value === 'EX') {
      setCorrectAlerts(Array(areaCount).fill(0));
      setIncorrectAlerts(Array(areaCount).fill(0));
      setFinishCallErrors(0);
    }
  };

  const handleSave = async () => {
    const validation = scoring.validate();
    if (!validation.valid) {
      setValidationError(validation.errors[0] ?? 'Validation failed');
      return;
    }
    await scoring.handleSubmit(onSubmit, {
      points: totalPoints,
      finishCallErrors,
      correctCount: correctAlerts.reduce((s, v) => s + v, 0),
      incorrectCount: incorrectAlerts.reduce((s, v) => s + v, 0),
    });
  };

  const handleSaveAndNext = async () => {
    const validation = scoring.validate();
    if (!validation.valid) {
      setValidationError(validation.errors[0] ?? 'Validation failed');
      return;
    }
    await scoring.handleSubmit(onSubmit, {
      points: totalPoints,
      finishCallErrors,
      correctCount: correctAlerts.reduce((s, v) => s + v, 0),
      incorrectCount: incorrectAlerts.reduce((s, v) => s + v, 0),
    });
    onNext?.();
  };

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
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

      {/* Area Table */}
      <Card className="p-4 overflow-x-auto">
        <table className="w-full text-sm" data-testid="area-table">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="pb-2 font-medium">Area</th>
              <th className="pb-2 font-medium">Time</th>
              <th className="pb-2 font-medium text-center">Correct Alerts</th>
              <th className="pb-2 font-medium text-center">Incorrect Alerts</th>
            </tr>
          </thead>
          <tbody>
            {scoring.areas.map((area, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{area.areaName}</td>
                <td className="py-2">
                  <Input
                    type="text"
                    value={area.time}
                    onChange={e => scoring.handleAreaUpdate(index, 'time', e.target.value)}
                    onBlur={e => handleTimeBlur(index, e.target.value)}
                    placeholder="1:23.45"
                    className="font-mono text-sm h-8 w-28"
                    aria-label={`${area.areaName} time`}
                  />
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => handleCorrectChange(index, -1)}
                      aria-label={`Decrease correct alerts for ${area.areaName}`}
                    >
                      -
                    </Button>
                    <span
                      className="w-8 text-center font-semibold text-green-600"
                      data-testid={`correct-${index}`}
                    >
                      {correctAlerts[index] ?? 0}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => handleCorrectChange(index, 1)}
                      aria-label={`Increase correct alerts for ${area.areaName}`}
                    >
                      +
                    </Button>
                  </div>
                </td>
                <td className="py-2">
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => handleIncorrectChange(index, -1)}
                      aria-label={`Decrease incorrect alerts for ${area.areaName}`}
                    >
                      -
                    </Button>
                    <span
                      className="w-8 text-center font-semibold text-red-600"
                      data-testid={`incorrect-${index}`}
                    >
                      {incorrectAlerts[index] ?? 0}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 text-xs"
                      onClick={() => handleIncorrectChange(index, 1)}
                      aria-label={`Increase incorrect alerts for ${area.areaName}`}
                    >
                      +
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Result & Points Row */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          {/* Result */}
          <div className="space-y-1 sm:col-span-2">
            <label className="text-sm font-medium">Result</label>
            <select
              value={scoring.qualifying}
              onChange={e => handleResultChange(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background"
              data-testid="result-select"
            >
              <option value="">Select result...</option>
              {RESULT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Points display */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Points</label>
            <div
              className="h-10 px-3 rounded-md border border-input bg-muted flex items-center font-bold text-rose-600"
              data-testid="points-display"
            >
              {totalPoints}
            </div>
          </div>
        </div>

        {/* Finish Call Errors */}
        <div className="mt-4 flex items-center gap-4">
          <label className="text-sm font-medium">Finish Call Errors</label>
          <Input
            type="number"
            min={0}
            value={finishCallErrors}
            onChange={e => setFinishCallErrors(parseInt(e.target.value) || 0)}
            className="h-8 w-20"
            data-testid="fce-input"
          />
        </div>
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

registerScoresheet('AKC_SCENT_WORK_NATIONAL', 'entry', AKCNationalsEntryScoresheet);
