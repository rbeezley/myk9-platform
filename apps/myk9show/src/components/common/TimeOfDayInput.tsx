import React from 'react';
import { Input } from '@/components/ui/input';
import { normalizeTimeOfDay } from '@/components/trials/trialDateTime';

interface TimeOfDayInputProps extends Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type'
> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * A clock time typed as text ("9:15pm"). On leaving the field it settles into the
 * one spelling the rest of the app reads and writes, "9:15 PM" (MYK9-931, M1).
 * Entering the field selects its time, so typing a new one replaces it rather than
 * appending to it ("01:00 PM08:00 AM", MYK9-832).
 */
export const TimeOfDayInput: React.FC<TimeOfDayInputProps> = ({
  value,
  onChange,
  onBlur,
  onFocus,
  onMouseUp,
  placeholder = 'e.g., 9:15 AM',
  ...rest
}) => (
  <Input
    {...rest}
    value={value}
    placeholder={placeholder}
    onChange={e => onChange(e.target.value)}
    onFocus={e => {
      e.currentTarget.select();
      onFocus?.(e);
    }}
    // The click that focused the field would otherwise drop the selection on mouseup.
    onMouseUp={e => {
      e.preventDefault();
      onMouseUp?.(e);
    }}
    onBlur={e => {
      const normalized = normalizeTimeOfDay(e.target.value);
      if (normalized !== e.target.value) onChange(normalized);
      onBlur?.(e);
    }}
  />
);
