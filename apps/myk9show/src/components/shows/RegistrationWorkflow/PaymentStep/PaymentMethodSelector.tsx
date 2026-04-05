import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CreditCard,
  DollarSign,
  Check,
  Tag,
  Receipt,
  Users,
  AlertTriangle,
  CircleCheck,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { cn } from '@/lib/utils';
import type { PaymentMethod } from '@/types/show-registration-types';
import { PAYMENT_MESSAGES } from './types';
import type { PaymentMethodSelectorProps } from './types';
import type { PaymentDetails } from '@/types/show-registration-types';

interface PaymentOptionCardProps {
  value: PaymentMethod;
  selected: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  onSelect: (value: PaymentMethod) => void;
}

const PaymentOptionCard: React.FC<PaymentOptionCardProps> = ({
  value,
  selected,
  icon: Icon,
  title,
  description,
  onSelect,
}) => (
  <button
    type="button"
    onClick={() => onSelect(value)}
    className={cn(
      'relative w-full rounded-lg border-2 p-4 text-left transition-all duration-150',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      selected
        ? 'border-primary bg-primary/5 shadow-sm'
        : 'border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/50'
    )}
  >
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{title}</div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div
        className={cn(
          'flex h-5 w-5 shrink-0 items-center justify-center transition-colors',
          selected ? 'text-primary' : 'text-muted-foreground/30'
        )}
      >
        {selected ? (
          <CircleCheck className="h-5 w-5" />
        ) : (
          <div className="h-4 w-4 rounded-full border-2 border-current" />
        )}
      </div>
    </div>
  </button>
);

export const PaymentMethodSelector: React.FC<PaymentMethodSelectorProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  acceptedMethods,
}) => {
  const [checkNumber, setCheckNumber] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [groupReference, setGroupReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

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

  const handleSelect = (value: PaymentMethod) => {
    onPaymentMethodChange(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Payment Method</CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={paymentMethod}
          onValueChange={v => onPaymentMethodChange(v as PaymentMethod)}
        >
          <div className="space-y-3">
            <PaymentOptionCard
              value="credit_card"
              selected={paymentMethod === 'credit_card'}
              icon={CreditCard}
              title="Credit/Debit Card (Online Payment)"
              description="Online payment coming soon — entry submitted, payment collected later"
              onSelect={handleSelect}
            />

            {/* INTENT: No card form here — online payment via Stripe is not yet
                integrated. Showing fake card inputs would be trust-breaking.
                When Stripe Elements is ready, replace this notice. */}
            {paymentMethod === 'credit_card' && (
              <div className="ml-4 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>{PAYMENT_MESSAGES.CARD_COMING_SOON}</AlertDescription>
                </Alert>
              </div>
            )}

            {showCheck && (
              <PaymentOptionCard
                value="check"
                selected={paymentMethod === 'check'}
                icon={Check}
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

            <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="payment-date">Payment Date</Label>
                    <Input
                      id="payment-date"
                      type="date"
                      value={paymentDate}
                      onChange={e => handlePaymentDateChange(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="payment-reference">Reference/Receipt #</Label>
                    <Input
                      id="payment-reference"
                      value={paymentReference}
                      onChange={e => handlePaymentReferenceChange(e.target.value)}
                      placeholder="Receipt #123"
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

            <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT}>
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

            <PermissionGuard permission="registration:override_fees">
              <PaymentOptionCard
                value="waived"
                selected={paymentMethod === 'waived'}
                icon={Tag}
                title="Fees Waived"
                description="Administrative waiver of registration fees"
                onSelect={handleSelect}
              />
            </PermissionGuard>

            {paymentMethod === 'waived' && (
              <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    This will waive all registration fees for this entry. This action requires admin
                    approval.
                  </AlertDescription>
                </Alert>
                <div>
                  <Label htmlFor="waiver-reason">Reason for Fee Waiver</Label>
                  <Textarea
                    id="waiver-reason"
                    value={paymentNotes}
                    onChange={e => handlePaymentNotesChange(e.target.value)}
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
