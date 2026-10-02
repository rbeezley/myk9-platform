import React from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import { RequiredMark } from '@/components/common/RequiredMark';

interface ShowDatesFieldsProps {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
  entryOpenDate?: Date | undefined;
  entryCloseDate?: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onEntryOpenChange: (date: Date | undefined) => void;
  onEntryCloseChange: (date: Date | undefined) => void;
  /** Shown under the show dates, e.g. "Start date must be before end date". */
  datesError?: string | undefined;
  /** Shown under the entry period. */
  entryError?: string | undefined;
}

/**
 * Show dates and the entry period: the ONE date control, used by the creation
 * wizard and by Edit Show alike (MYK9-931, M1). Create used a range picker while
 * edit used four separate date-time pickers for the same four values.
 */
export const ShowDatesFields: React.FC<ShowDatesFieldsProps> = ({
  startDate,
  endDate,
  entryOpenDate,
  entryCloseDate,
  onStartDateChange,
  onEndDateChange,
  onEntryOpenChange,
  onEntryCloseChange,
  datesError,
  entryError,
}) => (
  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div className="space-y-2 md:col-span-2" data-testid="show-dates-field">
      <Label htmlFor="show-dates">
        Show Dates
        <RequiredMark />
      </Label>
      <DateRangePicker
        id="show-dates"
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={onStartDateChange}
        onEndDateChange={onEndDateChange}
        startLabel="Start"
        endLabel="End"
        placeholder="Select show start and end dates"
        startDefaultTime="8:00 AM"
        endDefaultTime="5:00 PM"
      />
      {datesError && (
        <p id="show-dates-error" role="alert" className="text-sm text-destructive mt-1">
          {datesError}
        </p>
      )}
    </div>

    <div className="space-y-2 md:col-span-2" data-testid="show-entry-period-field">
      {/* MYK9-716: a draft may be saved without an entry window; publishing
          requires one, so the field says so instead of carrying an asterisk. */}
      <Label htmlFor="show-entry-period">Entry Period</Label>
      <p className="text-sm text-muted-foreground">Needed before the show can be published.</p>
      <DateRangePicker
        id="show-entry-period"
        startDate={entryOpenDate}
        endDate={entryCloseDate}
        onStartDateChange={onEntryOpenChange}
        onEndDateChange={onEntryCloseChange}
        startLabel="Opens"
        endLabel="Closes"
        placeholder="Select entry open and close dates"
        startDefaultTime="8:00 AM"
        endDefaultTime="11:59 PM"
      />
      {entryError && (
        <p id="show-entry-period-error" role="alert" className="text-sm text-destructive mt-1">
          {entryError}
        </p>
      )}
    </div>
  </div>
);
