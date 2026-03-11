/**
 * AKC FastCAT Entry Scoresheet (Secretary View)
 *
 * Compact keyboard-optimized form for manual entry of FastCAT run times.
 * No stopwatch — manual time input with smart parsing on blur.
 * Auto-calculates MPH and Points from entered time.
 *
 * Formula: mph = (100 * 3600) / (timeInSeconds * 1760)
 *          points = mph * 2 (rounded to nearest integer)
 */

import React, { useState, useMemo } from 'react';
import { Button, Input, Card } from '@myk9/ui';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { parseSmartTime } from '../../../utils/parseSmartTime';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import type { EntryScoresheetProps } from '../../../types';

// FastCAT results: Q, NQ, E (Excused), DQ
const FASTCAT_RESULTS = [
  { value: 'Q', label: 'Qualified (Q)' },
  { value: 'NQ', label: 'Not Qualified (NQ)' },
  { value: 'E', label: 'Excused (E)' },
  { value: 'DQ', label: 'Disqualified (DQ)' },
] as const;

type FastCATResult = (typeof FASTCAT_RESULTS)[number]['value'];

// 100 yards / time → MPH
// mph = (100yd × 3600s/hr) / (timeInSeconds × 1760yd/mi)
function calcMph(timeInSeconds: number): number {
  if (timeInSeconds <= 0) return 0;
  return (100 * 3600) / (timeInSeconds * 1760);
}

function parseTimeToSeconds(timeString: string): number {
  if (!timeString) return 0;
  const parts = timeString.split(':');
  if (parts.length === 2) {
    return (parseInt(parts[0], 10) || 0) * 60 + (parseFloat(parts[1]) || 0);
  }
  return parseFloat(timeString) || 0;
}

export const AKCFastCatEntryScoresheet: React.FC<EntryScoresheetProps> = ({
  entry,
  classInfo,
  rules,
  onSubmit,
  onBack,
  onNext,
}) => {
  const [fastcatResult, setFastcatResult] = useState<FastCATResult | ''>(
    () => (entry.existingScore?.resultText as FastCATResult) ?? ''
  );
  const [validationError, setValidationError] = useState('');

  const scoring = useScoresheetScoring({
    rules,
    existingScore: entry.existingScore,
  });

  const runTimeStr = scoring.areas[0]?.time ?? '';

  const { mph, points } = useMemo(() => {
    const secs = parseTimeToSeconds(runTimeStr);
    if (secs <= 0) return { mph: 0, points: 0 };
    const calculatedMph = calcMph(secs);
    return {
      mph: Math.round(calculatedMph * 100) / 100,
      points: Math.round(calculatedMph * 2),
    };
  }, [runTimeStr]);

  const handleTimeBlur = (value: string) => {
    const parsed = parseSmartTime(value);
    scoring.handleAreaUpdate(0, 'time', parsed);
  };

  const handleResultChange = (value: string) => {
    setValidationError('');
    setFastcatResult(value as FastCATResult);
  };

  // FastCAT uses its own result options (Q/NQ/E/DQ) and validation,
  // so we call buildScoreData directly instead of handleSubmit
  // (which would check stale React state from setQualifying).
  const submitScore = async (): Promise<boolean> => {
    if (!fastcatResult) {
      setValidationError('No result selected');
      return false;
    }
    setValidationError('');
    try {
      const scoreData = scoring.buildScoreData({
        resultText: fastcatResult,
        points,
        searchTime: runTimeStr || '0.00',
      });
      await onSubmit(scoreData);
      return true;
    } catch {
      return false;
    }
  };

  const handleSave = async () => {
    await submitScore();
  };

  const handleSaveAndNext = async () => {
    const ok = await submitScore();
    if (ok) onNext?.();
  };

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      {/* Header */}
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
            <span className="text-sm font-bold text-amber-600">#{entry.armband}</span>
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

      {/* Run Time */}
      <Card className="p-4 space-y-2">
        <label className="text-sm font-medium" htmlFor="run-time-input">
          Run Time
        </label>
        <Input
          id="run-time-input"
          type="text"
          value={runTimeStr}
          onChange={e => scoring.handleAreaUpdate(0, 'time', e.target.value)}
          onBlur={e => handleTimeBlur(e.target.value)}
          placeholder="123 or 1:23"
          className="font-mono text-sm h-10"
          aria-label="Run time"
          data-testid="run-time-input"
        />
      </Card>

      {/* Auto-calculated Speed & Points */}
      {mph > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4 text-center bg-amber-500/10 border-amber-500/20">
            <div className="text-sm text-amber-600 font-medium">Speed</div>
            <div className="text-2xl font-bold text-amber-600" data-testid="mph-display">
              {mph.toFixed(1)} MPH
            </div>
          </Card>
          <Card className="p-4 text-center bg-green-500/10 border-green-500/20">
            <div className="text-sm text-green-600 font-medium">Points</div>
            <div className="text-2xl font-bold text-green-600" data-testid="points-display">
              {points}
            </div>
          </Card>
        </div>
      )}

      {/* Result */}
      <Card className="p-4 space-y-2">
        <label className="text-sm font-medium">Result</label>
        <select
          value={fastcatResult}
          onChange={e => handleResultChange(e.target.value)}
          className="w-full h-10 px-3 rounded-md border border-input bg-background"
          data-testid="result-select"
        >
          <option value="">Select result...</option>
          {FASTCAT_RESULTS.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
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
      <div className="flex gap-3 pt-2 pb-4 justify-between">
        <Button variant="outline" onClick={onBack} data-testid="cancel-btn">
          Cancel
        </Button>
        <div className="flex gap-2">
          {onNext ? (
            <>
              <Button
                variant="secondary"
                onClick={handleSave}
                disabled={scoring.isSubmitting}
                data-testid="save-btn"
              >
                Save
              </Button>
              <Button
                onClick={handleSaveAndNext}
                disabled={scoring.isSubmitting}
                data-testid="save-next-btn"
              >
                Save &amp; Next
              </Button>
            </>
          ) : (
            <Button onClick={handleSave} disabled={scoring.isSubmitting} data-testid="save-btn">
              Save
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

registerScoresheet('AKC_FASTCAT', 'entry', AKCFastCatEntryScoresheet);
