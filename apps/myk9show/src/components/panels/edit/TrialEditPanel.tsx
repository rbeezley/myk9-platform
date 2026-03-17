import React, { useState, useCallback, useMemo } from 'react';
import { EditPanelWrapper } from './EditPanelWrapper';
import { useEditPanel } from './useEditPanel';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarIcon, Clock, Info, Settings } from 'lucide-react';
import { format } from 'date-fns';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/common/FormField';
import { findFieldError } from '@/lib/validation';

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
    errors.push('Please enter a trial name');
  }

  if (!data.trialNumber?.trim()) {
    errors.push('Please enter a trial number');
  }

  if (!data.trialDate?.trim()) {
    errors.push('Please select a trial date');
  }

  if (!data.status?.trim()) {
    errors.push('Please select a status');
  }

  if (!data.eventNumber?.trim()) {
    errors.push('Please enter an event number');
  }

  if (!data.plannedStartTime?.trim()) {
    errors.push('Please enter a planned start time');
  }

  if (!data.order?.trim()) {
    errors.push('Please enter a display order');
  } else if (isNaN(parseInt(data.order))) {
    errors.push('Please enter a valid number for display order');
  }

  // Validate time format for planned start time (basic validation)
  if (
    data.plannedStartTime &&
    !/^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/i.test(data.plannedStartTime.trim())
  ) {
    errors.push('Please enter a valid start time (e.g., 9:00 AM or 2:30 PM)');
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
  const handleInputChange = useCallback(
    (field: keyof TrialEditFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        updateData({ [field]: e.target.value });
      },
    [updateData]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof TrialEditFormData) => (value: string) => {
      updateData({ [field]: value });
    },
    [updateData]
  );

  // Handle date changes
  const handleDateChange = useCallback(
    (date: Date | undefined) => {
      setSelectedDate(date);
      if (date) {
        updateData({ trialDate: format(date, 'yyyy-MM-dd') });
      }
    },
    [updateData]
  );

  // Pre-compute field errors
  const nameError = findFieldError(errors, 'trial name');
  const trialNumberError = findFieldError(errors, 'trial number');
  const eventNumberError = findFieldError(errors, 'event number');
  const statusError = findFieldError(errors, 'status');
  const trialDateError = findFieldError(errors, 'trial date');
  const orderError = findFieldError(errors, 'display order', 'valid number');
  const startTimeError = findFieldError(errors, 'start time');

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
        <TabsContent
          value="basic"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                Trial Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Trial Name" fieldId="name" required error={nameError}>
                <Input
                  id="name"
                  value={data.name}
                  onChange={handleInputChange('name')}
                  placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
                  className={cn(nameError && 'border-destructive')}
                  aria-invalid={!!nameError}
                  aria-describedby={nameError ? 'name-error' : undefined}
                />
              </FormField>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  label="Trial Number"
                  fieldId="trialNumber"
                  required
                  error={trialNumberError}
                >
                  <Input
                    id="trialNumber"
                    type="number"
                    min={1}
                    max={10}
                    value={data.trialNumber}
                    onChange={handleInputChange('trialNumber')}
                    placeholder="1"
                    className={cn(trialNumberError && 'border-destructive')}
                    aria-invalid={!!trialNumberError}
                    aria-describedby={trialNumberError ? 'trialNumber-error' : undefined}
                  />
                </FormField>

                <FormField label="Event Number" fieldId="eventNumber" error={eventNumberError}>
                  <Input
                    id="eventNumber"
                    value={data.eventNumber}
                    onChange={handleInputChange('eventNumber')}
                    placeholder="Assigned by organization"
                    className={cn(eventNumberError && 'border-destructive')}
                    aria-invalid={!!eventNumberError}
                    aria-describedby={eventNumberError ? 'eventNumber-error' : undefined}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Trial Type" fieldId="trialType">
                  <Select
                    value={data.trialType || ''}
                    onValueChange={handleSelectChange('trialType')}
                  >
                    <SelectTrigger id="trialType">
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
                </FormField>

                <FormField label="Status" fieldId="status" required error={statusError}>
                  <Select value={data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger
                      id="status"
                      className={cn(statusError && 'border-destructive')}
                      aria-invalid={!!statusError}
                      aria-describedby={statusError ? 'status-error' : undefined}
                    >
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="upcoming">Upcoming</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scheduling Tab */}
        <TabsContent
          value="scheduling"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Scheduling Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Trial Date" fieldId="trialDate" required error={trialDateError}>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="trialDate"
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !selectedDate && 'text-muted-foreground',
                          trialDateError && 'border-destructive'
                        )}
                        aria-invalid={!!trialDateError}
                        aria-describedby={trialDateError ? 'trialDate-error' : undefined}
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
                </FormField>

                <FormField label="Display Order" fieldId="order" required error={orderError}>
                  <Input
                    id="order"
                    type="number"
                    value={data.order}
                    onChange={handleInputChange('order')}
                    placeholder="Display order"
                    min="1"
                    className={cn(orderError && 'border-destructive')}
                    aria-invalid={!!orderError}
                    aria-describedby={orderError ? 'order-error' : undefined}
                  />
                </FormField>
              </div>

              <FormField
                label="Planned Start Time"
                fieldId="plannedStartTime"
                required
                error={startTimeError}
              >
                <Input
                  id="plannedStartTime"
                  value={data.plannedStartTime}
                  onChange={handleInputChange('plannedStartTime')}
                  placeholder="e.g., 09:00 AM"
                  className={cn(startTimeError && 'border-destructive')}
                  aria-invalid={!!startTimeError}
                  aria-describedby={startTimeError ? 'plannedStartTime-error' : undefined}
                />
              </FormField>

              <Separator />

              <div className="space-y-4">
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Actual Times (Optional)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Time Started" fieldId="timeStarted">
                    <Input
                      id="timeStarted"
                      value={data.timeStarted || ''}
                      onChange={handleInputChange('timeStarted')}
                      placeholder="e.g., 09:15 AM"
                    />
                  </FormField>

                  <FormField label="Time Ended" fieldId="timeEnded">
                    <Input
                      id="timeEnded"
                      value={data.timeEnded || ''}
                      onChange={handleInputChange('timeEnded')}
                      placeholder="e.g., 12:30 PM"
                    />
                  </FormField>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent
          value="advanced"
          className="space-y-6 animate-in slide-in-from-bottom-2 duration-300 ease-out"
        >
          <Card className="transition-all duration-200 hover:shadow-md hover:shadow-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Advanced Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField label="Category" fieldId="type">
                <Input
                  id="type"
                  value={data.type || ''}
                  onChange={handleInputChange('type')}
                  placeholder="Trial category or classification"
                />
              </FormField>

              <FormField
                label="Image URL"
                fieldId="image"
                hint="Optional image to display with this trial"
              >
                <Input
                  id="image"
                  value={data.image || ''}
                  onChange={handleInputChange('image')}
                  placeholder="https://example.com/trial-image.jpg"
                />
              </FormField>

              <FormField
                label="Show ID"
                fieldId="showId"
                hint="The show this trial belongs to (read-only)"
              >
                <Input
                  id="showId"
                  value={data.showId}
                  onChange={handleInputChange('showId')}
                  placeholder="Associated show identifier"
                  className="bg-muted text-muted-foreground"
                  disabled
                />
              </FormField>
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
  const handleSave = useCallback(
    async (formData: TrialEditFormData) => {
      const trialData = formDataToTrial(formData);
      if (onSave) {
        await onSave(trialData);
      }
    },
    [onSave]
  );

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
