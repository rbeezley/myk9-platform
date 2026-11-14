import React, { useState } from 'react';
import { CreditCard, DollarSign, FileText, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import type { PaymentMethod } from '@/types/show-registration-types';
import { JuniorFeeChoice } from './JuniorFeeChoice';
import { PaymentOptionCard } from './PaymentOptionCard';
import { DeskPaymentOptions } from './DeskPaymentOptions';
import type { DeskChoice } from './deskChoice';
import { PAYMENT_MESSAGES } from './types';
import type { PaymentMethodSelectorProps } from './types';
import type { PaymentDetails } from '@/types/show-registration-types';

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  acceptedMethods,
  allowCardCheckout = true,
  cardCheckoutUnavailableReason,
  juniorFee = null,
  allowFreeEntry = false,
  deskMode = false,
  getInitialDetails,
}) => {
  const [initialDetails] = useState(() => getInitialDetails?.());
  const [chargeJuniorFee, setChargeJuniorFee] = useState(initialDetails?.chargeJuniorFee === true);
  const [checkNumber, setCheckNumber] = useState(initialDetails?.checkNumber ?? '');
  const [paymentDate, setPaymentDate] = useState(initialDetails?.paymentDate ?? '');
  const [paymentReference, setPaymentReference] = useState(initialDetails?.paymentReference ?? '');
  const [groupReference, setGroupReference] = useState(initialDetails?.groupReference ?? '');
  const [paymentNotes, setPaymentNotes] = useState(initialDetails?.paymentNotes ?? '');
  const [receivedMethod, setReceivedMethod] = useState<PaymentDetails['receivedMethod']>(
    initialDetails?.receivedMethod
  );

  const showCheck = acceptedMethods?.check ?? true;
  const showCash = acceptedMethods?.cash ?? true;

  // Build a current snapshot of all detail fields and fire the callback.
  const notifyDetailsChange = (patch: Partial<PaymentDetails>) => {
    if (!onPaymentDetailsChange) return;
    onPaymentDetailsChange({
      checkNumber,
      paymentDate,
      paymentReference,
      groupReference,
      paymentNotes,
      ...(receivedMethod ? { receivedMethod } : {}),
      ...(chargeJuniorFee ? { chargeJuniorFee } : {}),
      ...patch,
    });
  };

  const handleCheckNumberChange = (value: string) => {
    setCheckNumber(value);
    notifyDetailsChange({ checkNumber: value });
  };

  const handlePaymentDateChange = (value: string) => {
    setPaymentDate(value);
    notifyDetailsChange({ paymentDate: value });
  };

  const handlePaymentReferenceChange = (value: string) => {
    setPaymentReference(value);
    notifyDetailsChange({ paymentReference: value });
  };

  const handleGroupReferenceChange = (value: string) => {
    setGroupReference(value);
    notifyDetailsChange({ groupReference: value });
  };

  const handlePaymentNotesChange = (value: string) => {
    setPaymentNotes(value);
    notifyDetailsChange({ paymentNotes: value });
  };

  const handleReceivedMethodChange = (value: 'cash' | 'check') => {
    setReceivedMethod(value);
    notifyDetailsChange({ receivedMethod: value });
  };

  const handleJuniorFeeChange = (value: boolean) => {
    setChargeJuniorFee(value);
    notifyDetailsChange({ chargeJuniorFee: value });
  };

  const handleSelect = (value: PaymentMethod) => {
    onPaymentMethodChange(value);
  };

  // MYK9-2020: "Check received" / "Cash received" are the one stored
  // `secretary_paid` method plus the cash-or-check the ledger needs (MYK9-677).
  const handleDeskChoice = (choice: DeskChoice) => {
    if (choice === 'check_received' || choice === 'cash_received') {
      handleReceivedMethodChange(choice === 'check_received' ? 'check' : 'cash');
      onPaymentMethodChange('secretary_paid');
      return;
    }
    onPaymentMethodChange(choice);
  };

  const juniorFeeChoice =
    juniorFee !== null ? (
      <JuniorFeeChoice
        fee={juniorFee}
        checked={chargeJuniorFee}
        onCheckedChange={handleJuniorFeeChange}
      />
    ) : null;

  if (deskMode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payment Method</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div role="group" aria-label="Payment method">
            <DeskPaymentOptions
              paymentMethod={paymentMethod}
              receivedMethod={receivedMethod}
              showCheck={showCheck}
              showCash={showCash}
              allowFreeEntry={allowFreeEntry}
              values={{ paymentDate, paymentReference, paymentNotes, groupReference }}
              onChoose={handleDeskChoice}
              onPaymentDateChange={handlePaymentDateChange}
              onPaymentReferenceChange={handlePaymentReferenceChange}
              onPaymentNotesChange={handlePaymentNotesChange}
              onGroupReferenceChange={handleGroupReferenceChange}
            />
          </div>
          {juniorFeeChoice}
        </CardContent>
      </Card>
    );
  }

  // The exhibitor's own list: card, or check or cash at the show. Staff-only
  // methods live in the desk list above (MYK9-2020).
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Method</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="group" aria-label="Payment method">
          <div className="space-y-3">
            {!allowCardCheckout && cardCheckoutUnavailableReason && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{cardCheckoutUnavailableReason}</AlertDescription>
              </Alert>
            )}
            {/* Card checkout is exhibitor-self-service only: Stripe-hosted
                checkout runs under the logged-in user's account and
                stripe-checkout 403s any cart they don't own, so on-behalf modes
                cannot pay by card (see allowCardCheckout). */}
            {allowCardCheckout && (
              <>
                <PaymentOptionCard
                  value="credit_card"
                  selected={paymentMethod === 'credit_card'}
                  icon={CreditCard}
                  title="Credit/Debit Card"
                  description="Secure online payment via credit or debit card"
                  onSelect={handleSelect}
                />

                {/* INTENT: No card form here — Stripe-hosted checkout keeps payment
                    details off myK9 pages and preserves user trust. */}
                {paymentMethod === 'credit_card' && (
                  <div className="ml-4 border-l-2 border-primary/20 pl-4">
                    <Alert>
                      <CreditCard className="h-4 w-4" />
                      <AlertDescription>{PAYMENT_MESSAGES.CARD_CHECKOUT_REDIRECT}</AlertDescription>
                    </Alert>
                  </div>
                )}
              </>
            )}

            {showCheck && (
              <PaymentOptionCard
                value="check"
                selected={paymentMethod === 'check'}
                icon={FileText}
                title="Check (pay at show)"
                description="Bring check made payable to hosting club"
                onSelect={handleSelect}
              />
            )}

            {showCheck && paymentMethod === 'check' && (
              <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertDescription>
                    Please bring your check made payable to the hosting club on the day of the show.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="checknumber">Check Number (optional)</Label>
                  <Input
                    id="checknumber"
                    value={checkNumber}
                    onChange={e => handleCheckNumberChange(e.target.value)}
                    placeholder="1234"
                  />
                </div>
              </div>
            )}

            {showCash && (
              <PaymentOptionCard
                value="cash"
                selected={paymentMethod === 'cash'}
                icon={DollarSign}
                title="Cash (pay at show)"
                description="Exact amount required at check-in"
                onSelect={handleSelect}
              />
            )}

            {showCash && paymentMethod === 'cash' && (
              <div className="ml-4 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertDescription>
                    Please bring exact cash amount on the day of the show.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {juniorFeeChoice}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
