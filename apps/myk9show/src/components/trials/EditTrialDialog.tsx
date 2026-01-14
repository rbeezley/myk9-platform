import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Trial</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trial Name - Full Width */}
          <div className="space-y-2">
            <Label>Trial Name <span className="text-destructive">*</span></Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
              className="h-10"
            />
          </div>

          {/* Show Name - Full Width */}
          <div className="space-y-2">
            <Label>Show Name</Label>
            <Input
              value={formData.showName}
              onChange={(e) => setFormData({...formData, showName: e.target.value})}
              placeholder="Associated show name"
              className="h-10"
              disabled
            />
          </div>

          {/* Trial Number and Date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Trial Number <span className="text-destructive">*</span></Label>
              <Input
                value={formData.trialNumber}
                onChange={(e) => setFormData({...formData, trialNumber: e.target.value})}
                placeholder="Trial #"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Date <span className="text-destructive">*</span></Label>
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
            </div>
          </div>

          {/* Event Number and Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Event Number <span className="text-destructive">*</span></Label>
              <Input
                value={formData.eventNumber}
                onChange={(e) => setFormData({...formData, eventNumber: e.target.value})}
                placeholder="e.g., EV-2025-001"
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Status <span className="text-destructive">*</span></Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({...formData, status: value})}>
                <SelectTrigger className="h-10">
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

          {/* Planned Start Time and Order */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Planned Start Time <span className="text-destructive">*</span></Label>
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
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label>Order <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                value={formData.order}
                onChange={(e) => setFormData({...formData, order: e.target.value})}
                placeholder="Display order"
                className="h-10"
              />
            </div>
          </div>

          {/* Description - Full Width */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({...formData, description: e.target.value})}
              placeholder="Optional notes about this trial"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditTrialDialog;
