import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AppleDialog, AppleFormField, AppleFormGrid } from '@/components/ui/AppleDialog';

interface AddTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (trial: { name: string; date: string; trialNumber: string; status: string; eventNumber: string; plannedStartTime: string; order: string; showName: string; description: string }) => void;
  currentShowName?: string;
}

const AddTrialDialog: React.FC<AddTrialDialogProps> = ({ open, onOpenChange, onSave, currentShowName }) => {
  const [formData, setFormData] = useState({
    name: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    trialNumber: `TR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    status: 'Upcoming',
    description: '',
    eventNumber: `EV-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
    plannedStartTime: '09:00 AM',
    order: '1',
    showName: currentShowName || '',
  });

  // Update showName when currentShowName prop changes
  React.useEffect(() => {
    if (currentShowName) {
      setFormData(prev => ({ ...prev, showName: currentShowName }));
    }
  }, [currentShowName]);
  
  const [date, setDate] = useState<Date | undefined>(new Date());

  const handleSave = () => {
    onSave({
      ...formData,
      date: date ? format(date, 'MMMM d, yyyy') : '',
    });
  };

  return (
    <AppleDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add New Trial"
      description="Fill in the details for the new trial. Click save when you're done."
      onSave={handleSave}
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
            value={formData.plannedStartTime}
            onChange={(e) => setFormData({...formData, plannedStartTime: e.target.value})}
            placeholder="e.g., 09:00 AM"
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

export default AddTrialDialog;