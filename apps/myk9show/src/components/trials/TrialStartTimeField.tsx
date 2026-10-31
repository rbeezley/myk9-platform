import React from 'react';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/common/RequiredMark';
import { ClockTimeInput } from '@myk9/scoring-ui';
import { FieldError } from '@/components/forms';

interface TrialStartTimeFieldProps {
  id: string;
  /** The raw text in the box. It goes straight to the form so validation sees what is visible. */
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  onBlur?: (() => void) | undefined;
}

/**
 * A trial's start time: one smart clock-time field for both the wizard trial card
 * and Edit Trial (MYK9-931, M1; MYK9-1504). Valid times are stored as "09:00 AM";
 * empty and unresolved text are kept as typed and reach validation untouched.
 */
export const TrialStartTimeField: React.FC<TrialStartTimeFieldProps> = ({
  id,
  value,
  onChange,
  error,
  onBlur,
}) => (
  <div className="space-y-2" data-testid="trial-start-time-field">
    <Label htmlFor={id}>
      Start Time
      <RequiredMark />
    </Label>
    <ClockTimeInput
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      invalid={!!error}
      describedBy={error ? `${id}-error` : undefined}
      className={error ? 'h-11 border-destructive text-base' : undefined}
    />
    <FieldError field={id} message={error} />
  </div>
);
