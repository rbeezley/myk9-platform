import React from 'react';
import { ShowDatesFields } from '@/components/shows/ShowDatesFields';
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
/*  The same ShowDatesFields control Edit Show renders (MYK9-931).     */
/* ------------------------------------------------------------------ */

export const DatesEntrySection: React.FC<DatesEntrySectionProps> = ({
  show,
  dateRangeValid,
  entryDatesValid,
  onUpdate,
}) => (
  <div>
    <SectionHeading>Dates &amp; Entry</SectionHeading>
    <ShowDatesFields
      startDate={show.startDate ? new Date(show.startDate) : undefined}
      endDate={show.endDate ? new Date(show.endDate) : undefined}
      entryOpenDate={show.entryOpenDate ? new Date(show.entryOpenDate) : undefined}
      entryCloseDate={show.entryCloseDate ? new Date(show.entryCloseDate) : undefined}
      onStartDateChange={date => onUpdate({ startDate: date?.toISOString() || '' })}
      onEndDateChange={date => onUpdate({ endDate: date?.toISOString() || '' })}
      onEntryOpenChange={date => onUpdate({ entryOpenDate: date?.toISOString() || '' })}
      onEntryCloseChange={date => onUpdate({ entryCloseDate: date?.toISOString() || '' })}
      datesError={dateRangeValid ? undefined : 'Start date must be before end date'}
      entryError={entryDatesValid ? undefined : 'Entry open date must be before close date'}
    />
  </div>
);
