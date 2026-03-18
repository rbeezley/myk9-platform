import React, { useState, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarIcon, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface DateRangePickerProps {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  startLabel?: string | undefined;
  endLabel?: string | undefined;
  placeholder?: string | undefined;
  className?: string | undefined;
  disabled?: boolean | undefined;
  showTime?: boolean | undefined;
  startDefaultTime?: string | undefined;
  endDefaultTime?: string | undefined;
  minDate?: Date | undefined;
}

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const period = match[3]?.toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
    return { hours, minutes };
  }
  return null;
}

function applyTime(date: Date, timeStr: string): Date {
  const d = new Date(date);
  const time = parseTime(timeStr);
  if (time) {
    d.setHours(time.hours, time.minutes, 0, 0);
  }
  return d;
}

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'Start',
  endLabel = 'End',
  placeholder = 'Select date range',
  className,
  disabled = false,
  showTime = true,
  startDefaultTime = '8:00 AM',
  endDefaultTime = '5:00 PM',
  minDate,
}) => {
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState(
    startDate ? format(startDate, 'h:mm a') : startDefaultTime
  );
  const [endTime, setEndTime] = useState(endDate ? format(endDate, 'h:mm a') : endDefaultTime);

  // Sync time displays when props change
  const startKey = startDate?.getTime() || 0;
  const endKey = endDate?.getTime() || 0;
  const [prevStartKey, setPrevStartKey] = useState(startKey);
  const [prevEndKey, setPrevEndKey] = useState(endKey);
  if (startKey !== prevStartKey) {
    setPrevStartKey(startKey);
    if (startDate) setStartTime(format(startDate, 'h:mm a'));
  }
  if (endKey !== prevEndKey) {
    setPrevEndKey(endKey);
    if (endDate) setEndTime(format(endDate, 'h:mm a'));
  }

  const handleRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      if (!range) {
        onStartDateChange(undefined);
        onEndDateChange(undefined);
        return;
      }
      if (range.from) {
        onStartDateChange(applyTime(range.from, startTime));
      }
      if (range.to) {
        onEndDateChange(applyTime(range.to, endTime));
      } else if (range.from && !range.to) {
        // Single date selected — clear end
        onEndDateChange(undefined);
      }
    },
    [onStartDateChange, onEndDateChange, startTime, endTime]
  );

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartTime(e.target.value);
    if (startDate) {
      const updated = applyTime(startDate, e.target.value);
      onStartDateChange(updated);
    }
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndTime(e.target.value);
    if (endDate) {
      const updated = applyTime(endDate, e.target.value);
      onEndDateChange(updated);
    }
  };

  const formatDisplay = () => {
    if (!startDate && !endDate) return '';
    const parts: string[] = [];
    if (startDate) {
      const dateStr = format(startDate, 'MMM d, yyyy');
      parts.push(showTime ? `${dateStr} at ${format(startDate, 'h:mm a')}` : dateStr);
    }
    parts.push('→');
    if (endDate) {
      const dateStr = format(endDate, 'MMM d, yyyy');
      parts.push(showTime ? `${dateStr} at ${format(endDate, 'h:mm a')}` : dateStr);
    } else {
      parts.push('...');
    }
    return parts.join(' ');
  };

  const displayText = formatDisplay();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !displayText && 'text-muted-foreground',
            className
          )}
          disabled={disabled}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayText || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto max-h-[80vh] overflow-y-auto p-0"
        align="start"
        side="bottom"
        sideOffset={8}
      >
        <div className="p-3">
          <Calendar
            mode="range"
            selected={{ from: startDate, to: endDate }}
            defaultMonth={startDate as Date}
            onSelect={handleRangeSelect}
            disabled={date => (minDate && date < minDate) || false}
            numberOfMonths={2}
            initialFocus
          />
          {showTime && (
            <div className="border-t mt-3 pt-3 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{startLabel} time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={startTime}
                    onChange={handleStartTimeChange}
                    placeholder="8:00 AM"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{endLabel} time</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    value={endTime}
                    onChange={handleEndTimeChange}
                    placeholder="5:00 PM"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
