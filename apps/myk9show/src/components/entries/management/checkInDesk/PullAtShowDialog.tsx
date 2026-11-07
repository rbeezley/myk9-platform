import { useState } from 'react';
import { Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface PullAtShowDialogProps {
  open: boolean;
  dogName: string;
  armband: string | null;
  className: string;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | undefined) => void;
}

/**
 * The confirmation before a day-of Pull from the Check-in desk (MYK9-1749). It is the real Pull
 * (INTENT "Say Which Act Happened"): the entry is stored as pulled and goes to the secretary's
 * refund review, so it asks first, names the dog and class, and says refunds are not automatic.
 */
export function PullAtShowDialog({
  open,
  dogName,
  armband,
  className,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: PullAtShowDialogProps) {
  const [reason, setReason] = useState('');

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setReason('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" aria-hidden="true" />
            Pull {dogName}?
          </DialogTitle>
          <DialogDescription>
            {armband ? `#${armband} · ` : ''}
            {className}. The judge will skip this dog, and the entry is marked pulled.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
          Refunds are not automatic. If this entry was paid online, it goes to your refund review
          for a decision.
        </div>

        <div className="space-y-2">
          <Label htmlFor="pull-reason">Reason (optional)</Label>
          <Textarea
            id="pull-reason"
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder="Dog not here, handler left, dog lame..."
          />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => onConfirm(reason.trim() || undefined)}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Pulling...' : 'Pull'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
