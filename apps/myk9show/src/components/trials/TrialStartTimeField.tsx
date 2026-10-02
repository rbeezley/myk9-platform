import React from 'react';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/common/RequiredMark';
import { TimeOfDayInput } from '@/components/common/TimeOfDayInput';
import { cn } from '@/lib/utils';

interface TrialStartTimeFieldProps {
  id: string;
  /** The raw text in the box. It goes straight to the form so validation sees what is visible. */
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  onBlur?: (() => void) | undefined;
}

/**
 * A trial's start time: one text field for both the wizard trial card and Edit
 * Trial (MYK9-931, M1). Valid times settle to "09:00 AM" on leaving the box;
 * empty and invalid text are kept as typed and reach validation untouched.
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
    <TimeOfDayInput
      id={id}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      aria-invalid={!!error}
      aria-describedby={error ? `${id}-error` : undefined}
      className={cn(error && 'border-destructive')}
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )}
  </div>
);
