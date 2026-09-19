import React, { useState, useCallback } from 'react';
import type { DateRange } from 'react-day-picker';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CalendarIcon, Clock, X } from 'lucide-react';
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
  /** id on the trigger button so a sibling <label htmlFor> connects for a11y. */
  id?: string | undefined;
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
  id,
}) => {
  const startTimeId = id ? `${id}-start-time` : undefined;
  const endTimeId = id ? `${id}-end-time` : undefined;
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState(
    startDate ? format(startDate, 'h:mm a') : startDefaultTime
  );
  const [endTime, setEndTime] = useState(endDate ? format(endDate, 'h:mm a') : endDefaultTime);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>({
    from: startDate,
    to: endDate,
  });

  // Sync time displays when props change
  const startKey = startDate?.getTime() || 0;
  const endKey = endDate?.getTime() || 0;
  const [prevStartKey, setPrevStartKey] = useState(startKey);
  const [prevEndKey, setPrevEndKey] = useState(endKey);
  if (startKey !== prevStartKey) {
    setPrevStartKey(startKey);
    if (startDate) setStartTime(format(startDate, 'h:mm a'));
    setDraftRange(current => ({ from: startDate, to: current?.to }));
  }
  if (endKey !== prevEndKey) {
    setPrevEndKey(endKey);
    if (endDate) setEndTime(format(endDate, 'h:mm a'));
    setDraftRange(current => ({ from: current?.from, to: endDate }));
  }

  const handleRangeSelect = useCallback(
    (range: DateRange | undefined) => {
      if (!range) {
        return;
      }
      const nextRange: DateRange = {
        from: range.from ? applyTime(range.from, startTime) : undefined,
        to: range.to ? applyTime(range.to, endTime) : undefined,
      };
      setDraftRange(nextRange);
      if (range.from) {
        onStartDateChange(nextRange.from);
      }
      if (range.to) {
        onEndDateChange(nextRange.to);
      } else if (range.from && !range.to) {
        onEndDateChange(undefined);
      }
    },
    [onStartDateChange, onEndDateChange, startTime, endTime]
  );

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartTime(e.target.value);
    if (startDate) {
      onStartDateChange(applyTime(startDate, e.target.value));
    }
  };

  const handleEndTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndTime(e.target.value);
    if (endDate) {
      onEndDateChange(applyTime(endDate, e.target.value));
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
  const calendarDefaultMonth = draftRange?.from ?? startDate ?? minDate;

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onStartDateChange(undefined);
    onEndDateChange(undefined);
    setStartTime(startDefaultTime);
    setEndTime(endDefaultTime);
    setDraftRange(undefined);
  };

  return (
    <>
      <div className="relative w-full">
        <Button
          {...(id !== undefined && { id })}
          variant="outline"
          className={cn(
            'w-full justify-start text-left font-normal',
            !displayText && 'text-muted-foreground',
            displayText && 'pr-8',
            className
          )}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {displayText || placeholder}
        </Button>
        {displayText && !disabled && (
          <button
            type="button"
            aria-label="Clear dates"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-3xl flex-col gap-0 overflow-hidden rounded-xl bg-popover p-0 shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-2rem)]">
          <DialogHeader className="shrink-0 border-b px-4 pb-3 pt-4 text-left sm:px-6 sm:pt-5">
            <DialogTitle className="pr-8 text-lg">Choose a date range</DialogTitle>
          </DialogHeader>
          <div
            data-testid="date-range-picker-scroll-body"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
          >
            <DialogDescription className="max-w-2xl">
              Select the first date for the start of your range, then select the last date for the
              end. Both panes are one continuous calendar. Use the Previous Month and Next Month
              buttons to move through the calendar.
            </DialogDescription>
            <div
              role="group"
              aria-label="Date range key"
              className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full bg-primary ring-2 ring-primary/30"
                />
                Start
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full bg-secondary ring-2 ring-secondary/60"
                />
                End
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="h-4 w-4 rounded-sm bg-accent" />
                Dates in between
              </span>
            </div>

            <Calendar
              mode="range"
              selected={draftRange}
              {...(calendarDefaultMonth ? { defaultMonth: calendarDefaultMonth } : {})}
              onSelect={handleRangeSelect}
              disabled={date => (minDate && date < minDate) || false}
              numberOfMonths={2}
              classNames={{
                range_start:
                  'range_start day-range-start [&>button]:font-semibold [&>button]:ring-2 [&>button]:ring-primary [&>button]:ring-offset-1',
                range_end:
                  'range_end day-range-end [&>button]:font-semibold [&>button]:ring-2 [&>button]:ring-secondary [&>button]:ring-offset-1',
              }}
              initialFocus
            />

            {showTime && (
              <div className="mt-3 grid grid-cols-2 gap-4 border-t pt-3">
                <div className="space-y-1">
                  <Label
                    {...(startTimeId !== undefined && { htmlFor: startTimeId })}
                    className="text-xs text-muted-foreground"
                  >
                    {startLabel} time
                  </Label>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input
                      {...(startTimeId !== undefined && { id: startTimeId })}
                      type="text"
                      value={startTime}
                      onChange={handleStartTimeChange}
                      placeholder="8:00 AM"
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label
                    {...(endTimeId !== undefined && { htmlFor: endTimeId })}
                    className="text-xs text-muted-foreground"
                  >
                    {endLabel} time
                  </Label>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Input
                      {...(endTimeId !== undefined && { id: endTimeId })}
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

          <DialogFooter
            data-testid="date-range-picker-footer"
            className="shrink-0 border-t px-4 py-3 sm:px-6"
          >
            <Button size="sm" onClick={() => setOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
