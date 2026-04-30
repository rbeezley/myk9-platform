import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const WITHDRAWAL_REASONS = ['In-Season Dog', 'Judge Change'] as const;
type WithdrawalReason = (typeof WITHDRAWAL_REASONS)[number];

interface WithdrawalReasonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

export const WithdrawalReasonDialog: React.FC<WithdrawalReasonDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const [reason, setReason] = useState<WithdrawalReason | ''>('');
  const [notes, setNotes] = useState('');

  const reset = () => {
    setReason('');
    setNotes('');
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleConfirm = () => {
    if (!reason) return;
    const combined = notes.trim() ? `${reason}: ${notes.trim()}` : reason;
    onConfirm(combined);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Withdrawal Reason</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="withdrawal-reason">
              Reason <span className="text-destructive">*</span>
            </Label>
            <Select value={reason} onValueChange={v => setReason(v as WithdrawalReason)}>
              <SelectTrigger id="withdrawal-reason">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent>
                {WITHDRAWAL_REASONS.map(r => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="withdrawal-notes">
              Notes <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Textarea
              id="withdrawal-notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. vet certification on file"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!reason}>
            Confirm Withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalReasonDialog;
