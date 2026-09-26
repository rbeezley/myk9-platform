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
import type { FullPaymentDialog } from './enrollmentPayment';

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
  /** What "Paid in Full" will record: the balance still due. */
  balanceDollars: number;
  todayInShowZone: string;
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
  todayInShowZone,
  onClose,
  onConfirm,
}) => (
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
          <span className="font-medium text-foreground">${balanceDollars.toFixed(2)}</span>
        </p>
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
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onConfirm} disabled={!state.receivedOn}>
          Confirm
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default EnrollmentFullPaymentDialog;
