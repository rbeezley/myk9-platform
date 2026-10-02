import React from 'react';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/common/RequiredMark';
import { cn } from '@/lib/utils';

interface TrialDateTimeFieldProps {
  id: string;
  value: Date | undefined;
  onChange: (date: Date | undefined, meta?: { timeSet: boolean }) => void;
  error?: string | undefined;
  minDate?: Date | undefined;
  maxDate?: Date | undefined;
  defaultMonth?: Date | undefined;
  onBlur?: (() => void) | undefined;
  /** The date is known but the start time is not (shows "time not set"). */
  timeUnset?: boolean | undefined;
}

/**
 * A trial's date and start time: the ONE control for both the creation wizard's
 * trial card and Edit Trial (MYK9-931, M1). Edit used a calendar plus a free-text
 * time box for what the wizard asks in a single picker.
 */
export const TrialDateTimeField: React.FC<TrialDateTimeFieldProps> = ({
  id,
  value,
  onChange,
  error,
  minDate,
  maxDate,
  defaultMonth,
  onBlur,
  timeUnset,
}) => (
  <div className="space-y-2" data-testid="trial-date-time-field" onBlur={onBlur}>
    <Label htmlFor={id}>
      Trial Date &amp; Time
      <RequiredMark />
    </Label>
    <DateTimePicker
      id={id}
      value={value}
      onChange={onChange}
      placeholder="Pick trial date and time"
      className={cn('h-10', error && 'border-destructive')}
      minDate={minDate}
      maxDate={maxDate}
      defaultMonth={defaultMonth}
      showTime
      timeUnset={timeUnset}
      timeFormat="12h"
    />
    {error && (
      <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
        {error}
      </p>
    )}
  </div>
);
