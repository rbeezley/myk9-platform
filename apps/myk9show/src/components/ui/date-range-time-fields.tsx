import React from 'react';
import { Clock } from 'lucide-react';
import { ClockTimeInput } from '@myk9/scoring-ui';
import { Label } from '@/components/ui/label';

interface DateRangeTimeFieldsProps {
  startLabel: string;
  endLabel: string;
  startTime: string;
  endTime: string;
  startTimeId: string | undefined;
  endTimeId: string | undefined;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
}

interface TimeFieldProps {
  label: string;
  id: string | undefined;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}

const TimeField: React.FC<TimeFieldProps> = ({ label, id, value, placeholder, onChange }) => (
  <div className="space-y-1">
    <Label {...(id !== undefined && { htmlFor: id })} className="text-xs text-muted-foreground">
      {label} time
    </Label>
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <ClockTimeInput
        {...(id !== undefined && { id })}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  </div>
);

/** The start and end clock times under a date range's calendar (MYK9-1504). */
export const DateRangeTimeFields: React.FC<DateRangeTimeFieldsProps> = ({
  startLabel,
  endLabel,
  startTime,
  endTime,
  startTimeId,
  endTimeId,
  onStartTimeChange,
  onEndTimeChange,
}) => (
  <div className="mt-3 grid grid-cols-2 gap-4 border-t pt-3">
    <TimeField
      label={startLabel}
      id={startTimeId}
      value={startTime}
      placeholder="8:00 AM"
      onChange={onStartTimeChange}
    />
    <TimeField
      label={endLabel}
      id={endTimeId}
      value={endTime}
      placeholder="5:00 PM"
      onChange={onEndTimeChange}
    />
  </div>
);
