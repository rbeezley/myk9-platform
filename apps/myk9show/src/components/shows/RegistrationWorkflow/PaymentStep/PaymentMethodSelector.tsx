import React from 'react';
import { CreditCard, DollarSign, FileText, Tag, Receipt, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/rbac/PermissionGuard';
import { REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { UserRole } from '@/types/auth-types';
import type { PaymentMethod } from '@/types/show-registration-types';
import { JuniorFeeChoice } from './JuniorFeeChoice';
import { PAYMENT_MESSAGES } from './types';
import type { PaymentMethodSelectorProps } from './types';
import { usePaymentDetailsFields } from './usePaymentDetailsFields';
import { PaymentOptionCard } from './PaymentOptionCard';

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  acceptedMethods,
  allowCardCheckout = true,
  cardCheckoutUnavailableReason,
  juniorFee = null,
  allowFreeEntry = false,
  getInitialDetails,
}) => {
  const {
    fields: {
      checkNumber,
      paymentDate,
      paymentReference,
      groupReference,
      paymentNotes,
      receivedMethod,
      chargeJuniorFee,
    },
    update,
  } = usePaymentDetailsFields(getInitialDetails, onPaymentDetailsChange);

  const showCheck = acceptedMethods?.check ?? true;
  const showCash = acceptedMethods?.cash ?? true;

  const handleCheckNumberChange = (value: string) => update({ checkNumber: value });
  const handlePaymentDateChange = (value: string) => update({ paymentDate: value });
  const handlePaymentReferenceChange = (value: string) => update({ paymentReference: value });
  const handleGroupReferenceChange = (value: string) => update({ groupReference: value });
  const handlePaymentNotesChange = (value: string) => update({ paymentNotes: value });
  const handleReceivedMethodChange = (value: 'cash' | 'check') => update({ receivedMethod: value });
  const handleJuniorFeeChange = (value: boolean) => update({ chargeJuniorFee: value });

  const handleSelect = (value: PaymentMethod) => {
    onPaymentMethodChange(value);
  };

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

            <PermissionGuard
              permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}
              showFallback={false}
              roles={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
            >
              <PaymentOptionCard
                value="secretary_paid"
                selected={paymentMethod === 'secretary_paid'}
                icon={Receipt}
                title="Secretary Payment (Already Received)"
                description="Payment received outside of online system"
                onSelect={handleSelect}
              />
            </PermissionGuard>

            {paymentMethod === 'secretary_paid' && (
              <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertDescription>
                    Mark this registration as paid when payment has been received outside the online
                    system.
                  </AlertDescription>
                </Alert>
                {/* MYK9-677: the payments ledger and the closeout card count cash
                    and check separately, so money received names its method. */}
                <div role="group" aria-labelledby="received-method-label" className="space-y-1">
                  <Label id="received-method-label">Received as</Label>
                  <div className="flex gap-2">
                    {(['cash', 'check'] as const).map(method => (
                      <Button
                        key={method}
                        type="button"
                        size="sm"
                        className="flex-1"
                        variant={receivedMethod === method ? 'default' : 'outline'}
                        aria-pressed={receivedMethod === method}
                        onClick={() => handleReceivedMethodChange(method)}
                      >
                        {method === 'cash' ? 'Cash' : 'Check'}
                      </Button>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required when money was received. Not needed for a $0 entry.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="payment-date">Payment Date (received on)</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={e => handlePaymentDateChange(e.target.value)}
                    />
                  </div>
                  <div>
                    {/* MYK9-1742: a check that came in the envelope is recorded by
                        its number. Same stored field (the payment reference), named
                        for what the secretary is holding. */}
                    <Label htmlFor="payment-reference">
                      {receivedMethod === 'check'
                        ? 'Check number'
                        : receivedMethod === 'cash'
                          ? 'Receipt #'
                          : 'Reference/Receipt #'}
                    </Label>
                    <Input
                      id="payment-reference"
                      value={paymentReference}
                      onChange={e => handlePaymentReferenceChange(e.target.value)}
                      placeholder={receivedMethod === 'check' ? '1234' : 'Receipt #123'}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="payment-notes">Payment Notes</Label>
                  <Textarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={e => handlePaymentNotesChange(e.target.value)}
                    placeholder="Additional details about payment..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            <PermissionGuard
              permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}
              showFallback={false}
              roles={[UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN]}
            >
              <PaymentOptionCard
                value="group_payment"
                selected={paymentMethod === 'group_payment'}
                icon={Users}
                title="Group/Club Payment"
                description="Payment handled by club or group organizer"
                onSelect={handleSelect}
              />
            </PermissionGuard>

            {paymentMethod === 'group_payment' && (
              <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertDescription>
                    This registration is part of a group payment arrangement.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="group-reference">Group/Organization Reference</Label>
                  <Input
                    id="group-reference"
                    value={groupReference}
                    onChange={e => handleGroupReferenceChange(e.target.value)}
                    placeholder="Club payment batch #123"
                  />
                </div>
              </div>
            )}

            {allowFreeEntry && (
              <PermissionGuard permission="registration:override_fees" showFallback={false}>
                <PaymentOptionCard
                  value="waived"
                  selected={paymentMethod === 'waived'}
                  icon={Tag}
                  title="Free entry"
                  description="No entry fees are charged"
                  onSelect={handleSelect}
                />
              </PermissionGuard>
            )}

            {paymentMethod === 'waived' && (
              <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This entry will be free. No entry fees are charged.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="waiver-reason">Why is this entry free?</Label>
                  <Textarea
                    id="waiver-reason"
                    value={paymentNotes}
                    onChange={e => handlePaymentNotesChange(e.target.value)}
                    placeholder="For example, a judge or worker entry"
                    required
                  />
                </div>
              </div>
            )}

            {juniorFee !== null && (
              <JuniorFeeChoice
                fee={juniorFee}
                checked={chargeJuniorFee}
                onCheckedChange={handleJuniorFeeChange}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
