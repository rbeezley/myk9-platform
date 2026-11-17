import React from 'react';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ClassChangeDeclineDialogProps {
  open: boolean;
  dogName: string | undefined;
  reason: string;
  onReasonChange: (reason: string) => void;
  isProcessing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Decline keeps its reason dialog: the exhibitor sees the reason on their row. */
export const ClassChangeDeclineDialog: React.FC<ClassChangeDeclineDialogProps> = ({
  open,
  dogName,
  reason,
  onReasonChange,
  isProcessing,
  onConfirm,
  onClose,
}) => (
  <Dialog open={open} onOpenChange={next => !next && onClose()}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Decline class change</DialogTitle>
        <DialogDescription>
          Decline the class change for {dogName}. {dogName} stays in the current class and the
          exhibitor sees your reason.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2 py-4">
        <label htmlFor="class-change-decline-reason" className="text-sm font-medium">
          Reason (optional)
        </label>
        <Textarea
          id="class-change-decline-reason"
          placeholder="Enter a reason for declining this request..."
          value={reason}
          onChange={e => onReasonChange(e.target.value)}
          rows={3}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={isProcessing}>
          Cancel
        </Button>
        <Button variant="destructive" onClick={onConfirm} disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <X className="mr-2 h-4 w-4" />
              Decline
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
