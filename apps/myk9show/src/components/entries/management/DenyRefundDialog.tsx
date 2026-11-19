import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DENY_REFUND_REASON_MAX_LENGTH } from '@/features/payments/denyRefundReason';

interface DenyRefundDialogProps {
  open: boolean;
  dogName: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}

/**
 * MYK9-2001: Deny refund asks for the reason, because the exhibitor is emailed the outcome and
 * "No refund" with nothing after it is the version that makes her email the secretary. The reason
 * is required; it is the secretary's own words, so the copy says who reads it.
 */
export function DenyRefundDialog({
  open,
  dogName,
  isSaving,
  onOpenChange,
  onConfirm,
}: DenyRefundDialogProps) {
  // Unmounted while closed, so a half-typed reason never carries into another entry's dialog.
  return (
    <Dialog open={open} onOpenChange={next => !isSaving && onOpenChange(next)}>
      <DialogContent>
        {open && (
          <DenyRefundBody
            dogName={dogName}
            isSaving={isSaving}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DenyRefundBody({
  dogName,
  isSaving,
  onConfirm,
  onCancel,
}: Pick<DenyRefundDialogProps, 'dogName' | 'isSaving' | 'onConfirm'> & { onCancel: () => void }) {
  const [reason, setReason] = useState('');
  const trimmed = reason.trim();

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (trimmed && !isSaving) onConfirm(trimmed);
      }}
    >
      <DialogHeader>
        <DialogTitle>Deny refund for {dogName}?</DialogTitle>
        <DialogDescription>
          The exhibitor is emailed that there is no refund, with your reason.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2 py-4">
        <Label htmlFor="deny-refund-reason">Reason</Label>
        <Textarea
          id="deny-refund-reason"
          value={reason}
          maxLength={DENY_REFUND_REASON_MAX_LENGTH}
          rows={3}
          required
          autoFocus
          placeholder="For example: pulled after the closing date, per the premium"
          onChange={event => setReason(event.target.value)}
        />
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={isSaving} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!trimmed || isSaving}>
          {isSaving ? 'Saving…' : 'Deny refund'}
        </Button>
      </DialogFooter>
    </form>
  );
}
