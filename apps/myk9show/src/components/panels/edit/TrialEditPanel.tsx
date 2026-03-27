import React, { useState, useCallback, useMemo } from 'react';
import { z } from 'zod';
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
import { parseLocalDateString } from '@/utils/dateLocal';
import type { Trial } from '@/components/trials/types/trial.types';
import type { ClassStatusValue } from '@myk9/core';
import { cn } from '@/lib/utils';
import { FormField } from '@/components/common/FormField';

interface TrialEditPanelProps {
  open: boolean;
  onClose: () => void;
  trialId: string;
  trialName: string;
  initialTrialData: Partial<Trial>;
  onSave?: (trialData: Partial<Trial>) => Promise<void>;
  enableAutoSave?: boolean;
  showAdvancedFields?: boolean;
  organization?: string;
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

// Zod schema for trial edit form validation
const trialEditSchema = z.object({
  name: z.string().min(1, 'Please enter a trial name'),
  trialNumber: z.string().min(1, 'Please enter a trial number'),
  trialDate: z.string().min(1, 'Please select a trial date'),
  eventNumber: z.string().min(1, 'Please enter an event number'),
  status: z.string().min(1, 'Please select a status'),
  plannedStartTime: z
    .string()
    .regex(/^\d{1,2}:\d{2}\s?(AM|PM|am|pm)$/i, 'Please enter a valid time (e.g., 9:00 AM)'),
  order: z.string().refine(
    val => {
      const n = parseInt(val, 10);
      return !isNaN(n) && n >= 0;
    },
    { message: 'Order must be a number' }
  ),
  showId: z.string().optional().or(z.literal('')),
  showName: z.string().optional().or(z.literal('')),
  type: z.string().optional().or(z.literal('')),
  trialType: z.string().optional().or(z.literal('')),
  image: z.string().optional().or(z.literal('')),
  timeStarted: z.string().optional().or(z.literal('')),
  timeEnded: z.string().optional().or(z.literal('')),
}) as z.ZodSchema<TrialEditFormData>;

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

// Tab type
type TabId = 'basic' | 'scheduling' | 'advanced';

// Fields that belong to each tab (for touch-on-leave validation)
const TAB_FIELDS: Record<TabId, (keyof TrialEditFormData)[]> = {
  basic: ['name', 'trialNumber', 'eventNumber', 'status'],
  scheduling: ['trialDate', 'order', 'plannedStartTime'],
  advanced: [],
};

// Form content component
interface TrialEditFormProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TrialEditForm: React.FC<TrialEditFormProps> = ({ activeTab, onTabChange }) => {
  const { form } = useEditPanel<TrialEditFormData>();

  // Touch all fields on the departing tab before switching
  const handleTabChange = useCallback(
    (newTab: string) => {
      if (form && TAB_FIELDS[activeTab]) {
        TAB_FIELDS[activeTab].forEach(field => form.touchField(field));
      }
      onTabChange(newTab as TabId);
    },
    [form, activeTab, onTabChange]
  );

  // Date picker state
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    form?.data.trialDate ? parseLocalDateString(form.data.trialDate) : undefined
  );

  // Handle input changes
  const handleInputChange = useCallback(
    (field: keyof TrialEditFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        form?.setValue(field, e.target.value);
      },
    [form]
  );

  // Handle select changes
  const handleSelectChange = useCallback(
    (field: keyof TrialEditFormData) => (value: string) => {
      form?.setValue(field, value);
    },
    [form]
  );

  // Handle date changes
  const handleDateChange = useCallback(
    (date: Date | undefined) => {
      setSelectedDate(date);
      if (date) {
        form?.setValue('trialDate', format(date, 'yyyy-MM-dd'));
      }
    },
    [form]
  );

  // Pre-compute error states (safe with optional chaining when form is null)
  const nameError = form?.getError('name');
  const trialNumberError = form?.getError('trialNumber');
  const eventNumberError = form?.getError('eventNumber');
  const statusError = form?.getError('status');
  const trialDateError = form?.getError('trialDate');
  const orderError = form?.getError('order');
  const plannedStartTimeError = form?.getError('plannedStartTime');

  // Per-tab error counts for tab badges
  const tabErrorCounts = useMemo(
    () => ({
      basic: [nameError, trialNumberError, eventNumberError, statusError].filter(Boolean).length,
      scheduling: [trialDateError, orderError, plannedStartTimeError].filter(Boolean).length,
      advanced: 0,
    }),
    [
      nameError,
      trialNumberError,
      eventNumberError,
      statusError,
      trialDateError,
      orderError,
      plannedStartTimeError,
    ]
  );
  if (!form) return null;

  return (
    <div className="space-y-6 p-6">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-gradient-to-r from-muted/50 to-muted/30 border border-border/30 rounded-xl p-1 transition-all duration-300 ease-out">
          <TabsTrigger
            value="basic"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Info className="h-4 w-4" />
            Basic Info
            {tabErrorCounts.basic > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
                {tabErrorCounts.basic}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="scheduling"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Clock className="h-4 w-4" />
            Scheduling
            {tabErrorCounts.scheduling > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
                {tabErrorCounts.scheduling}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="advanced"
            className="gap-2 data-[state=active]:bg-gradient-to-r data-[state=active]:from-primary/10 data-[state=active]:to-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-sm rounded-lg transition-all duration-300"
          >
            <Settings className="h-4 w-4" />
            Advanced
            {tabErrorCounts.advanced > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium leading-none text-destructive-foreground">
                {tabErrorCounts.advanced}
              </span>
            )}
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
                  value={form.data.name}
                  onChange={handleInputChange('name')}
                  onBlur={() => form.touchField('name')}
                  placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
                  className={cn(nameError && 'border-destructive')}
                  {...form.getFieldProps('name')}
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
                    value={form.data.trialNumber}
                    onChange={handleInputChange('trialNumber')}
                    onBlur={() => form.touchField('trialNumber')}
                    placeholder="1"
                    className={cn(trialNumberError && 'border-destructive')}
                    {...form.getFieldProps('trialNumber')}
                  />
                </FormField>

                <FormField
                  label="Event Number"
                  fieldId="eventNumber"
                  required
                  error={eventNumberError}
                >
                  <Input
                    id="eventNumber"
                    value={form.data.eventNumber}
                    onChange={handleInputChange('eventNumber')}
                    onBlur={() => form.touchField('eventNumber')}
                    placeholder="Assigned by organization"
                    className={cn(eventNumberError && 'border-destructive')}
                    {...form.getFieldProps('eventNumber')}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField label="Trial Type" fieldId="trialType">
                  <Select
                    value={form.data.trialType || ''}
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
                  <Select value={form.data.status} onValueChange={handleSelectChange('status')}>
                    <SelectTrigger
                      id="status"
                      className={cn(statusError && 'border-destructive')}
                      {...form.getFieldProps('status')}
                      onBlur={() => form.touchField('status')}
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
                        {...form.getFieldProps('trialDate')}
                        onBlur={() => form.touchField('trialDate')}
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
                    value={form.data.order}
                    onChange={handleInputChange('order')}
                    onBlur={() => form.touchField('order')}
                    placeholder="Display order"
                    min="1"
                    className={cn(orderError && 'border-destructive')}
                    {...form.getFieldProps('order')}
                  />
                </FormField>
              </div>

              <FormField
                label="Planned Start Time"
                fieldId="plannedStartTime"
                required
                error={plannedStartTimeError}
              >
                <Input
                  id="plannedStartTime"
                  value={form.data.plannedStartTime}
                  onChange={handleInputChange('plannedStartTime')}
                  onBlur={() => form.touchField('plannedStartTime')}
                  placeholder="e.g., 09:00 AM"
                  className={cn(plannedStartTimeError && 'border-destructive')}
                  {...form.getFieldProps('plannedStartTime')}
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
                      value={form.data.timeStarted || ''}
                      onChange={handleInputChange('timeStarted')}
                      placeholder="e.g., 09:15 AM"
                    />
                  </FormField>

                  <FormField label="Time Ended" fieldId="timeEnded">
                    <Input
                      id="timeEnded"
                      value={form.data.timeEnded || ''}
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
                  value={form.data.type || ''}
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
                  value={form.data.image || ''}
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
                  value={form.data.showId}
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

// Scroll to a field by id after the DOM updates
function scrollToField(fieldId: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      ) {
        el.focus();
      }
      const errorEl = document.getElementById(`${fieldId}-error`);
      if (errorEl) {
        errorEl.classList.remove('animate-pulse-error');
        void errorEl.offsetWidth;
        errorEl.classList.add('animate-pulse-error');
      }
    }
  });
}

// Main component
export const TrialEditPanel: React.FC<TrialEditPanelProps> = ({
  open,
  onClose,
  trialName,
  initialTrialData,
  onSave,
  enableAutoSave = false,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('basic');

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

  // When validation fails, switch to the tab containing the first error and scroll to it
  const handleValidationFail = useCallback((firstErrorField: string) => {
    for (const [tab, fields] of Object.entries(TAB_FIELDS)) {
      if ((fields as string[]).includes(firstErrorField)) {
        setActiveTab(tab as TabId);
        scrollToField(firstErrorField);
        break;
      }
    }
  }, []);

  return (
    <EditPanelWrapper<TrialEditFormData>
      open={open}
      onClose={onClose}
      title="Edit Trial"
      subtitle={`Editing details for ${trialName}`}
      size="xl"
      initialData={initialFormData}
      onSave={handleSave}
      schema={trialEditSchema}
      enableAutoSave={enableAutoSave}
      saveLabel="Save Changes"
      cancelLabel="Cancel"
      onValidationFail={handleValidationFail}
    >
      <TrialEditForm activeTab={activeTab} onTabChange={setActiveTab} />
    </EditPanelWrapper>
  );
};

export default TrialEditPanel;
