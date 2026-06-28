import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EnrollmentCheckPaymentDialogProps {
  open: boolean;
  checkNumber: string;
  onCheckNumberChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Controlled dialog for recording a full check payment on an enrollment.
 * State and the payment write live in the parent EnrollmentCard; this is a
 * purely presentational shell extracted to keep that file under the line limit.
 */
export const EnrollmentCheckPaymentDialog: React.FC<EnrollmentCheckPaymentDialogProps> = ({
  open,
  checkNumber,
  onCheckNumberChange,
  onClose,
  onConfirm,
}) => (
  <Dialog open={open} onOpenChange={next => !next && onClose()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Record Check Payment</DialogTitle>
      </DialogHeader>
      <div className="py-2">
        <Input
          placeholder="Check number (optional)"
          value={checkNumber}
          onChange={e => onCheckNumberChange(e.target.value)}
          autoFocus
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Confirm</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EnrollmentCheckPaymentDialog;
