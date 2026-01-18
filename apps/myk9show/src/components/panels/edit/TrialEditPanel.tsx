import React, { useState, useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Clock, Info, Settings } from 'lucide-react';
import { format } from 'date-fns';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';

interface TrialEditPanelProps {
  open: boolean;
  onClose: () => void;
  trialId: string;
  trialName: string;
  initialTrialData: Partial<Trial>;
  onSave?: (trialData: Partial<Trial>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
}

// Form data interface extending Trial for edit panel needs
interface TrialEditFormData extends Record<string, unknown> {
  name: string;
  showId: string;
  showName: string;
  trialDate: string;
  trialNumber: string;
  status: ClassStatusValue;
  plannedStartTime: string;
  timeStarted?: string;
  timeEnded?: string;
  eventNumber: string;
  type?: string;
  order: string;
  trialType?: string;
  // Additional optional fields
  image?: string;
}

// Form validation
const validateTrialData = (data: TrialEditFormData): string[] | null => {
  const errors: string[] = [];

  if (!data.name?.trim()) {
    errors.push('Trial name is required');
  }

  if (!data.trialNumber?.trim()) {
    errors.push('Trial number is required');
  }

  if (!data.trialDate?.trim()) {
    errors.push('Trial date is required');
  }

  if (!data.status?.trim()) {
    errors.push('Status is required');
  }

  if (!data.eventNumber?.trim()) {
    errors.push('Event number is required');
  }

  if (!data.plannedStartTime?.trim()) {
    errors.push('Planned start time is required');
  }

  if (!data.order?.trim()) {
    errors.push('Order is required');
  } else if (isNaN(parseInt(data.order))) {
    errors.push('Order must be a valid number');
  }

  // Validate time format for planned start time (basic validation)
  if (data.plannedStartTime && !/^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/i.test(data.plannedStartTime.trim())) {
    errors.push('Planned start time should be in format "9:00 AM" or "2:30 PM"');
  }

  return errors.length > 0 ? errors : null;
};

// Convert Trial to form data
const trialToFormData = (trial: Partial<Trial>): TrialEditFormData => {
  return {
    name: trial.name || '',
    showId: trial.showId || '',
    showName: trial.showName || '',
    trialDate: trial.trialDate || '',
    trialNumber: trial.trialNumber || '',
    status: trial.status || 'Upcoming',
    plannedStartTime: trial.plannedStartTime || '',
    timeStarted: trial.timeStarted || '',
    timeEnded: trial.timeEnded || '',
    eventNumber: trial.eventNumber || '',
    type: trial.type || '',
    order: trial.order || '1',
    trialType: trial.trialType || '',
    image: trial.image || '',
  };
};

// Convert form data back to Trial
const formDataToTrial = (formData: TrialEditFormData): Partial<Trial> => ({
  name: formData.name,
  showId: formData.showId,
  showName: formData.showName,
  trialDate: formData.trialDate,
  trialNumber: formData.trialNumber,
  status: formData.status,
  plannedStartTime: formData.plannedStartTime,
  timeStarted: formData.timeStarted,
  timeEnded: formData.timeEnded,
  eventNumber: formData.eventNumber,
  type: formData.type,
  order: formData.order,
  trialType: formData.trialType,
  image: formData.image,
});

// Form content component
const TrialEditForm: React.FC = () => {
  const { data, updateData, errors } = useEditPanel<TrialEditFormData>();
  
  // Date picker state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    data.trialDate ? new Date(data.trialDate) : undefined
  );

  // Handle input changes
  const handleInputChange = useCallback((field: keyof TrialEditFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    updateData({ [field]: e.target.value });
  }, [updateData]);

  // Handle select changes
  const handleSelectChange = useCallback((field: keyof TrialEditFormData) => (value: string) => {
    updateData({ [field]: value });
  }, [updateData]);

  // Handle date changes
  const handleDateChange = useCallback((date: Date | undefined) => {
    setSelectedDate(date);
    if (date) {
      updateData({ trialDate: format(date, 'yyyy-MM-dd') });
    }
  }, [updateData]);

  return (
    <div className="space-y-6 p-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger 
            value="basic" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Info className="h-4 w-4" />
            Basic Info
          </TabsTrigger>
          <TabsTrigger 
            value="scheduling" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Clock className="h-4 w-4" />
            Scheduling
          </TabsTrigger>
          <TabsTrigger 
            value="advanced" 
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Settings className="h-4 w-4" />
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Basic Information Tab */}
        <TabsContent value="basic" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Trial Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Trial Name *</Label>
                <Input
                  id="name"
                  value={data.name}
                  onChange={handleInputChange('name')}
                  placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
                  className={cn(
                    errors.some(e => e.includes('Trial name')) && 'border-destructive'
                  )}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="showName" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Show Name</Label>
                <Input
                  id="showName"
                  value={data.showName}
                  onChange={handleInputChange('showName')}
                  placeholder="Associated show name"
                  className="bg-muted text-muted-foreground"
                  disabled
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trialNumber" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Trial Number *</Label>
                  <Input
                    id="trialNumber"
                    value={data.trialNumber}
                    onChange={handleInputChange('trialNumber')}
                    placeholder="Trial #"
                    className={cn(
                      errors.some(e => e.includes('Trial number')) && 'border-destructive'
                    )}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="eventNumber" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Event Number *</Label>
                  <Input
                    id="eventNumber"
                    value={data.eventNumber}
                    onChange={handleInputChange('eventNumber')}
                    placeholder="e.g., EV-2025-001"
                    className={cn(
                      errors.some(e => e.includes('Event number')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="type" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Trial Type</Label>
                  <Select value={data.trialType || ''} onValueChange={handleSelectChange('trialType')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select trial type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Scent Work">Scent Work</SelectItem>
                      <SelectItem value="Agility">Agility</SelectItem>
                      <SelectItem value="Obedience">Obedience</SelectItem>
                      <SelectItem value="Rally">Rally</SelectItem>
                      <SelectItem value="Conformation">Conformation</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="status" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Status *</Label>
                  <Select value={data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger className={cn(
                      errors.some(e => e.includes('Status')) && 'border-destructive'
                    )}>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Upcoming">Upcoming</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="Cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduling Tab */}
        <TabsContent value="scheduling" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduling Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trialDate" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Trial Date *</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !selectedDate && 'text-muted-foreground',
                          errors.some(e => e.includes('Trial date')) && 'border-destructive'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {selectedDate ? format(selectedDate, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={handleDateChange}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="order" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Display Order *</Label>
                  <Input
                    id="order"
                    type="number"
                    value={data.order}
                    onChange={handleInputChange('order')}
                    placeholder="Display order"
                    min="1"
                    className={cn(
                      errors.some(e => e.includes('Order')) && 'border-destructive'
                    )}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="plannedStartTime" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Planned Start Time *</Label>
                <Input
                  id="plannedStartTime"
                  value={data.plannedStartTime}
                  onChange={handleInputChange('plannedStartTime')}
                  placeholder="e.g., 09:00 AM"
                  className={cn(
                    errors.some(e => e.includes('start time')) && 'border-destructive'
                  )}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Actual Times (Optional)
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="timeStarted" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Time Started</Label>
                    <Input
                      id="timeStarted"
                      value={data.timeStarted || ''}
                      onChange={handleInputChange('timeStarted')}
                      placeholder="e.g., 09:15 AM"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timeEnded" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Time Ended</Label>
                    <Input
                      id="timeEnded"
                      value={data.timeEnded || ''}
                      onChange={handleInputChange('timeEnded')}
                      placeholder="e.g., 12:30 PM"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out">
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Advanced Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="type" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Category</Label>
                <Input
                  id="type"
                  value={data.type || ''}
                  onChange={handleInputChange('type')}
                  placeholder="Trial category or classification"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="image" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Image URL</Label>
                <Input
                  id="image"
                  value={data.image || ''}
                  onChange={handleInputChange('image')}
                  placeholder="https://example.com/trial-image.jpg"
                />
                <p className="text-xs text-muted-foreground">
                  Optional image to display with this trial
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="showId" className="text-xs font-medium text-muted-foreground/80 tracking-wide uppercase">Show ID</Label>
                <Input
                  id="showId"
                  value={data.showId}
                  onChange={handleInputChange('showId')}
                  placeholder="Associated show identifier"
                  className="bg-muted text-muted-foreground"
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  The show this trial belongs to (read-only)
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

// Main component
export const TrialEditPanel: React.FC<TrialEditPanelProps> = ({
  open,
  onClose,
  trialName,
  initialTrialData,
  onSave,
  enableAutoSave = false,
}) => {
  // Convert trial data to form data
  const initialFormData = useMemo(() => trialToFormData(initialTrialData), [initialTrialData]);
  
  // Handle save
  const handleSave = useCallback(async (formData: TrialEditFormData) => {
    const trialData = formDataToTrial(formData);
    if (onSave) {
      await onSave(trialData);
    }
  }, [onSave]);

  return (
    <EditPanelWrapper<TrialEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Trial"
      subtitle={`Editing details for ${trialName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      validateData={validateTrialData}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
    >
      <TrialEditForm />
    </EditPanelWrapper>
  );
};

export default TrialEditPanel;