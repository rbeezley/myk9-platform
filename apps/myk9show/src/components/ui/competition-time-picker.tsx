import React, { useState, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CompetitionTimePickerProps {
  value?: string; // MM:SS.HH format
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  'data-index'?: number;
  'data-field'?: string;
}

/**
 * Competition Time Picker Component
 * 
 * Three separate inputs for competition time entry: Minutes : Seconds . Hundredths
 * Much more intuitive for non-computer-savvy users
 */
export const CompetitionTimePicker: React.FC<CompetitionTimePickerProps> = ({
  value = '',
  onChange,
  onKeyDown,
  className,
  id,
  disabled = false,
  ...props
}) => {
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [hundredths, setHundredths] = useState('');

  const minutesRef = useRef<HTMLInputElement>(null);
  const secondsRef = useRef<HTMLInputElement>(null);
  const hundredthsRef = useRef<HTMLInputElement>(null);

  // Parse incoming value into separate components using render-time sync
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      const match = value.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
      if (match) {
        setMinutes(match[1]);
        setSeconds(match[2]);
        setHundredths(match[3]);
      }
    } else {
      setMinutes('');
      setSeconds('');
      setHundredths('');
    }
  }

  // Combine components into MM:SS.HH format
  const updateValue = (newMinutes: string, newSeconds: string, newHundredths: string) => {
    if (!newMinutes && !newSeconds && !newHundredths) {
      onChange?.('');
      return;
    }

    // Only format for output if we have meaningful values
    if (newMinutes || newSeconds || newHundredths) {
      const mins = newMinutes || '0';
      const secs = (newSeconds || '0').padStart(2, '0');
      const hundr = (newHundredths || '0').padStart(2, '0');
      
      const formattedTime = `${mins}:${secs}.${hundr}`;
      onChange?.(formattedTime);
    } else {
      onChange?.('');
    }
  };

  const handleMinutesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2); // Max 2 digits
    setMinutes(val);
    updateValue(val, seconds, hundredths);
  };

  const handleSecondsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2); // Max 2 digits
    setSeconds(val);
    updateValue(minutes, val, hundredths);
  };

  const handleHundredthsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2); // Max 2 digits
    setHundredths(val);
    updateValue(minutes, seconds, val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'minutes' | 'seconds' | 'hundredths') => {
    // Call parent onKeyDown for table navigation
    onKeyDown?.(e);

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      
      if (e.shiftKey) {
        // Move backwards
        if (field === 'hundredths') {
          secondsRef.current?.focus();
        } else if (field === 'seconds') {
          minutesRef.current?.focus();
        }
      } else {
        // Move forwards
        if (field === 'minutes') {
          secondsRef.current?.focus();
        } else if (field === 'seconds') {
          hundredthsRef.current?.focus();
        }
      }
    }

    // Allow clearing with Escape
    if (e.key === 'Escape') {
      e.preventDefault();
      setMinutes('');
      setSeconds('');
      setHundredths('');
      updateValue('', '', '');
    }
  };

  return (
    <div className={cn('flex items-center gap-1', className)} {...props}>
      <div className="flex flex-col items-center">
        <label className="text-xs text-muted-foreground mb-1">Min</label>
        <Input
          ref={minutesRef}
          id={id}
          value={minutes}
          onChange={handleMinutesChange}
          onKeyDown={(e) => handleKeyDown(e, 'minutes')}
          placeholder="0"
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
      
      <div className="flex flex-col items-center">
        <span className="text-xs opacity-0 mb-1">:</span>
        <span className="text-lg px-1 font-mono">:</span>
      </div>
      
      <div className="flex flex-col items-center">
        <label className="text-xs text-muted-foreground mb-1">Sec</label>
        <Input
          ref={secondsRef}
          value={seconds}
          onChange={handleSecondsChange}
          onKeyDown={(e) => handleKeyDown(e, 'seconds')}
          placeholder="00"
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
      
      <div className="flex flex-col items-center">
        <span className="text-xs opacity-0 mb-1">.</span>
        <span className="text-lg px-1 font-mono">.</span>
      </div>
      
      <div className="flex flex-col items-center">
        <label className="text-xs text-muted-foreground mb-1">1/100</label>
        <Input
          ref={hundredthsRef}
          value={hundredths}
          onChange={handleHundredthsChange}
          onKeyDown={(e) => handleKeyDown(e, 'hundredths')}
          placeholder="00"
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
    </div>
  );
};

export default CompetitionTimePicker;