/**
 * ManualTimeField -- the typed-time row under the timer (MYK9-1501).
 *
 * The judge may type a time instead of (or to correct) the stopwatch, so this
 * stays on every sheet, one tap away whenever the timer is stopped. One compact
 * row of about 48px: label, input, Max, and a clear button once there is a time.
 * Multi-area classes render one per area.
 */

import React from 'react';
import { Input } from '@myk9/ui';

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
  <div className="flex min-h-12 items-center gap-2 rounded-xl border border-border bg-card px-3 py-0.5">
    {label && (
      <label
        htmlFor={inputId}
        className="flex-shrink-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        {label}
      </label>
    )}
    <div className="relative min-w-0 flex-1">
      <Input
        id={inputId}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="0:00.00"
        className="h-11 rounded-lg border-2 pr-11 text-center font-mono text-base font-medium focus:border-primary"
        aria-label={ariaLabel}
        data-testid={testId}
      />
      {value && (
        <button
          type="button"
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label={`Clear ${ariaLabel}`}
          onClick={() => onChange('')}
        >
          <span aria-hidden="true" className="text-xl leading-none">
            ×
          </span>
        </button>
      )}
    </div>
    {maxLabel !== undefined && (
      <span className="flex-shrink-0 text-xs text-muted-foreground">Max: {maxLabel}</span>
    )}
  </div>
);
