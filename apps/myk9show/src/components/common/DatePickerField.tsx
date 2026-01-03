import React from "react";
import { DatePicker } from "@/components/ui/date-picker";

/**
 * Helper to parse a YYYY-MM-DD string to date parts without timezone issues
 * @param dateStr Date string in YYYY-MM-DD format
 * @returns Object with year, month, day or null if invalid format
 */
function parseDateString(dateStr: string): { year: number, month: number, day: number } | null {
  if (!dateStr || !dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return null;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

/**
 * Helper to create a date string in YYYY-MM-DD format with proper padding
 * @param year Full year (e.g. 2025)
 * @param month Month (1-12)
 * @param day Day of month (1-31)
 * @returns Formatted date string in YYYY-MM-DD format
 */
function formatDateString(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export interface DatePickerFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  name?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const DatePickerField: React.FC<DatePickerFieldProps> = ({
  label,
  value,
  onChange,
  required = false,
  name,
  id,
  disabled = false,
  placeholder = "Select date",
  className,
}) => {
  // Create a Date object from the stored value
  let date: Date | undefined = undefined;
  const dateParts = parseDateString(value);
  
  if (dateParts) {
    const { year, month, day } = dateParts;
    
    // Create a local date object - no timezone compensation needed because
    // the DatePicker component handles display values on its own
    date = new Date(year, month - 1, day);
  }
  
  /**
   * Handles date changes from the date picker component
   * Converts the Date object to a YYYY-MM-DD string for storage
   */
  const handleDateChange = (newDate: Date | undefined) => {
    if (newDate) {
      // Extract date components directly, avoiding timezone issues
      // We use local date methods because the input already comes from a local date object
      const year = newDate.getFullYear();
      const month = newDate.getMonth() + 1; // Months are 0-based
      const day = newDate.getDate();
      
      // Format as YYYY-MM-DD for storage
      const formattedDate = formatDateString(year, month, day);
      
      onChange(formattedDate);
    } else {
      onChange("");
    }
  };
  
  return (
    <div className={className ?? "space-y-2"}>
      {label && (
        <div className="flex items-center gap-1">
          <label htmlFor={id} className="block text-sm font-medium">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>
      )}
      <DatePicker 
        date={date}
        setDate={handleDateChange}
        required={required}
        name={name}
        id={id}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
};

export default DatePickerField;
