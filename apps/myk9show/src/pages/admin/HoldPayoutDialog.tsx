/**
 * MYK9-2171: holding a payout is one decision with one field, so it is a dialog
 * (docs/INTENT.md "Dialog or Slide-Out"). Approve and the brake switch use the
 * shared ConfirmDialog.
 */
import { useState } from 'react';
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
import { HOLD_REASON_MAX, holdReasonProblem } from '@/features/payments/payoutApproval';

interface HoldDialogProps {
  open: boolean;
  payoutLabel: string;
  pending: boolean;
  onHold: (reason: string) => void;
  onCancel: () => void;
}

export function HoldPayoutDialog({
  open,
  payoutLabel,
  pending,
  onHold,
  onCancel,
}: HoldDialogProps) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();
  const tooLong = trimmed.length > HOLD_REASON_MAX;
  const canHold = holdReasonProblem(reason) === null && !pending;

  const close = () => {
    if (pending) return;
    setReason('');
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={next => !next && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Hold this payout?</DialogTitle>
          <DialogDescription>
            {payoutLabel} will not be sent until you approve it. The club can see this reason.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="payout-hold-reason">Reason</Label>
          <Textarea
            id="payout-hold-reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            aria-invalid={tooLong}
            aria-describedby="payout-hold-reason-help"
            rows={3}
          />
          <p
            id="payout-hold-reason-help"
            className={tooLong ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}
          >
            {tooLong
              ? `Keep the reason under ${HOLD_REASON_MAX} characters.`
              : 'Say why, in a sentence the club will understand.'}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="min-h-11" onClick={close} disabled={pending}>
            Cancel
          </Button>
          <Button
            className="min-h-11"
            disabled={!canHold}
            onClick={() => {
              onHold(trimmed);
            }}
          >
            {pending ? 'Holding…' : 'Hold payout'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
