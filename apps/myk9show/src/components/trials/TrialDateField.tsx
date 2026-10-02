import React from 'react';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/common/RequiredMark';
import { cn } from '@/lib/utils';

interface TrialDateFieldProps {
  id: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  error?: string | undefined;
  minDate?: Date | undefined;
  maxDate?: Date | undefined;
  defaultMonth?: Date | undefined;
  onBlur?: (() => void) | undefined;
}

/**
 * A trial's DATE: one date-only control for both the creation wizard's trial card
 * and Edit Trial (MYK9-931, M1). The start time is its own field
 * (`TrialStartTimeField`), so a date change can never touch, invent or hide a time.
 */
export const TrialDateField: React.FC<TrialDateFieldProps> = ({
  id,
  value,
  onChange,
  error,
  minDate,
  maxDate,
  defaultMonth,
  onBlur,
}) => (
  <div className="space-y-2" data-testid="trial-date-field" onBlur={onBlur}>
    <Label htmlFor={id}>
      Trial Date
      <RequiredMark />
    </Label>
    <DateTimePicker
      id={id}
      value={value}
      onChange={onChange}
      placeholder="Pick trial date"
      className={cn('h-10', error && 'border-destructive')}
      minDate={minDate}
      maxDate={maxDate}
      defaultMonth={defaultMonth}
      showTime={false}
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )}
  </div>
);
