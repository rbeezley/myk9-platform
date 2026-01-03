import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AppleDialog, AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';

interface EditTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (trial: { 
    id?: string; 
    name: string; 
    date: string; 
    type: string; 
    description?: string;
    trialNumber?: string;
    status?: string;
    eventNumber?: string;
    plannedStartTime?: string;
    order?: string;
    showName?: string;
  }) => void;
  trial: { 
    id?: string; 
    name?: string; 
    date: string; 
    type?: string; 
    description?: string; 
    showName?: string;
    trialNumber?: string;
    status?: string;
    eventNumber?: string;
    plannedStartTime?: string;
    order?: string;
  } | null;
}

const EditTrialDialog: React.FC<EditTrialDialogProps> = ({ open, onOpenChange, onSave, trial }) => {
  const [formData, setFormData] = useState({
    id: null as number | null,
    name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    trialNumber: '',
    status: 'Upcoming',
    description: '',
    eventNumber: '',
    plannedStartTime: '',
    order: '',
    showName: '',
  });
  const [date, setDate] = useState<Date | undefined>(new Date());

  // Helper function to convert 12-hour format to 24-hour format for input
  const convertTo24Hour = (time12h: string): string => {
    if (!time12h) return '';
    const match = time12h.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!match) return '';
    
    const [, hours, minutes, period] = match;
    let hour24 = parseInt(hours);
    
    if (period.toUpperCase() === 'AM' && hour24 === 12) {
      hour24 = 0;
    } else if (period.toUpperCase() === 'PM' && hour24 !== 12) {
      hour24 += 12;
    }
    
    return `${hour24.toString().padStart(2, '0')}:${minutes}`;
  };

  useEffect(() => {
    if (trial) {
      setFormData({
        id: trial.id ? parseInt(trial.id) : null,
        name: trial.name || trial.type || '',
        date: trial.date || format(new Date(), 'yyyy-MM-dd'),
        trialNumber: trial.trialNumber || '',
        status: trial.status || 'Upcoming',
        description: trial.description || '',
        eventNumber: trial.eventNumber || '',
        plannedStartTime: trial.plannedStartTime || '',
        order: trial.order || '',
        showName: trial.showName || '',
      });
      setDate(trial.date ? new Date(trial.date) : new Date());
    }
  }, [trial]);

  const handleSave = () => {
    onSave({
      id: formData.id ? String(formData.id) : undefined,
      name: formData.name,
      date: date ? format(date, 'yyyy-MM-dd') : '',
      type: formData.name,
      description: formData.description,
      trialNumber: formData.trialNumber,
      status: formData.status,
      eventNumber: formData.eventNumber,
      plannedStartTime: formData.plannedStartTime,
      order: formData.order,
      showName: formData.showName
    });
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Edit Trial"
      onSave={handleSave}
      saveLabel="Save Changes"
      maxWidth="2xl"
    >
      {/* Trial Name - Full Width */}
      <AppleFormGrid columns={1}>
        <AppleFormField label="Trial Name" required>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
            className="form-input h-10"
          />
        </AppleFormField>
      </AppleFormGrid>

      {/* Show Name - Full Width */}
      <AppleFormGrid columns={1}>
        <AppleFormField label="Show Name">
          <Input
            value={formData.showName}
            onChange={(e) => setFormData({...formData, showName: e.target.value})}
            placeholder="Associated show name"
            className="form-input h-10"
            disabled
          />
        </AppleFormField>
      </AppleFormGrid>

      {/* Trial Number and Date */}
      <AppleFormGrid columns={2}>
        <AppleFormField label="Trial Number" required>
          <Input
            value={formData.trialNumber}
            onChange={(e) => setFormData({...formData, trialNumber: e.target.value})}
            placeholder="Trial #"
            className="form-input h-10"
          />
        </AppleFormField>
        <AppleFormField label="Date" required>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal h-10',
                  !date && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={date}
                onSelect={setDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </AppleFormField>
      </AppleFormGrid>

      {/* Event Number and Status */}
      <AppleFormGrid columns={2}>
        <AppleFormField label="Event Number" required>
          <Input
            value={formData.eventNumber}
            onChange={(e) => setFormData({...formData, eventNumber: e.target.value})}
            placeholder="e.g., EV-2025-001"
            className="form-input h-10"
          />
        </AppleFormField>
        <AppleFormField label="Status" required>
          <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
            <SelectTrigger className="form-input h-10">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Upcoming">Upcoming</SelectItem>
              <SelectItem value="In Progress">In Progress</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </AppleFormField>
      </AppleFormGrid>

      {/* Planned Start Time and Order */}
      <AppleFormGrid columns={2}>
        <AppleFormField label="Planned Start Time" required>
          <Input
            type="time"
            value={convertTo24Hour(formData.plannedStartTime)}
            onChange={(e) => {
              const time = e.target.value;
              if (time) {
                // Convert 24-hour to 12-hour format with AM/PM
                const [hours, minutes] = time.split(':');
                const hour24 = parseInt(hours);
                const hour12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
                const ampm = hour24 >= 12 ? 'PM' : 'AM';
                setFormData({...formData, plannedStartTime: `${hour12.toString().padStart(2, '0')}:${minutes} ${ampm}`});
              } else {
                setFormData({...formData, plannedStartTime: ''});
              }
            }}
            className="form-input h-10"
          />
        </AppleFormField>
        <AppleFormField label="Order" required>
          <Input
            type="number"
            value={formData.order}
            onChange={(e) => setFormData({...formData, order: e.target.value})}
            placeholder="Display order"
            className="form-input h-10"
          />
        </AppleFormField>
      </AppleFormGrid>

      {/* Description - Full Width */}
      <AppleFormGrid columns={1}>
        <AppleFormField label="Description">
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            placeholder="Optional notes about this trial"
            className="form-input"
            rows={3}
          />
        </AppleFormField>
      </AppleFormGrid>
    </AppleDialog>
  );
};

export default EditTrialDialog;
