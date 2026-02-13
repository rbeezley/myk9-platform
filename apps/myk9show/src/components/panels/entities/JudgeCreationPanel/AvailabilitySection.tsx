import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import type { JudgeFormData } from './types';

interface AvailabilitySectionProps {
  formData: JudgeFormData;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  onAvailabilityChange: (field: keyof JudgeFormData['availability'], value: unknown) => void;
}

export const AvailabilitySection: React.FC<AvailabilitySectionProps> = ({
  formData,
  isExpanded,
  onToggleExpanded,
  onAvailabilityChange,
}) => {
  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={onToggleExpanded}>
        <CardTitle className="text-base flex items-center justify-between">
          <span>Availability Settings</span>
          <span className="text-sm font-normal text-muted-foreground">
            Optional
          </span>
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Max Shows Per Month</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={formData.availability.maxShowsPerMonth}
                onChange={(e) => onAvailabilityChange('maxShowsPerMonth', parseInt(e.target.value) || 4)}
              />
            </div>

            <div className="space-y-2">
              <Label>Travel Radius (miles)</Label>
              <Input
                type="number"
                min="0"
                max="1000"
                value={formData.availability.travelRadius}
                onChange={(e) => onAvailabilityChange('travelRadius', parseInt(e.target.value) || 100)}
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
                      "w-full justify-start text-left font-normal",
                      !formData.availability.startDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.availability.startDate
                      ? format(formData.availability.startDate, "PPP")
                      : "Always available"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.availability.startDate || undefined}
                    onSelect={(date) => onAvailabilityChange('startDate', date || null)}
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
                      "w-full justify-start text-left font-normal",
                      !formData.availability.endDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.availability.endDate
                      ? format(formData.availability.endDate, "PPP")
                      : "No end date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={formData.availability.endDate || undefined}
                    onSelect={(date) => onAvailabilityChange('endDate', date || null)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
};
