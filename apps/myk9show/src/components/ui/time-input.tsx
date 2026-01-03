import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TimeInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  allowTwoDigitMinutes?: boolean; // For Detective element
  disabled?: boolean;
}

export const TimeInput: React.FC<TimeInputProps> = ({
  value = '',
  onChange,
  placeholder = 'MM:SS',
  className,
  id,
  allowTwoDigitMinutes = false,
  disabled = false
}) => {
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  const formatTime = (input: string): string => {
    // Handle empty string
    if (!input || input.trim() === '') return '';
    
    // If input already has colon, handle it separately
    if (input.includes(':')) {
      const parts = input.split(':');
      if (parts.length === 2) {
        const minutesStr = parts[0].replace(/\D/g, '');
        const secondsStr = parts[1].replace(/\D/g, '');
        
        if (minutesStr === '' && secondsStr === '') return '';
        
        const minutes = minutesStr === '' ? '0' : minutesStr;
        const seconds = secondsStr === '' ? '00' : secondsStr.padStart(2, '0');
        
        // Validate and constrain minutes
        let minutesNum = parseInt(minutes);
        if (allowTwoDigitMinutes) {
          minutesNum = Math.min(minutesNum, 15); // Max 15 for Detective
        } else {
          minutesNum = Math.min(minutesNum, 9); // Max 9 for others
        }
        
        // Validate seconds (0-59)
        const secondsNum = Math.min(parseInt(seconds), 59);
        
        return `${minutesNum}:${secondsNum.toString().padStart(2, '0')}`;
      }
    }
    
    // Remove all non-digits for fresh input
    const digits = input.replace(/\D/g, '');
    
    if (digits.length === 0) return '';
    
    if (digits.length === 1) {
      // Single digit - treat as seconds
      return `0:0${digits}`;
    } else if (digits.length === 2) {
      // Two digits - could be seconds or minutes
      const num = parseInt(digits);
      if (num <= 59) {
        // Valid seconds
        return `0:${digits}`;
      } else {
        // Treat as minutes
        return `${digits.charAt(0)}:${digits.charAt(1)}0`;
      }
    } else if (digits.length === 3) {
      // Three digits - M:SS
      const minutes = digits.charAt(0);
      const seconds = digits.slice(1);
      
      const minutesNum = parseInt(minutes);
      const secondsNum = parseInt(seconds);
      
      // Validate constraints
      const maxMinutes = allowTwoDigitMinutes ? 15 : 9;
      if (minutesNum > maxMinutes) {
        return `${maxMinutes}:${Math.min(secondsNum, 59).toString().padStart(2, '0')}`;
      }
      
      if (secondsNum > 59) {
        return `${minutes}:59`;
      }
      
      return `${minutes}:${seconds}`;
    } else if (digits.length >= 4) {
      // Four or more digits - MM:SS
      const minutes = digits.slice(0, allowTwoDigitMinutes ? 2 : 1);
      const seconds = digits.slice(allowTwoDigitMinutes ? 2 : 1, allowTwoDigitMinutes ? 4 : 3);
      
      const minutesNum = parseInt(minutes);
      const secondsNum = parseInt(seconds);
      
      // Validate constraints
      const maxMinutes = allowTwoDigitMinutes ? 15 : 9;
      const finalMinutes = Math.min(minutesNum, maxMinutes);
      const finalSeconds = Math.min(secondsNum, 59);
      
      return `${finalMinutes}:${finalSeconds.toString().padStart(2, '0')}`;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow backspace to clear completely
    if (e.key === 'Backspace' && displayValue.length <= 4) {
      e.preventDefault();
      const newValue = displayValue.slice(0, -1);
      if (newValue === '' || newValue === '0' || newValue === '0:' || newValue === '0:0') {
        setDisplayValue('');
        onChange?.('');
      } else {
        const formatted = formatTime(newValue);
        setDisplayValue(formatted);
        onChange?.(formatted);
      }
    }
  };

  const getPlaceholder = () => {
    if (allowTwoDigitMinutes) {
      return 'MM:SS (up to 15:00)';
    }
    return 'M:SS (up to 9:59)';
  };

  return (
    <Input
      id={id}
      value={displayValue}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder || getPlaceholder()}
      className={cn('font-mono', className)}
      disabled={disabled}
      maxLength={5} // "15:59"
    />
  );
};

export default TimeInput;