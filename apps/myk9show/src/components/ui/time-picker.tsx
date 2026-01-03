import React from "react";
import { Label } from "@/components/ui/label";
import { TimePickerInput } from "./time-picker-input";
import { convertTimeStringToDate, convertDateToTimeString } from "@/lib/time-utils";

interface TimePickerProps {
  value?: string; // MM:SS format
  onChange?: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  id?: string;
  maxMinutes?: number; // For validation (e.g., 15 for Detective element)
}

export function TimePicker({
  value = "",
  onChange,
  label,
  className,
  id,
  maxMinutes = 9,
}: TimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    convertTimeStringToDate(value)
  );

  const minuteRef = React.useRef<HTMLInputElement>(null);
  const secondRef = React.useRef<HTMLInputElement>(null);

  // Update internal date when value prop changes
  React.useEffect(() => {
    const newDate = convertTimeStringToDate(value);
    setDate(newDate);
  }, [value]);

  // Handle date changes and convert back to MM:SS format
  const handleDateChange = (newDate: Date | undefined) => {
    setDate(newDate);
    if (newDate) {
      const minutes = newDate.getMinutes();
      const seconds = newDate.getSeconds();
      
      // Validate minutes against maxMinutes
      const constrainedMinutes = Math.min(minutes, maxMinutes);
      
      if (constrainedMinutes !== minutes) {
        // If we had to constrain minutes, update the date
        const constrainedDate = new Date(newDate);
        constrainedDate.setMinutes(constrainedMinutes);
        setDate(constrainedDate);
        onChange?.(`${constrainedMinutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      } else {
        onChange?.(convertDateToTimeString(newDate));
      }
    } else {
      onChange?.("");
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        {label && (
          <Label htmlFor={id} className="text-sm font-medium min-w-[130px] text-right">
            {label}
          </Label>
        )}
        <div className="flex items-center gap-1">
          <div className="flex flex-col items-center">
            <Label htmlFor="minutes" className="text-xs mb-1">
              Min
            </Label>
            <TimePickerInput
              picker="minutes"
              date={date}
              setDate={handleDateChange}
              ref={minuteRef}
              onRightFocus={() => secondRef.current?.focus()}
              id="minutes"
            />
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xs mb-1 opacity-0">:</span>
            <span className="text-lg px-1">:</span>
          </div>
          <div className="flex flex-col items-center">
            <Label htmlFor="seconds" className="text-xs mb-1">
              Sec
            </Label>
            <TimePickerInput
              picker="seconds"
              date={date}
              setDate={handleDateChange}
              ref={secondRef}
              onLeftFocus={() => minuteRef.current?.focus()}
              id="seconds"
            />
          </div>
          <div className="flex flex-col items-center justify-end">
            <span className="text-xs text-muted-foreground ml-2">
              {maxMinutes > 9 ? `max ${maxMinutes}:00` : `max ${maxMinutes}:59`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TimePicker;