import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormField } from '@/components/common/FormField';
import { Gift } from 'lucide-react';

interface CompEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryNumber: string;
  dogName: string;
  className?: string;
  onConfirm: (reason: string) => void;
  isProcessing?: boolean;
}

/**
 * Dialog for comping an entry — collects the reason text.
 */
export const CompEntryDialog: React.FC<CompEntryDialogProps> = ({
  open,
  onOpenChange,
  dogName,
  className,
  onConfirm,
  isProcessing = false,
}) => {
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    onConfirm(reason.trim() || 'No reason provided');
    setReason('');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) setReason('');
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Comp Entry
          </DialogTitle>
          <DialogDescription>
            Mark <strong>{dogName}</strong>{className ? <> — <strong>{className}</strong></> : null} as comped.
            This waives all fees.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <FormField label="Reason" fieldId="comp-reason">
            <Textarea
              id="comp-reason"
              placeholder="e.g., Judge entry, Worker comp, Club guest..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </FormField>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isProcessing}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing}>
            Comp Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CompEntryDialog;
