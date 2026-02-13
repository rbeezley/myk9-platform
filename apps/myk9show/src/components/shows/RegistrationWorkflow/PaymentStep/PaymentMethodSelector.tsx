import React, { useState } from 'react';
import { CreditCard, DollarSign, Check, Tag, Receipt, Users, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { formatCardNumber, formatExpiryDate, stripNonDigits } from './utils';
import type { PaymentMethodSelectorProps } from './types';

/**
 * Renders the payment method radio group with method-specific form fields.
 * Handles credit card, check, cash, secretary payment, group payment, and fee waiver options.
 */
export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onPaymentMethodChange,
}) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Method</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup value={paymentMethod} onValueChange={onPaymentMethodChange}>
          <div className="space-y-4">
            {/* Credit/Debit Card */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="credit_card" id="credit_card" />
              <Label htmlFor="credit_card" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Credit/Debit Card (Online Payment)
                </div>
                <p className="text-xs text-gray-500 mt-1">Secure online payment via Stripe</p>
              </Label>
            </div>

            {paymentMethod === 'credit_card' && (
              <div className="ml-6 space-y-3">
                <div>
                  <Label htmlFor="cardholder">Cardholder Name</Label>
                  <Input
                    id="cardholder"
                    value={cardholderName}
                    onChange={(e) => setCardholderName(e.target.value)}
                    placeholder="John Doe"
                  />
                </div>

                <div>
                  <Label htmlFor="cardnumber">Card Number</Label>
                  <Input
                    id="cardnumber"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="expiry">Expiry Date</Label>
                    <Input
                      id="expiry"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                      placeholder="MM/YY"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cvv">CVV</Label>
                    <Input
                      id="cvv"
                      value={cvv}
                      onChange={(e) => setCvv(stripNonDigits(e.target.value))}
                      placeholder="123"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Check */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="check" id="check" />
              <Label htmlFor="check" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  Check (pay at show)
                </div>
                <p className="text-xs text-gray-500 mt-1">Bring check made payable to hosting club</p>
              </Label>
            </div>

            {paymentMethod === 'check' && (
              <div className="ml-6 space-y-3">
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
                    onChange={(e) => setCheckNumber(e.target.value)}
                    placeholder="1234"
                  />
                </div>
              </div>
            )}

            {/* Cash */}
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="cash" id="cash" />
              <Label htmlFor="cash" className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Cash (pay at show)
                </div>
                <p className="text-xs text-gray-500 mt-1">Exact amount required at check-in</p>
              </Label>
            </div>

            {/* Secretary Payment (permission-gated) */}
            <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="secretary_paid" id="secretary_paid" />
                <Label htmlFor="secretary_paid" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4" />
                    Secretary Payment (Already Received)
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Payment received outside of online system</p>
                </Label>
              </div>
            </PermissionGuard>

            {/* Group Payment (permission-gated) */}
            <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="group_payment" id="group_payment" />
                <Label htmlFor="group_payment" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Group/Club Payment
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Payment handled by club or group organizer</p>
                </Label>
              </div>
            </PermissionGuard>

            {/* Fees Waived (permission-gated) */}
            <PermissionGuard permission="registration:override_fees">
              <div className="flex items-start space-x-3">
                <RadioGroupItem value="waived" id="waived" />
                <Label htmlFor="waived" className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4" />
                    Fees Waived
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Administrative waiver of registration fees</p>
                </Label>
              </div>
            </PermissionGuard>

            {/* Conditional details for cash */}
            {paymentMethod === 'cash' && (
              <div className="ml-6">
                <Alert>
                  <AlertDescription>
                    Please bring exact cash amount on the day of the show.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            {/* Conditional details for secretary_paid */}
            {paymentMethod === 'secretary_paid' && (
              <div className="ml-6 space-y-3">
                <Alert>
                  <AlertDescription>
                    Mark this registration as paid when payment has been received outside the online system.
                  </AlertDescription>
                </Alert>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-reference">Reference/Receipt #</Label>
                    <Input
                      id="payment-reference"
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="Receipt #123"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="payment-notes">Payment Notes</Label>
                  <Textarea
                    id="payment-notes"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Additional details about payment..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* Conditional details for group_payment */}
            {paymentMethod === 'group_payment' && (
              <div className="ml-6 space-y-3">
                <Alert>
                  <AlertDescription>
                    This registration is part of a group payment arrangement.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="group-reference">Group/Organization Reference</Label>
                  <Input
                    id="group-reference"
                    value={paymentReference}
                    onChange={(e) => setPaymentReference(e.target.value)}
                    placeholder="Club payment batch #123"
                  />
                </div>
              </div>
            )}

            {/* Conditional details for waived */}
            {paymentMethod === 'waived' && (
              <div className="ml-6 space-y-3">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This will waive all registration fees for this entry. This action requires admin approval.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="waiver-reason">Reason for Fee Waiver</Label>
                  <Textarea
                    id="waiver-reason"
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Explain the reason for waiving fees..."
                    required
                  />
                </div>
              </div>
            )}
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
};
