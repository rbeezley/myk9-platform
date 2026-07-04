import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REFUND_METHODS, type RefundDialog } from './enrollmentPayment';

interface EnrollmentRefundDialogProps {
  state: RefundDialog;
  onChange: (next: RefundDialog) => void;
  paidDollars: number;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Controlled dialog for recording a manual refund (full or partial) on an
 * enrollment. State and the payment write live in the parent EnrollmentCard;
 * this shell owns only the presentation.
 */
export const EnrollmentRefundDialog: React.FC<EnrollmentRefundDialogProps> = ({
  state,
  onChange,
  paidDollars,
  onClose,
  onConfirm,
}) => (
  <Dialog open={state.open} onOpenChange={next => !next && onClose()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>{state.isPartial ? 'Record Partial Refund' : 'Record Refund'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        {paidDollars > 0 && (
          <div className="text-sm text-muted-foreground">
            Amount paid:{' '}
            <span className="font-medium text-foreground">${paidDollars.toFixed(2)}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="refund-amount">
            Refund Amount{' '}
            {!state.isPartial && (
              <span className="text-muted-foreground font-normal">(pre-filled from paid)</span>
            )}
          </Label>
          <Input
            id="refund-amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Amount ($)"
            value={state.amount}
            onChange={e => onChange({ ...state, amount: e.target.value })}
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="refund-method">Refund Method</Label>
          <Select
            value={state.method}
            onValueChange={v => onChange({ ...state, method: v as RefundDialog['method'] })}
          >
            <SelectTrigger id="refund-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REFUND_METHODS.map(m => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="refund-notes">
            Notes <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="refund-notes"
            placeholder="e.g. check mailed 5/1/2026"
            value={state.notes}
            onChange={e => onChange({ ...state, notes: e.target.value })}
          />
        </div>

        {(!state.amount || !(parseFloat(state.amount) > 0)) && (
          <p className="text-xs text-muted-foreground">
            Enter a refund amount greater than $0 to record this refund.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={!state.amount || !(parseFloat(state.amount) > 0)}>
          Record Refund
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EnrollmentRefundDialog;
