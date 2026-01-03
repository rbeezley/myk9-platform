import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SimpleTimeFieldsProps {
  value?: string; // MM:SS.HH format
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  disabled?: boolean;
  hideLabels?: boolean; // New prop to hide the Min/Sec/1/100 labels
  'data-index'?: number;
  'data-field'?: string;
}

// Local storage key for recent times
const RECENT_TIMES_KEY = 'simple-time-fields-recent-times';

// Helper function to manage recent times
const getRecentTimes = (): string[] => {
  try {
    const stored = localStorage.getItem(RECENT_TIMES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

const addRecentTime = (time: string) => {
  if (!time || time === '0:00.00') return;
  
  const recent = getRecentTimes();
  const filtered = recent.filter(t => t !== time);
  const updated = [time, ...filtered].slice(0, 5);
  
  try {
    localStorage.setItem(RECENT_TIMES_KEY, JSON.stringify(updated));
  } catch {
    // Ignore localStorage errors
  }
};

/**
 * Three separate input fields with NO processing - just store what user types
 */
export const SimpleTimeFields: React.FC<SimpleTimeFieldsProps> = ({
  value = '',
  onChange,
  onKeyDown,
  className,
  disabled = false,
  hideLabels = false,
  ...props
}) => {
  const [minutes, setMinutes] = useState('');
  const [seconds, setSeconds] = useState('');
  const [hundredths, setHundredths] = useState('');
  const [showRecentTimes, setShowRecentTimes] = useState(false);
  const [recentTimes, setRecentTimes] = useState<string[]>([]);

  const minutesRef = useRef<HTMLInputElement>(null);
  const secondsRef = useRef<HTMLInputElement>(null);
  const hundredthsRef = useRef<HTMLInputElement>(null);

  // Load recent times on mount
  useEffect(() => {
    setRecentTimes(getRecentTimes());
  }, []);

  // Parse incoming value
  useEffect(() => {
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
  }, [value]);

  // Build output value with validation - only call this when needed, not on every keystroke
  const buildValue = () => {
    if (!minutes && !seconds && !hundredths) {
      onChange?.('');
      return;
    }
    
    if (minutes || seconds || hundredths) {
      // Apply validation constraints
      const mins = Math.min(parseInt(minutes) || 0, 99);
      const secs = Math.min(parseInt(seconds) || 0, 59);
      const hundr = Math.min(parseInt(hundredths) || 0, 99);
      
      // Update the display values if they were constrained
      if (mins.toString() !== minutes && minutes) {
        setMinutes(mins.toString());
      }
      if (secs.toString() !== seconds && seconds) {
        setSeconds(secs.toString());
      }
      if (hundr.toString() !== hundredths && hundredths) {
        setHundredths(hundr.toString());
      }
      
      const formattedTime = mins + ':' + secs.toString().padStart(2, '0') + '.' + hundr.toString().padStart(2, '0');
      onChange?.(formattedTime);
      
      // Add to recent times when a complete time is entered (but not when labels are hidden)
      if (!hideLabels) {
        addRecentTime(formattedTime);
        setRecentTimes(getRecentTimes());
      }
    }
  };

  // Auto-focus next field when 2 digits are entered
  const autoFocusNext = (field: 'minutes' | 'seconds' | 'hundredths', value: string) => {
    if (value.length === 2) {
      setTimeout(() => {
        if (field === 'minutes') {
          secondsRef.current?.focus();
        } else if (field === 'seconds') {
          hundredthsRef.current?.focus();
        }
      }, 0);
    }
  };

  // Handle key navigation between fields
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'minutes' | 'seconds' | 'hundredths') => {
    // Call parent handler first
    onKeyDown?.(e);

    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      
      // Build value when navigating away
      buildValue();
      
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
  };

  // Handle selecting a recent time
  const selectRecentTime = (time: string) => {
    const match = time.match(/^(\d{1,2}):([0-5]\d)\.(\d{2})$/);
    if (match) {
      setMinutes(match[1]);
      setSeconds(match[2]);
      setHundredths(match[3]);
      onChange?.(time);
    }
    setShowRecentTimes(false);
  };

  return (
    <div className={cn('flex gap-1', className)} {...props}>
      {/* Minutes */}
      <div className="flex flex-col items-center">
        {!hideLabels && <label className="text-xs text-muted-foreground mb-1">Min</label>}
        <Input
          ref={minutesRef}
          value={minutes}
          onChange={(e) => {
            const val = e.target.value.slice(0, 2); // Just limit length
            setMinutes(val);
            autoFocusNext('minutes', val);
          }}
          onBlur={buildValue}
          onKeyDown={(e) => handleKeyDown(e, 'minutes')}
          placeholder=""
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
      
      <div className="flex flex-col items-center">
        {!hideLabels && <span className="text-xs opacity-0 mb-1">:</span>}
        <span className="text-lg px-1 font-mono">:</span>
      </div>
      
      {/* Seconds */}
      <div className="flex flex-col items-center">
        {!hideLabels && <label className="text-xs text-muted-foreground mb-1">Sec</label>}
        <Input
          ref={secondsRef}
          value={seconds}
          onChange={(e) => {
            const val = e.target.value.slice(0, 2); // Just limit length
            setSeconds(val);
            autoFocusNext('seconds', val);
          }}
          onBlur={buildValue}
          onKeyDown={(e) => handleKeyDown(e, 'seconds')}
          placeholder=""
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
      
      <div className="flex flex-col items-center">
        {!hideLabels && <span className="text-xs opacity-0 mb-1">.</span>}
        <span className="text-lg px-1 font-mono">.</span>
      </div>
      
      {/* Hundredths */}
      <div className="flex flex-col items-center">
        {!hideLabels && <label className="text-xs text-muted-foreground mb-1">1/100</label>}
        <Input
          ref={hundredthsRef}
          value={hundredths}
          onChange={(e) => {
            const val = e.target.value.slice(0, 2); // Just limit length
            setHundredths(val);
          }}
          onBlur={buildValue}
          onKeyDown={(e) => handleKeyDown(e, 'hundredths')}
          placeholder=""
          className="w-12 text-center font-mono"
          disabled={disabled}
          maxLength={2}
        />
      </div>
      
      {/* Recent Times Popover */}
      {!disabled && !hideLabels && recentTimes.length > 0 && (
        <Popover open={showRecentTimes} onOpenChange={setShowRecentTimes}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-8 w-8 p-0 ml-2"
              type="button"
            >
              <Clock className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="start">
            <div className="text-xs font-medium mb-2 text-muted-foreground">Recent Times</div>
            <div className="space-y-1">
              {recentTimes.map((time, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start h-7 px-2 font-mono text-xs"
                  onClick={() => selectRecentTime(time)}
                >
                  {time}
                </Button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
};

export default SimpleTimeFields;