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
import { LedgerNotSavedNote } from './LedgerNotSavedNote';
import type { LedgerSaveStatus } from './useLedgerDialogSave';
import { AMOUNT_NOT_AVAILABLE, type FullPaymentDialog } from './enrollmentPayment';

interface ReceivedOnFieldProps {
  id: string;
  value: string;
  /** Today on the show's calendar: the latest day money can have arrived. */
  max: string;
  onChange: (value: string) => void;
}

/**
 * MYK9-677: the day the money was received, on the show's calendar. Defaults
 * to today; a check that arrived by mail weeks ago keeps its real day, so the
 * closeout card does not count it as desk money.
 */
export const ReceivedOnField: React.FC<ReceivedOnFieldProps> = ({ id, value, max, onChange }) => (
  <div className="space-y-1">
    <Label htmlFor={id}>Received on</Label>
    <Input id={id} type="date" value={value} max={max} onChange={e => onChange(e.target.value)} />
  </div>
);

interface EnrollmentFullPaymentDialogProps {
  state: FullPaymentDialog;
  onChange: (next: FullPaymentDialog) => void;
  /** What "Paid in Full" will record: the balance still due, in whole cents. */
  balanceDollars: number;
  /** MYK9-1968: the payment record is not loaded, so the balance is not quoted. */
  amountUnknown?: boolean | undefined;
  todayInShowZone: string;
  /** MYK9-2156: the ledger write's state; confirm is disabled while it is pending. */
  saveStatus?: LedgerSaveStatus | undefined;
  onClose: () => void;
  onConfirm: () => void;
}

/**
 * Controlled dialog for "Paid in Full" by cash or check. State and the payment
 * write live in the parent EnrollmentCard; this shell owns only presentation.
 */
export const EnrollmentFullPaymentDialog: React.FC<EnrollmentFullPaymentDialogProps> = ({
  state,
  onChange,
  balanceDollars,
  amountUnknown = false,
  todayInShowZone,
  saveStatus = 'idle',
  onClose,
  onConfirm,
}) => {
  const nothingDue = Math.round(balanceDollars * 100) <= 0;
  return (
    <Dialog open={state.open} onOpenChange={next => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {state.method === 'check' ? 'Record Check Payment' : 'Record Cash Payment'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-muted-foreground">
            Balance due:{' '}
            <span className="font-medium text-foreground">
              {amountUnknown ? AMOUNT_NOT_AVAILABLE : `$${balanceDollars.toFixed(2)}`}
            </span>
          </p>
          {amountUnknown && (
            // Paid in Full records the whole balance, which is not known here, so it cannot be
            // confirmed. No other recording path is suggested: they are online-only too, and
            // offline they would drop what was typed (Codex review of #4104, round 2).
            <p className="text-sm text-muted-foreground" data-testid="full-payment-unknown-note">
              Paid in Full needs the balance, which has not loaded. Record this payment once the
              form&rsquo;s payment record loads.
            </p>
          )}
          {!amountUnknown && nothingDue && (
            // MYK9-2479: a payment carries the amount shown, and $0 is not a payment.
            <p className="text-sm text-muted-foreground" data-testid="full-payment-nothing-due">
              Nothing is due on this form, so there is no payment to record.
            </p>
          )}
          {state.method === 'check' && (
            <Input
              placeholder="Check number (optional)"
              value={state.checkNumber}
              onChange={e => onChange({ ...state, checkNumber: e.target.value })}
              autoFocus
            />
          )}
          <ReceivedOnField
            id="full-payment-received-on"
            value={state.receivedOn}
            max={todayInShowZone}
            onChange={receivedOn => onChange({ ...state, receivedOn })}
          />
          <LedgerNotSavedNote status={saveStatus} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={amountUnknown || nothingDue || !state.receivedOn || saveStatus === 'saving'}
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnrollmentFullPaymentDialog;
