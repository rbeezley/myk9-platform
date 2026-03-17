import React, { useState, useEffect, forwardRef } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CompetitionTimeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  disabled?: boolean;
  'data-index'?: number;
  'data-field'?: string;
}

/**
 * Competition Time Input Component
 *
 * Specialized time input for dog competition results in MM:SS.HH format
 * Features:
 * - Auto-formatting as user types (e.g., "230" → "2:30.00")
 * - Smart parsing of various input formats
 * - Validation constraints (minutes ≤ 99, seconds ≤ 59, hundredths ≤ 99)
 * - Clear button (X) for easy field clearing
 * - Smart backspace: Backspace at beginning clears entire field
 * - Escape key clears field
 * - Keyboard navigation support
 */
export const CompetitionTimeInput = forwardRef<HTMLInputElement, CompetitionTimeInputProps>(
  (
    {
      value = '',
      onChange,
      onKeyDown,
      placeholder = '0:00.00',
      className,
      id,
      disabled = false,
      ...props
    },
    ref
  ) => {
    const [displayValue, setDisplayValue] = useState(value);

    useEffect(() => {
      setDisplayValue(value);
    }, [value]);

    const formatTime = (input: string): string => {
      // Handle empty string
      if (!input || input.trim() === '') return '';

      // If input already has proper format MM:SS.HH, validate and return
      const fullFormatMatch = input.match(/^(\d{1,2}):([0-5]?\d)\.(\d{1,2})$/);
      if (fullFormatMatch) {
        const minutes = Math.min(parseInt(fullFormatMatch[1]), 99);
        const seconds = Math.min(parseInt(fullFormatMatch[2]), 59);
        const hundredths = Math.min(parseInt(fullFormatMatch[3]), 99);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
      }

      // If input has MM:SS format, add .00
      const mmssMatch = input.match(/^(\d{1,2}):([0-5]?\d)$/);
      if (mmssMatch) {
        const minutes = Math.min(parseInt(mmssMatch[1]), 99);
        const seconds = Math.min(parseInt(mmssMatch[2]), 59);
        return `${minutes}:${seconds.toString().padStart(2, '0')}.00`;
      }

      // Remove all non-digits for smart parsing
      const digits = input.replace(/\D/g, '');

      if (digits.length === 0) return '';

      // Smart parsing based on digit count
      if (digits.length === 1) {
        // Single digit - treat as seconds
        return `0:0${digits}.00`;
      } else if (digits.length === 2) {
        // Two digits - check if valid seconds or hundredths
        const num = parseInt(digits);
        if (num <= 59) {
          // Valid seconds
          return `0:${digits}.00`;
        } else {
          // Treat as seconds with overflow to hundredths
          return `0:${digits.charAt(0)}${digits.charAt(1)}.00`;
        }
      } else if (digits.length === 3) {
        // Three digits - M:SS.00 or 0:SS.H
        const firstDigit = parseInt(digits.charAt(0));
        const secondTwo = digits.slice(1);

        if (parseInt(secondTwo) <= 59) {
          // M:SS format
          return `${firstDigit}:${secondTwo}.00`;
        } else {
          // 0:S.HH format
          return `0:0${digits.charAt(0)}.${digits.slice(1)}`;
        }
      } else if (digits.length === 4) {
        // Four digits - MM:SS.00 or M:SS.H or 0:SS.HH
        const first = digits.charAt(0);
        const second = digits.charAt(1);
        const third = digits.charAt(2);
        const fourth = digits.charAt(3);

        // Try MM:SS format first
        if (parseInt(second + third) <= 59) {
          const minutes = Math.min(parseInt(first + second), 99);
          return `${minutes}:${third}${fourth}.00`;
        } else {
          // Try M:SS.H format
          if (parseInt(second + third) <= 59) {
            return `${first}:${second}${third}.${fourth}0`;
          } else {
            // 0:SS.HH format
            const seconds = Math.min(parseInt(first + second), 59);
            const hundredths = Math.min(parseInt(third + fourth), 99);
            return `0:${seconds.toString().padStart(2, '0')}.${hundredths.toString().padStart(2, '0')}`;
          }
        }
      } else if (digits.length === 5) {
        // Five digits - MM:SS.H or M:SS.HH
        const minutes = digits.slice(0, 2);
        const seconds = digits.slice(2, 4);
        const hundredths = digits.charAt(4);

        if (parseInt(minutes) <= 99 && parseInt(seconds) <= 59) {
          return `${parseInt(minutes)}:${seconds}.${hundredths}0`;
        } else {
          // Try M:SS.HH
          const altMinutes = digits.charAt(0);
          const altSeconds = digits.slice(1, 3);
          const altHundredths = digits.slice(3, 5);

          if (parseInt(altSeconds) <= 59) {
            const hundredthsNum = Math.min(parseInt(altHundredths), 99);
            return `${altMinutes}:${altSeconds}.${hundredthsNum.toString().padStart(2, '0')}`;
          }
        }
      } else if (digits.length >= 6) {
        // Six or more digits - MM:SS.HH
        const minutes = digits.slice(0, 2);
        const seconds = digits.slice(2, 4);
        const hundredths = digits.slice(4, 6);

        const minutesNum = Math.min(parseInt(minutes), 99);
        const secondsNum = Math.min(parseInt(seconds), 59);
        const hundredthsNum = Math.min(parseInt(hundredths), 99);

        return `${minutesNum}:${secondsNum.toString().padStart(2, '0')}.${hundredthsNum.toString().padStart(2, '0')}`;
      }

      return digits;
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value;

      // Allow clearing the field
      if (input === '') {
        setDisplayValue('');
        onChange?.('');
        return;
      }

      const formatted = formatTime(input);
      setDisplayValue(formatted);
      onChange?.(formatted);
    };

    const handleClear = () => {
      setDisplayValue('');
      onChange?.('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Call parent onKeyDown for navigation
      onKeyDown?.(e);

      // Handle backspace for smart clearing - if we're at the beginning of the field, clear everything
      if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0) {
        e.preventDefault();
        handleClear();
        return;
      }

      // Handle Escape key to clear field
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
        return;
      }

      // Prevent invalid characters
      if (e.key.length === 1 && !/[\d:.]/.test(e.key)) {
        e.preventDefault();
      }
    };

    const isValidTime = (timeStr: string): boolean => {
      const match = timeStr.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
      if (!match) return false;

      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const hundredths = parseInt(match[3]);

      return minutes <= 99 && seconds <= 59 && hundredths <= 99;
    };

    return (
      <div className="relative">
        <Input
          ref={ref}
          id={id}
          value={displayValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'font-mono text-center pr-10', // Add right padding for clear button
            !disabled &&
              displayValue &&
              !isValidTime(displayValue) &&
              'border-destructive bg-destructive/5',
            className
          )}
          disabled={disabled}
          maxLength={8} // "99:59.99"
          {...props}
        />
        {displayValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10 flex items-center justify-center hover:bg-gray-100"
            tabIndex={-1}
          >
            <X className="h-3 w-3 text-gray-400 hover:text-gray-600" />
            <span className="sr-only">Clear time</span>
          </button>
        )}
      </div>
    );
  }
);

CompetitionTimeInput.displayName = 'CompetitionTimeInput';

export default CompetitionTimeInput;
