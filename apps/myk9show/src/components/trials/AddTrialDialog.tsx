import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@myk9/ui';

interface AddTrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (trial: {
    name: string;
    date: string;
    trialNumber: string;
    status: string;
    eventNumber: string;
    plannedStartTime: string;
    order: string;
    showName: string;
    description: string;
  }) => void;
  currentShowName?: string | undefined;
  /** Number of existing trials in the show, used to auto-set next trial number */
  existingTrialCount?: number;
}

const AddTrialDialog: React.FC<AddTrialDialogProps> = ({
  open,
  onOpenChange,
  onSave,
  currentShowName,
  existingTrialCount = 0,
}) => {
  const [formData, setFormData] = useState(() => {
    const nextNumber = String(existingTrialCount + 1);
    return {
      name: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      trialNumber: nextNumber,
      status: 'upcoming',
      description: '',
      eventNumber: '',
      plannedStartTime: '09:00 AM',
      order: nextNumber,
      showName: currentShowName || '',
    };
  });

  // Reset form when dialog opens
  React.useEffect(() => {
    if (open) {
      const nextNumber = String(existingTrialCount + 1);
      setFormData({
        name: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        trialNumber: nextNumber,
        status: 'upcoming',
        description: '',
        eventNumber: '',
        plannedStartTime: '09:00 AM',
        order: nextNumber,
        showName: currentShowName || '',
      });
      setDate(new Date());
    }
  }, [open, existingTrialCount, currentShowName]);

  const [date, setDate] = useState<Date | undefined>(new Date());

  const handleSave = () => {
    // Validate required fields
    if (!formData.name.trim()) return;
    if (!formData.trialNumber.trim()) return;
    if (!date) return;

    onSave({
      ...formData,
      date: date ? format(date, 'yyyy-MM-dd') : '',
    });

    // Reset form after successful save — increment trial number
    const nextNumber = String(existingTrialCount + 2); // +2 because we just added one
    setFormData({
      name: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      trialNumber: nextNumber,
      status: 'upcoming',
      description: '',
      eventNumber: '',
      plannedStartTime: '09:00 AM',
      order: nextNumber,
      showName: currentShowName || '',
    });
    setDate(new Date());
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>Add New Trial</SheetTitle>
          <SheetDescription>
            Fill in the details for the new trial. Click save when you're done.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <div className="space-y-4">
            {/* Trial Name - Full Width */}
            <div className="space-y-2">
              <Label>
                Trial Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter trial name (e.g., Scent Work, Agility, Obedience)"
                className="h-10"
              />
            </div>

            {/* Trial Number and Date */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Trial Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={10}
                  value={formData.trialNumber}
                  onChange={e => setFormData({ ...formData, trialNumber: e.target.value })}
                  placeholder="1"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Date <span className="text-destructive">*</span>
                </Label>
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
                    <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Event Number and Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Number</Label>
                <Input
                  value={formData.eventNumber}
                  onChange={e => setFormData({ ...formData, eventNumber: e.target.value })}
                  placeholder="Assigned by organization"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Status <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={value => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Planned Start Time and Order */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>
                  Planned Start Time <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={formData.plannedStartTime}
                  onChange={e => setFormData({ ...formData, plannedStartTime: e.target.value })}
                  placeholder="e.g., 09:00 AM"
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <Label>
                  Order <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="number"
                  value={formData.order}
                  onChange={e => setFormData({ ...formData, order: e.target.value })}
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
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional notes about this trial"
                rows={3}
              />
            </div>
          </div>
        </SheetBody>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!formData.name.trim() || !formData.trialNumber.trim() || !date}
          >
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default AddTrialDialog;
