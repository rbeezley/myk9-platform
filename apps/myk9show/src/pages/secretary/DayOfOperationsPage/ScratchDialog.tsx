/**
 * Scratch Confirmation Dialog
 *
 * Dialog for confirming entry scratch with optional reason
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { getUserFriendlyError } from '@/utils/errorMessages';
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
import { AlertCircle } from 'lucide-react';
import { scratchEntry } from '@/services/database/day-of-operations';
import type { ScratchableEntry } from './types';

interface ScratchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: ScratchableEntry | null;
  onSuccess: () => void;
}

export function ScratchDialog({ open, onOpenChange, entry, onSuccess }: ScratchDialogProps) {
  const [reason, setReason] = useState('');
  const [isScratching, setIsScratching] = useState(false);

  const handleScratch = async () => {
    if (!entry) return;

    setIsScratching(true);
    try {
      const { error } = await scratchEntry(entry.id, reason || undefined);

      if (error) {
        toast.error(getUserFriendlyError(error));
        return;
      }

      toast.success('Entry scratched successfully');
      onOpenChange(false);
      setReason('');
      onSuccess();
    } finally {
      setIsScratching(false);
    }
  };

  const handleClose = (newOpen: boolean) => {
    if (!newOpen) {
      setReason('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Confirm Scratch
          </DialogTitle>
          <DialogDescription>
            This will scratch the entry from the class. Day-of scratches are not eligible for
            refunds.
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
                <span className="font-medium">Class:</span> {entry.class?.name}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="Enter reason for scratch..."
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
          <Button variant="destructive" onClick={handleScratch} disabled={isScratching}>
            {isScratching ? 'Scratching...' : 'Confirm Scratch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
