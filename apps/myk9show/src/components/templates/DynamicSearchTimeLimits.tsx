import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Trash2, Plus } from 'lucide-react';
import { msToDisplay, parseTimeInput } from '@/lib/timeUtils';

interface DynamicSearchTimeLimitsProps {
  searchAreasCount: number;
  timeLimits: number[]; // Array of milliseconds
  onChange: (timeLimits: number[]) => void;
  className?: string;
  readOnly?: boolean;
  minTime?: number; // Minimum time in milliseconds
  maxTime?: number; // Maximum time in milliseconds
}

export const DynamicSearchTimeLimits: React.FC<DynamicSearchTimeLimitsProps> = ({
  searchAreasCount,
  timeLimits,
  onChange,
  className = '',
  readOnly = false,
  minTime = 60000, // Default 1:00
  maxTime = 900000 // Default 15:00
}) => {
  const [localTimeLimits, setLocalTimeLimits] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);

  // Initialize local state when props change
  useEffect(() => {
    const displayTimes = Array.from({ length: searchAreasCount }, (_, index) => {
      if (timeLimits[index] !== undefined) {
        return msToDisplay(timeLimits[index], 'seconds');
      }
      // Default to 3:00 for new areas
      return '3:00';
    });
    setLocalTimeLimits(displayTimes);
    setErrors(new Array(searchAreasCount).fill(''));
  }, [searchAreasCount, timeLimits]);

  // Validate and update a single time limit
  const updateTimeLimit = (index: number, timeString: string) => {
    const newLocalTimes = [...localTimeLimits];
    const newErrors = [...errors];
    
    newLocalTimes[index] = timeString;
    
    // Validate the time format
    const parsed = parseTimeInput(timeString);
    if (!parsed.isValid) {
      newErrors[index] = parsed.error || 'Invalid time format';
    } else if (parsed.ms < minTime) {
      newErrors[index] = `Minimum time is ${msToDisplay(minTime, 'seconds')}`;
    } else if (parsed.ms > maxTime) {
      newErrors[index] = `Maximum time is ${msToDisplay(maxTime, 'seconds')}`;
    } else {
      newErrors[index] = '';
      
      // Update the actual time limits array
      const newTimeLimits = [...timeLimits];
      newTimeLimits[index] = parsed.ms;
      
      // Ensure array is the correct length
      while (newTimeLimits.length < searchAreasCount) {
        newTimeLimits.push(180000); // Default 3:00
      }
      newTimeLimits.length = searchAreasCount; // Trim if needed
      
      onChange(newTimeLimits);
    }
    
    setLocalTimeLimits(newLocalTimes);
    setErrors(newErrors);
  };

  // Add a new time limit (for manual control)
  const addTimeLimit = () => {
    if (localTimeLimits.length < 5) { // Max 5 search areas
      const newLocalTimes = [...localTimeLimits, '3:00'];
      const newErrors = [...errors, ''];
      setLocalTimeLimits(newLocalTimes);
      setErrors(newErrors);
      
      const newTimeLimits = [...timeLimits, 180000]; // 3:00 default
      onChange(newTimeLimits);
    }
  };

  // Remove a time limit (for manual control)
  const removeTimeLimit = (index: number) => {
    if (localTimeLimits.length > 1) {
      const newLocalTimes = localTimeLimits.filter((_, i) => i !== index);
      const newErrors = errors.filter((_, i) => i !== index);
      setLocalTimeLimits(newLocalTimes);
      setErrors(newErrors);
      
      const newTimeLimits = timeLimits.filter((_, i) => i !== index);
      onChange(newTimeLimits);
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          Search Time Limits per Area
        </Label>
        <Badge variant="outline" className="text-xs">
          {localTimeLimits.length} area{localTimeLimits.length !== 1 ? 's' : ''}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {localTimeLimits.map((timeString, index) => (
          <div key={index} className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-12">
              Area {index + 1}:
            </Label>
            <div className="flex-1">
              <Input
                type="text"
                value={timeString}
                onChange={(e) => updateTimeLimit(index, e.target.value)}
                placeholder="MM:SS (e.g., 3:00)"
                className={`text-sm ${errors[index] ? 'border-red-500' : ''}`}
                readOnly={readOnly}
              />
              {errors[index] && (
                <p className="text-xs text-red-500 mt-1">{errors[index]}</p>
              )}
            </div>
            {!readOnly && localTimeLimits.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeTimeLimit(index)}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
      
      {!readOnly && localTimeLimits.length < 5 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addTimeLimit}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Search Area
        </Button>
      )}
      
      <div className="text-xs text-muted-foreground">
        <p>• Enter times in MM:SS format (e.g., 1:30 for 1 minute 30 seconds)</p>
        <p>• Each search area can have its own time limit</p>
        <p>• Range: {msToDisplay(minTime, 'seconds')} - {msToDisplay(maxTime, 'seconds')}</p>
      </div>
    </div>
  );
};

export default DynamicSearchTimeLimits;