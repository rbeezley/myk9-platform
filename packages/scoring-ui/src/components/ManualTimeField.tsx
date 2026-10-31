/**
 * ManualTimeField -- the typed-time row under the timer (MYK9-1501).
 *
 * The text goes through the shared DurationInput (MYK9-1503): digits fill from the
 * right, a live line says what was understood, and the stored value stays the
 * stopwatch's "m:ss.cc". Text that is not yet a time is held as typed so the
 * sheet can refuse to submit it.
 *
 * The judge may type a time instead of (or to correct) the stopwatch, so this
 * stays on every sheet, one tap away whenever the timer is stopped. One compact
 * row of about 48px: label, input, Max, and a clear button once there is a time.
 * Multi-area classes render one per area.
 */

import React from 'react';
import { DurationInput } from './DurationInput';

export interface ManualTimeFieldProps {
  /** Visible label ("Area 1", "Recorded time"). Omit for a single unlabelled area. */
  label?: string | undefined;
  value: string;
  onChange: (value: string) => void;
  /** Accessible name for the input; also names the clear button. */
  ariaLabel: string;
  /** "3:00" or "Not set"; omit when the sheet has no per-area max. */
  maxLabel?: string | undefined;
  inputId?: string;
  testId?: string;
}

export const ManualTimeField: React.FC<ManualTimeFieldProps> = ({
  label,
  value,
  onChange,
  ariaLabel,
  maxLabel,
  inputId,
  testId,
}) => (
  <div className="flex min-h-12 items-start gap-2 rounded-xl border border-border bg-card px-3 py-0.5">
    {label && (
      <label
        htmlFor={inputId}
        className="flex h-11 flex-shrink-0 items-center text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
    )}
    <DurationInput
      kind="search"
      id={inputId}
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      testId={testId}
      clearLabel={`Clear ${ariaLabel}`}
      className="h-11 rounded-lg border-2 pr-11 text-center font-mono text-base font-medium focus:border-primary"
    />
    {maxLabel !== undefined && (
      <span className="flex h-11 flex-shrink-0 items-center text-xs text-muted-foreground">
        Max: {maxLabel}
      </span>
    )}
  </div>
);
