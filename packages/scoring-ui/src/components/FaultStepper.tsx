/**
 * FaultStepper -- "Faults [-] 0 [+]" on one row, with 44px steppers (MYK9-1501,
 * MYK9-140). Shared by every scent-work sheet so the faults control is the same
 * size and shape everywhere.
 *
 * `max` is the registry's fault limit (ASCA); at the limit the + stops and the
 * note says why.
 */

import React from 'react';
import { cn } from '@myk9/ui';
import { haptic } from '../hooks/useHapticFeedback';

const stepperClass =
  'flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-border bg-primary text-xl font-semibold text-primary-foreground transition-all duration-200 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40';

export interface FaultStepperProps {
  value: number;
  onChange: (count: number) => void;
  /** Registry fault limit; omit for no limit. */
  max?: number | undefined;
  /** Shown under the row when the limit is reached ("At maximum faults for Novice level"). */
  maxNote?: string | undefined;
  /** Test ids kept per sport so existing suites keep finding their controls. */
  testIds?: { decrement?: string; increment?: string; count?: string };
  className?: string;
}

export const FaultStepper: React.FC<FaultStepperProps> = ({
  value,
  onChange,
  max,
  maxNote,
  testIds,
  className,
}) => {
  const hasMax = max !== undefined && Number.isFinite(max);
  const atMax = hasMax && value >= max;
  return (
    <div className={className}>
      <div className="flex min-h-12 items-center justify-between gap-3">
        <span className="text-base font-semibold">
          Faults
          {hasMax && (
            <span className="text-sm font-normal text-muted-foreground"> (max {max})</span>
          )}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={stepperClass}
            onClick={() => {
              haptic.light();
              onChange(Math.max(0, value - 1));
            }}
            disabled={value === 0}
            aria-label="Remove a fault"
            data-testid={testIds?.decrement}
          >
            -
          </button>
          <span
            className={cn(
              'w-8 text-center text-2xl font-bold tabular-nums',
              atMax && 'text-red-500'
            )}
            data-testid={testIds?.count}
            aria-live="polite"
          >
            {value}
          </span>
          <button
            type="button"
            className={stepperClass}
            onClick={() => {
              haptic.light();
              onChange(value + 1);
            }}
            disabled={atMax}
            aria-label="Add a fault"
            title={atMax ? `Maximum ${max} faults allowed` : undefined}
            data-testid={testIds?.increment}
          >
            +
          </button>
        </div>
      </div>
      {atMax && maxNote && <div className="text-sm font-medium text-red-500">{maxNote}</div>}
    </div>
  );
};
