/**
 * Pull Confirmation Dialog
 *
 * Dialog for confirming an entry pull with an optional reason
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
import { updateReplicatedDayOfScratch } from '@/services/show-day/checkInStatus';
import type { PullableEntry } from './types';

interface PullDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry: PullableEntry | null;
  onSuccess: () => void;
}

export function PullDialog({ open, onOpenChange, entry, onSuccess }: PullDialogProps) {
  const [reason, setReason] = useState('');
  const [isPulling, setIsPulling] = useState(false);

  const handlePull = async () => {
    if (!entry) return;

    setIsPulling(true);
    try {
      await updateReplicatedDayOfScratch(entry.id, reason || 'Marked pulled from Day of Show');

      toast.success('Entry pulled successfully');
      onOpenChange(false);
      setReason('');
      onSuccess();
    } catch (error) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setIsPulling(false);
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
            Confirm Pull
          </DialogTitle>
          <DialogDescription>
            This will pull the entry from the class. Day-of pulls are not eligible for
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
                placeholder="Enter reason for pulling..."
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
          <Button variant="destructive" onClick={handlePull} disabled={isPulling}>
            {isPulling ? 'Pulling...' : 'Confirm Pull'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
