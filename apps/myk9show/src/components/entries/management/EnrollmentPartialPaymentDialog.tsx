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
import { balanceAfterPayment, type PartialDialog } from './enrollmentPayment';
import { ReceivedOnField } from './EnrollmentFullPaymentDialog';

interface EnrollmentPartialPaymentDialogProps {
  state: PartialDialog;
  onChange: (next: PartialDialog) => void;
  totalDollars: number;
  paidDollars: number;
  todayInShowZone: string;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Controlled dialog for recording a partial (or method-specific) payment.
 * State and the payment write live in the parent EnrollmentCard; this shell
 * owns only the presentation, including the live "covers full balance"
 * vs "remaining after payment" hint.
 *
 * MYK9-677: the amount is THIS payment, added to what was previously paid.
 */
export const EnrollmentPartialPaymentDialog: React.FC<EnrollmentPartialPaymentDialogProps> = ({
  state,
  onChange,
  totalDollars,
  paidDollars,
  todayInShowZone,
  onClose,
  onConfirm,
}) => (
  <Dialog open={state.open} onOpenChange={next => !next && onClose()}>
    <DialogContent className="sm:max-w-sm">
      <DialogHeader>
        <DialogTitle>Record Partial Payment</DialogTitle>
      </DialogHeader>
      <div className="space-y-3 py-2">
        <div className="text-sm text-muted-foreground">
          Total due: <span className="font-medium text-foreground">${totalDollars.toFixed(2)}</span>
          {paidDollars > 0 && (
            <>
              {' '}
              · Previously paid:{' '}
              <span className="font-medium text-foreground">${paidDollars.toFixed(2)}</span>
            </>
          )}
        </div>

        <Input
          type="number"
          min="0.01"
          step="0.01"
          placeholder="Amount of this payment ($)"
          value={state.amountPaid}
          onChange={e => onChange({ ...state, amountPaid: e.target.value })}
          autoFocus
        />

        <div className="flex gap-2">
          <Button
            variant={state.method === 'cash' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => onChange({ ...state, method: 'cash' })}
          >
            Cash
          </Button>
          <Button
            variant={state.method === 'check' ? 'default' : 'outline'}
            size="sm"
            className="flex-1"
            onClick={() => onChange({ ...state, method: 'check' })}
          >
            Check
          </Button>
        </div>

        {state.method === 'check' && (
          <Input
            placeholder="Check number (optional)"
            value={state.checkNumber}
            onChange={e => onChange({ ...state, checkNumber: e.target.value })}
          />
        )}

        <ReceivedOnField
          id="partial-payment-received-on"
          value={state.receivedOn}
          max={todayInShowZone}
          onChange={receivedOn => onChange({ ...state, receivedOn })}
        />

        {(() => {
          const amt = parseFloat(state.amountPaid);
          if (!state.amountPaid || isNaN(amt)) {
            return (
              <p className="text-xs text-muted-foreground">
                Enter a payment amount greater than $0 to record this payment.
              </p>
            );
          }
          return (
            <p className="text-xs text-muted-foreground">
              {paidDollars + amt >= totalDollars
                ? 'Covers the full balance. This will mark the registration paid.'
                : `Remaining after payment: $${balanceAfterPayment(totalDollars, paidDollars, amt).toFixed(2)}`}
            </p>
          );
        })()}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          onClick={onConfirm}
          disabled={!state.amountPaid || !(parseFloat(state.amountPaid) > 0) || !state.receivedOn}
        >
          Record Payment
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EnrollmentPartialPaymentDialog;
