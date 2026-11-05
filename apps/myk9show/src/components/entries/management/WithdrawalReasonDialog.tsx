import React, { useState, type ReactNode } from 'react';
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
  /** MYK9-1688: dog-level Withdraw reuses this dialog and its two reasons, with its own title. */
  title?: string;
  confirmLabel?: string;
  /** Shown above the reason field (the dog-level scope and the read-only refund suggestions). */
  children?: ReactNode;
  /**
   * MYK9-1615: why the confirm must wait even with a reason chosen (the dog-level refund
   * outcomes are not all known yet). Null or omitted means nothing else is pending.
   */
  confirmBlockedReason?: string | null;
}

export const WithdrawalReasonDialog: React.FC<WithdrawalReasonDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  title = 'Record Withdrawal Reason',
  confirmLabel = 'Confirm Withdrawal',
  children,
  confirmBlockedReason = null,
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
    if (!reason || confirmBlockedReason) return;
    const combined = notes.trim() ? `${reason}: ${notes.trim()}` : reason;
    onConfirm(combined);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {children}
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
          {!reason ? (
            <p className="text-xs text-muted-foreground">
              Select a withdrawal reason to confirm the withdrawal.
            </p>
          ) : (
            confirmBlockedReason && (
              <p className="text-xs text-muted-foreground">{confirmBlockedReason}</p>
            )
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!reason || !!confirmBlockedReason}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WithdrawalReasonDialog;
