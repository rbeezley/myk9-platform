import React, { useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarIcon, Clock } from 'lucide-react';
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
  showTime?: boolean | undefined;
  timeFormat?: '12h' | '24h' | undefined;
  /** Default time shown when no value is set (e.g. "5:00 PM"). Defaults to "8:00 AM". */
  defaultTime?: string | undefined;
  /** Month the calendar opens to when no value is selected. */
  defaultMonth?: Date | undefined;
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  placeholder = 'Pick a date and time',
  className,
  minDate,
  maxDate,
  disabled = false,
  showTime = true,
  timeFormat = '12h',
  defaultTime = '8:00 AM',
  defaultMonth,
  id,
}) => {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value);
  const [timeValue, setTimeValue] = useState(
    value ? format(value, timeFormat === '12h' ? 'hh:mm a' : 'HH:mm') : defaultTime
  );

  // Sync internal state when value prop changes using render-time sync
  const valueKey = value?.getTime() || 'undefined';
  const [prevValueKey, setPrevValueKey] = useState(valueKey);
  if (valueKey !== prevValueKey) {
    setPrevValueKey(valueKey);
    setSelectedDate(value);
    setTimeValue(value ? format(value, timeFormat === '12h' ? 'hh:mm a' : 'HH:mm') : defaultTime);
  }

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      setSelectedDate(undefined);
      onChange?.(undefined);
      return;
    }

    // Parse time from input
    const time = parseTime(timeValue, timeFormat);
    if (time) {
      date.setHours(time.hours);
      date.setMinutes(time.minutes);
    }

    setSelectedDate(date);
    onChange?.(date);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimeValue(newTime);

    if (selectedDate) {
      const time = parseTime(newTime, timeFormat);
      if (time) {
        const newDate = new Date(selectedDate);
        newDate.setHours(time.hours);
        newDate.setMinutes(time.minutes);
        onChange?.(newDate);
      }
    }
  };

  const parseTime = (timeStr: string, format: '12h' | '24h') => {
    if (format === '12h') {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        const period = match[3]?.toUpperCase();

        if (period === 'PM' && hours !== 12) hours += 12;
        if (period === 'AM' && hours === 12) hours = 0;

        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          return { hours, minutes };
        }
      }
    } else {
      const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
      if (match) {
        const hours = parseInt(match[1]);
        const minutes = parseInt(match[2]);
        if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
          return { hours, minutes };
        }
      }
    }
    return null;
  };

  const formatDisplay = () => {
    if (!selectedDate) return '';
    const dateStr = format(selectedDate, 'MMM d, yyyy');
    if (showTime) {
      const timeStr = format(selectedDate, timeFormat === '12h' ? 'h:mm a' : 'HH:mm');
      return `${dateStr} at ${timeStr}`;
    }
    return dateStr;
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild nativeButton>
        <Button
          {...(id !== undefined && { id })}
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
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
          {showTime && (
            <div className="border-t mt-3 pt-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={timeValue}
                  onChange={handleTimeChange}
                  placeholder={timeFormat === '12h' ? '8:00 AM' : '08:00'}
                  className="flex-1"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Format: {timeFormat === '12h' ? 'hh:mm AM/PM' : 'HH:mm'}
              </p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateTimePicker;
