import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DateTimePickerProps {
  value?: Date | undefined;
  onChange?: ((date: Date | undefined) => void) | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  minDate?: Date | undefined;
  maxDate?: Date | undefined;
  disabled?: boolean | undefined;
  /** Month the calendar opens to when no value is selected. */
  defaultMonth?: Date | undefined;
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
  'aria-invalid'?: boolean | undefined;
  'aria-describedby'?: string | undefined;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date',
  className,
  minDate,
  maxDate,
  disabled = false,
  defaultMonth,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value);

  // Sync internal state when value prop changes using render-time sync
  const valueKey = value?.getTime() || 'undefined';
  const [prevValueKey, setPrevValueKey] = useState(valueKey);
  if (valueKey !== prevValueKey) {
    setPrevValueKey(valueKey);
    setSelectedDate(value);
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      onChange?.(undefined);
      return;
    }

    // Picking a day keeps the time the value already had (8:00 AM for a new one), so a date
    // change never moves a time that was set elsewhere.
    date.setHours(selectedDate?.getHours() ?? 8, selectedDate?.getMinutes() ?? 0);

    setSelectedDate(date);
    onChange?.(date);
  };

  const formatDisplay = () => {
    if (!selectedDate) return '';
    return format(selectedDate, 'MMM d, yyyy');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild nativeButton>
        <Button
          {...(id !== undefined && { id })}
          {...(ariaInvalid !== undefined && { 'aria-invalid': ariaInvalid })}
          {...(ariaDescribedBy !== undefined && { 'aria-describedby': ariaDescribedBy })}
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal aria-invalid:border-destructive',
            !selectedDate && 'text-muted-foreground',
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {selectedDate ? formatDisplay() : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="single"
            selected={selectedDate}
            defaultMonth={(selectedDate ?? defaultMonth) as Date}
            onSelect={handleDateSelect}
            disabled={date => (minDate && date < minDate) || (maxDate && date > maxDate) || false}
            initialFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateTimePicker;
