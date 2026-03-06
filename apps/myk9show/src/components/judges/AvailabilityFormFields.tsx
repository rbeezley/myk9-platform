import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { JudgeInfo } from '@/types/user-types';

interface AvailabilityFormFieldsProps {
  availability: JudgeInfo['availability'];
  onFieldChange: (field: keyof JudgeInfo['availability'], value: unknown) => void;
}

const AvailabilityFormFields: React.FC<AvailabilityFormFieldsProps> = ({
  availability,
  onFieldChange,
}) => {
  const blackoutDates = availability.blackoutDates || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Max Shows Per Month</Label>
          <Input
            type="number"
            min="1"
            max="30"
            value={availability.maxShowsPerMonth}
            onChange={e => onFieldChange('maxShowsPerMonth', parseInt(e.target.value) || 4)}
          />
        </div>

        <div className="space-y-2">
          <Label>Travel Radius (miles)</Label>
          <Input
            type="number"
            min="0"
            max="1000"
            value={availability.travelRadius}
            onChange={e => onFieldChange('travelRadius', parseInt(e.target.value) || 100)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Available From</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !availability.startDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {availability.startDate
                  ? format(availability.startDate, 'PPP')
                  : 'Always available'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={availability.startDate || undefined}
                onSelect={date => onFieldChange('startDate', date || null)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-2">
          <Label>Available Until</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !availability.endDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {availability.endDate ? format(availability.endDate, 'PPP') : 'No end date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={availability.endDate || undefined}
                onSelect={date => onFieldChange('endDate', date || null)}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Blackout Dates */}
      <div className="space-y-2">
        <Label>Blackout Dates</Label>
        <p className="text-xs text-muted-foreground">Select dates when the judge is unavailable</p>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'w-full justify-start text-left font-normal',
                blackoutDates.length === 0 && 'text-muted-foreground'
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {blackoutDates.length > 0
                ? `${blackoutDates.length} date${blackoutDates.length === 1 ? '' : 's'} selected`
                : 'No blackout dates'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="multiple"
              selected={blackoutDates}
              onSelect={dates => onFieldChange('blackoutDates', dates || [])}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        {blackoutDates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {[...blackoutDates]
              .sort((a, b) => a.getTime() - b.getTime())
              .map(date => (
                <Badge key={date.toISOString()} variant="secondary" className="gap-1 text-xs">
                  {format(date, 'MMM d, yyyy')}
                  <button
                    type="button"
                    onClick={() =>
                      onFieldChange(
                        'blackoutDates',
                        blackoutDates.filter(d => d.getTime() !== date.getTime())
                      )
                    }
                    className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AvailabilityFormFields;
