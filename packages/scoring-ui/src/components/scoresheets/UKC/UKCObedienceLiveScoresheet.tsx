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
import { Button, Input, Card, cn } from '@myk9/ui';
import { ScoresheetShell } from '../../ScoresheetShell';
import { ScoreConfirmationDialog } from '../../ScoreConfirmationDialog';
import { resultLabel } from '../../../utils/resultLabel';
import { formatScoresheetSubtitle } from '../../../utils/scoresheetSubtitle';
import { useScoresheetScoring } from '../../../hooks/useScoresheetScoring';
import { useScoresheetLeave } from '../../../hooks/useScoresheetLeave';
import { registerScoresheet } from '../../../utils/getScoresheetComponent';
import { DQ_ACTIVE_CLASS, DisqualifyReason } from '../../DisqualifyReason';
import type { LiveScoresheetProps } from '../../../types';

const POINTS_REGEX = /^\d{0,3}(\.\d{0,1})?$/;
const QUALIFYING_THRESHOLD = 170;

type ObedienceResult = 'Q' | 'NQ' | 'EX' | 'DQ';

const RESULT_OPTIONS: { value: ObedienceResult; label: string; activeClass: string }[] = [
  {
    value: 'Q',
    label: resultLabel('Q'),
    activeClass: 'bg-green-600 hover:bg-green-700 border-green-600',
  },
  {
    value: 'NQ',
    label: resultLabel('NQ'),
    activeClass: 'bg-amber-500 hover:bg-amber-600 border-amber-500',
  },
  {
    value: 'EX',
    label: resultLabel('EX'),
    activeClass: 'bg-gray-500 hover:bg-gray-600 border-gray-500',
  },
  { value: 'DQ', label: resultLabel('DQ'), activeClass: DQ_ACTIVE_CLASS },
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
  backLabel,
  onDirtyChange,
  headerActions,
}) => {
  const [points, setPoints] = useState(() => {
    const existing = entry.existingScore?.points;
    return existing != null && existing > 0 ? String(existing) : '';
  });
  const [initialPoints] = useState(points);
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
    if (result === 'DQ') {
      // Entering DQ starts a fresh reason; re-tapping it keeps what was typed.
      if (manualResult !== 'DQ') scoring.setNonQualifyingReason('');
      scoring.setQualifying('DQ');
    } else if (result === 'EX') {
      scoring.setQualifying('EX');
      scoring.setNonQualifyingReason('Excused');
    } else if (result === 'Q') {
      scoring.setQualifying('Q');
      scoring.setNonQualifyingReason('');
    } else {
      scoring.setQualifying('NQ');
    }
  };

  const handleSubmitClick = () => {
    if (!points || scoring.disqualifyReasonMissing) return;
    setShowConfirmation(true);
  };

  const handleConfirmSubmit = async () => {
    if (scoring.disqualifyReasonMissing) return;
    const pts = parseFloat(points) || 0;
    const deductions = Math.max(0, 200 - pts);
    // Build ScoreData directly: the result is the sheet's own (Q/NQ/EX/DQ) code
    const scoreData = scoring.buildScoreData({
      points: pts,
      faultCount: deductions,
      resultText: effectiveResult,
      nonQualifyingReason:
        effectiveResult !== 'Q' ? scoring.nonQualifyingReason.trim() || undefined : undefined,
    });
    try {
      await onSubmit(scoreData);
    } finally {
      setShowConfirmation(false);
    }
  };

  const { upButton } = useScoresheetLeave({
    scoring,
    extraDirty: () => manualResult !== null || points !== initialPoints,
    onBack,
    backLabel,
    onDirtyChange,
  });

  return (
    <>
      <ScoresheetShell
        header={{
          upButton,
          armband: entry.armband,
          dogName: entry.dogName,
          breed: entry.breed,
          handlerName: entry.handlerName,
          titleLines: ['UKC Obedience'],
          subtitle: `${classInfo.element} ${classInfo.level}`,
          headerActions,
        }}
        actions={{
          onCancel: onBack,
          onSave: handleSubmitClick,
          saveDisabled: scoring.isSubmitting || !points || scoring.disqualifyReasonMissing,
          isSubmitting: scoring.isSubmitting,
        }}
      >
        {/* Score Input */}
        <Card className="p-3">
          <div className="space-y-2 text-center">
            <label
              htmlFor="obedience-points"
              className="block text-sm font-medium text-muted-foreground"
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
              className="mx-auto h-14 max-w-[200px] text-center font-mono text-4xl font-bold"
              autoFocus
              data-testid="points-input"
            />
            <div className="text-sm text-muted-foreground">out of 200.0</div>

            {/* Auto-qualifying badge */}
            {points && (
              <div
                className={cn(
                  'inline-block rounded-full px-4 py-1 text-sm font-medium',
                  autoResult === 'Q'
                    ? 'bg-green-500/10 text-green-600'
                    : 'bg-red-500/10 text-red-600'
                )}
                data-testid="auto-qualify-badge"
              >
                {autoResult === 'Q' ? 'Qualifying (170+ required)' : 'Non-Qualifying (below 170)'}
              </div>
            )}
          </div>
        </Card>

        {/* Validation warning */}
        {!points && (
          <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-center text-sm text-amber-600">
            Score points are required to submit
          </div>
        )}

        {/* Result Buttons */}
        <Card className="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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

          {effectiveResult === 'DQ' && (
            <DisqualifyReason
              sportType="UKC_OBEDIENCE"
              reason={scoring.nonQualifyingReason}
              onReasonChange={scoring.setNonQualifyingReason}
            />
          )}

          {/* NQ/EX reason input */}
          {effectiveResult !== 'Q' && effectiveResult !== 'DQ' && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason:</label>
              <textarea
                value={scoring.nonQualifyingReason}
                onChange={e => scoring.setNonQualifyingReason(e.target.value)}
                placeholder={`Enter reason for ${effectiveResult}...`}
                rows={2}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
                data-testid="nq-reason-input"
              />
            </div>
          )}
        </Card>
      </ScoresheetShell>

      {showConfirmation && (
        // INTENT: the Score Confirmation is the read-back the judge copies onto the
        // paper scoresheet. Do not remove it, skip it or auto-dismiss it (MYK9-1501).
        <ScoreConfirmationDialog
          subtitle={formatScoresheetSubtitle(classInfo)}
          armband={entry.armband}
          dogName={entry.dogName}
          handlerName={entry.handlerName}
          result={effectiveResult}
          rows={[{ label: 'Score', value: `${points || '0'} / 200.0`, mono: true }]}
          reason={scoring.nonQualifyingReason}
          isSubmitting={scoring.isSubmitting}
          onCancel={() => setShowConfirmation(false)}
          onConfirm={handleConfirmSubmit}
        />
      )}
    </>
  );
};

registerScoresheet('UKC_OBEDIENCE', 'live', UKCObedienceLiveScoresheet);
