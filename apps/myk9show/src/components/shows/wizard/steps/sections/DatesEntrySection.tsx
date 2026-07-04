import React from 'react';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Label } from '@/components/ui/label';
import type { ShowDraft } from '@/store/wizardStore';
import { SectionHeading } from './SectionHeading';

interface DatesEntrySectionProps {
  show: ShowDraft;
  dateRangeValid: boolean;
  entryDatesValid: boolean;
  onUpdate: (patch: Partial<ShowDraft>) => void;
}

/* ------------------------------------------------------------------ */
/*  Dates & Entry — when the show runs and when entries are accepted.  */
/* ------------------------------------------------------------------ */

export const DatesEntrySection: React.FC<DatesEntrySectionProps> = ({
  show,
  dateRangeValid,
  entryDatesValid,
  onUpdate,
}) => (
  <div>
    <SectionHeading>Dates &amp; Entry</SectionHeading>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="show-dates">
          Show Dates <span className="text-destructive">*</span>
        </Label>
        <DateRangePicker
          id="show-dates"
          startDate={show.startDate ? new Date(show.startDate) : undefined}
          endDate={show.endDate ? new Date(show.endDate) : undefined}
          onStartDateChange={date => onUpdate({ startDate: date?.toISOString() || '' })}
          onEndDateChange={date => onUpdate({ endDate: date?.toISOString() || '' })}
          startLabel="Start"
          endLabel="End"
          placeholder="Select show start and end dates"
          startDefaultTime="8:00 AM"
          endDefaultTime="5:00 PM"
        />
        {!dateRangeValid && (
          <p className="text-sm text-destructive mt-1">Start date must be before end date</p>
        )}
      </div>

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor="show-entry-period">
          Entry Period <span className="text-destructive">*</span>
        </Label>
        <DateRangePicker
          id="show-entry-period"
          startDate={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
          endDate={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
          onStartDateChange={date => onUpdate({ entryOpenDate: date?.toISOString() || '' })}
          onEndDateChange={date => onUpdate({ entryCloseDate: date?.toISOString() || '' })}
          startLabel="Opens"
          endLabel="Closes"
          placeholder="Select entry open and close dates"
          startDefaultTime="8:00 AM"
          endDefaultTime="11:59 PM"
        />
        {!entryDatesValid && (
          <p className="text-sm text-destructive mt-1">Entry open date must be before close date</p>
        )}
      </div>
    </div>
  </div>
);
