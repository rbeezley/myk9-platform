/**
 * ScoreConfirmationDialog -- the read-back every sport's Save opens (MYK9-1501).
 *
 * INTENT: this is the read-back the judge copies onto the paper scoresheet, so
 * it must not be removed, skipped or auto-dismissed. It is deliberate and is not
 * the "Are you sure?" popup docs/INTENT.md warns against: it shows the whole
 * score (result in words, every time, faults, any reason) for the judge to
 * check against the sheet, then Confirm & Submit.
 *
 * One component so every sport reads back the same words, the same reasons and
 * the same layout, and the longest case (a DQ with a reason, or a multi-area
 * class) still fits a 375 x 667 phone.
 */

import React, { type ReactNode } from 'react';
import { Button, Card, cn } from '@myk9/ui';
import { resultLabel } from '../utils/resultLabel';

export interface ConfirmationRow {
  label: string;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}

/**
 * Time rows for the read-back: one per area plus the total when the class has
 * several areas, a single row otherwise.
 */
export function timeRows(
  areas: { areaName: string; time: string }[],
  totalTime: string,
  singleLabel = 'Time'
): ConfirmationRow[] {
  if (areas.length < 2) return [{ label: singleLabel, value: totalTime, mono: true }];
  return [
    ...areas.map(a => ({ label: a.areaName, value: a.time || '--', mono: true })),
    { label: 'Total time', value: totalTime, mono: true },
  ];
}

const RESULT_CLASS: Record<string, string> = {
  Q: 'text-primary',
  NQ: 'text-red-600',
  ABS: 'text-purple-600',
  EX: 'text-red-700',
  DQ: 'font-bold text-zinc-900 dark:text-zinc-100',
};

export interface ScoreConfirmationDialogProps {
  subtitle: string;
  armband: number | string;
  dogName: string;
  handlerName: string;
  /** Result code (Q, NQ, ABS, EX, DQ) or a placement; shown in words. */
  result: string | null | undefined;
  /** Shown beside the result, e.g. a placement ("Qualified / 1st"). */
  resultSuffix?: string | undefined;
  /** Times, faults and points, in the order the judge writes them down. */
  rows: ConfirmationRow[];
  /** The NQ, Excused or DQ reason; shown whenever one was recorded for those results. */
  reason?: string | undefined;
  /** Extra read-back below the rows (Nationals' area breakdown). */
  children?: ReactNode;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ScoreConfirmationDialog: React.FC<ScoreConfirmationDialogProps> = ({
  subtitle,
  armband,
  dogName,
  handlerName,
  result,
  resultSuffix,
  rows,
  reason,
  children,
  isSubmitting,
  onCancel,
  onConfirm,
}) => {
  const showReason =
    (result === 'NQ' || result === 'EX' || result === 'DQ') && Boolean(reason?.trim());
  const allRows: ConfirmationRow[] = [
    { label: 'Result', value: resultLabel(result) + (resultSuffix ? ` / ${resultSuffix}` : '') },
    ...rows,
    ...(showReason
      ? [{ label: `${resultLabel(result)} Reason`, value: reason?.trim(), className: 'text-right' }]
      : []),
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm"
      data-testid="confirmation-dialog"
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="score-confirmation-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md space-y-3 overflow-y-auto p-4 animate-in fade-in zoom-in-95"
      >
        <div>
          <h2 id="score-confirmation-title" className="text-xl font-semibold">
            Score Confirmation
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-2">
          <div className="flex h-10 min-w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary px-2 shadow-sm">
            <span className="text-sm font-bold text-primary-foreground">{armband}</span>
          </div>
          <div className="min-w-0">
            <div className="truncate font-medium">{dogName}</div>
            <div className="truncate text-xs text-muted-foreground">Handler: {handlerName}</div>
          </div>
        </div>

        <div>
          {allRows.map((row, i) => (
            <div
              key={`${row.label}-${i}`}
              className="flex justify-between gap-4 border-b border-border py-1.5"
            >
              <span className="flex-shrink-0 text-muted-foreground">{row.label}</span>
              <span
                className={cn(
                  'font-semibold',
                  row.mono && 'font-mono',
                  row.label === 'Result' && result && RESULT_CLASS[result],
                  row.className
                )}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {children}

        <div className="flex gap-3 pt-1">
          <Button variant="outline" className="h-12 flex-1" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="h-12 flex-1"
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="confirm-submit-btn"
          >
            {isSubmitting ? 'Submitting...' : 'Confirm & Submit'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
