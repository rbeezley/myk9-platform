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
import type { ShowMapNode } from './showMapTypes';

interface ShowMapScratchNoShowDialogProps {
  open: boolean;
  node?: ShowMapNode | undefined;
  isSubmitting: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | undefined) => void;
}

export function ShowMapScratchNoShowDialog({
  open,
  node,
  isSubmitting,
  onOpenChange,
  onConfirm,
}: ShowMapScratchNoShowDialogProps) {
  const [reason, setReason] = useState('');
  const display = node?.entryDisplay;
  const entryName = display?.dogName ?? node?.label ?? 'this entry';
  const armband = display?.armband;

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setReason('');
    onOpenChange(nextOpen);
  };

  const handleConfirm = () => {
    onConfirm(reason.trim() || undefined);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Mark scratch / no-show
          </DialogTitle>
          <DialogDescription>
            This marks the entry pulled so ringside will stop waiting for the dog.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-4 text-sm">
            <div className="font-medium">{entryName}</div>
            {armband && <div className="text-muted-foreground">Armband {armband}</div>}
          </div>

          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            Refunds are not automatic. Handle any refund manually after marking the entry pulled.
          </div>

          <div className="space-y-2">
            <Label htmlFor="scratch-reason">Reason</Label>
            <Textarea
              id="scratch-reason"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="No-show, handler withdrew, dog absent..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Marking pulled...' : 'Mark pulled'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
