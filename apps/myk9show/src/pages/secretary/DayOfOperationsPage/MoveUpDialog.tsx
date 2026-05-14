/**
 * Move-Up Dialog
 *
 * Dialog for processing entry move-ups to higher classes
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getUserFriendlyError } from '@/utils/errorMessages';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { ArrowUpCircle } from 'lucide-react';
import { processMoveUp, ClassWithCapacity } from '@/services/database/day-of-operations';
import type { DayOfOperationEntry } from './types';

interface MoveUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: DayOfOperationEntry | null;
  classes: ClassWithCapacity[];
  onSuccess: () => void;
}

export function MoveUpDialog({ open, onOpenChange, entry, classes, onSuccess }: MoveUpDialogProps) {
  const [targetClassId, setTargetClassId] = useState('');
  const [reason, setReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const availableTargetClasses = classes.filter(
    c => c.available_spots > 0 && c.id !== entry?.class_id
  );

  const handleMoveUp = async () => {
    if (!entry || !targetClassId) return;

    setIsProcessing(true);
    try {
      const { data, error } = await processMoveUp(entry.id, targetClassId, reason || undefined);

      if (error) {
        toast.error(getUserFriendlyError(error));
        return;
      }

      toast.success(`Move-up processed! Entry moved to ${data?.class?.name || 'new class'}`);
      onOpenChange(false);
      setTargetClassId('');
      setReason('');
      onSuccess();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setTargetClassId('');
      setReason('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5" />
            Process Move-Up
          </DialogTitle>
          <DialogDescription>
            Move this entry to a higher class level after qualifying
          </DialogDescription>
        </DialogHeader>

        {entry && (
          <div className="space-y-4">
            <div className="bg-muted p-4 rounded-md space-y-2">
              <div>
                <span className="font-medium">Dog:</span> {entry.dog?.name}
              </div>
              <div>
                <span className="font-medium">Armband:</span> {entry.armband || '-'}
              </div>
              <div>
                <span className="font-medium">Current Class:</span> {entry.class?.name}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Class *</Label>
              <Select value={targetClassId} onValueChange={setTargetClassId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target class" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargetClasses.map(cls => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.class_number && `#${cls.class_number} `}
                      {cls.name} ({cls.available_spots} spots)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="e.g., Qualified in Novice"
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancel
          </Button>
          <Button onClick={handleMoveUp} disabled={isProcessing || !targetClassId}>
            {isProcessing ? 'Processing...' : 'Process Move-Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
