import React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { logger } from '@/services/LoggingService';
import {
  isValidHour,
  isValid12Hour,
  isValidMinute,
  setDateByType,
  getDateByType,
  type Period,
} from "@/lib/time-utils";

export interface TimePickerInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  picker: "12hours" | "24hours" | "minutes" | "seconds";
  date?: Date;
  setDate: (date: Date | undefined) => void;
  period?: Period;
  onRightFocus?: () => void;
  onLeftFocus?: () => void;
}

const TimePickerInput = React.forwardRef<
  HTMLInputElement,
  TimePickerInputProps
>(
  (
    {
      className,
      type = "tel",
      id,
      name,
      date = new Date(new Date().setHours(0, 0, 0, 0)),
      setDate,
      onChange,
      onKeyDown,
      picker,
      period,
      onLeftFocus,
      onRightFocus,
      ...props
    },
    ref
  ) => {
    const [flag, setFlag] = React.useState(false);
    const [prevIntKey, setPrevIntKey] = React.useState<string>("0");

    /**
     * Allow only number key presses
     */
    const isNumericKey = (key: string) => {
      return /^[0-9]$/.test(key);
    };

    /**
     * Handle right focus
     */
    const handleRightFocus = () => {
      if (onRightFocus) {
        onRightFocus();
      }
    };

    /**
     * Handle left focus
     */
    const handleLeftFocus = () => {
      if (onLeftFocus) {
        onLeftFocus();
      }
    };

    const isValidValue = (value: string) => {
      if (picker === "12hours") {
        return isValid12Hour(value);
      } else if (picker === "24hours") {
        return isValidHour(value);
      } else if (picker === "minutes" || picker === "seconds") {
        return isValidMinute(value);
      }
      return false;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (onKeyDown) {
        onKeyDown(e);
      }
      if (e.key === "Tab") return;
      e.preventDefault();
      if (e.key === "ArrowRight") handleRightFocus();
      if (e.key === "ArrowLeft") handleLeftFocus();
      if (["ArrowUp", "ArrowDown"].includes(e.key)) {
        const step = e.key === "ArrowUp" ? 1 : -1;
        let fieldType: "hour" | "minute" | "second";
        let currentValue: number;

        if (picker === "12hours" || picker === "24hours") {
          fieldType = "hour";
          currentValue = parseInt(getDateByType(date, "hour"));
        } else if (picker === "minutes") {
          fieldType = "minute";
          currentValue = parseInt(getDateByType(date, "minute"));
        } else if (picker === "seconds") {
          fieldType = "second";
          currentValue = date?.getSeconds() || 0;
        } else {
          return;
        }

        const newValue = currentValue + step;
        let constrainedValue = newValue;

        // Apply constraints based on field type
        if (fieldType === "hour") {
          constrainedValue = Math.max(0, Math.min(23, newValue));
        } else if (fieldType === "minute") {
          constrainedValue = Math.max(0, Math.min(59, newValue));
        } else if (fieldType === "second") {
          constrainedValue = Math.max(0, Math.min(59, newValue));
        }

        const newDate = setDateByType(date, fieldType, constrainedValue, period);
        setDate(newDate);
      }
      if (isNumericKey(e.key)) {
        let fieldType: "hour" | "minute" | "second";
        
        if (picker === "12hours" || picker === "24hours") {
          fieldType = "hour";
        } else if (picker === "minutes") {
          fieldType = "minute";
        } else if (picker === "seconds") {
          fieldType = "second";
        } else {
          return;
        }

        if (flag && prevIntKey !== "0") {
          const nextValue = prevIntKey + e.key;
          if (isValidValue(nextValue)) {
            const newDate = setDateByType(date, fieldType, parseInt(nextValue), period);
            setDate(newDate);
          }
          setFlag(false);
          setPrevIntKey("0");
          handleRightFocus();
        } else {
          const newValue = "0" + e.key;
          if (isValidValue(newValue)) {
            const newDate = setDateByType(date, fieldType, parseInt(newValue), period);
            setDate(newDate);
            setFlag(true);
            setPrevIntKey(e.key);
          }
        }
      }
    };

    const getValue = () => {
      if (picker === "12hours") {
        if (!date) return "12";
        const hour = date.getHours();
        const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
        return hour12.toString().padStart(2, "0");
      } else if (picker === "24hours") {
        return getDateByType(date, "hour");
      } else if (picker === "minutes") {
        return getDateByType(date, "minute");
      } else if (picker === "seconds") {
        if (!date) return "00";
        return date.getSeconds().toString().padStart(2, "0");
      }
      return "";
    };

    return (
      <Input
        ref={ref}
        id={id || picker}
        name={name || picker}
        className={cn(
          "w-[48px] text-center font-mono text-base tabular-nums caret-transparent focus:bg-accent focus:text-accent-foreground [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          className
        )}
        value={getValue()}
        onChange={(e) => {
          if (onChange) {
            onChange(e);
          }
        }}
        type={type}
        inputMode="decimal"
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  }
);

TimePickerInput.displayName = "TimePickerInput";

export { TimePickerInput };