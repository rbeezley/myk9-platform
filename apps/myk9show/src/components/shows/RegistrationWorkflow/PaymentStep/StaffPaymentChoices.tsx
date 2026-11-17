import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Banknote, CircleDollarSign, FileCheck, FileText, Tag, Users, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { UserRole } from '@/types/auth-types';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
import { JuniorFeeChoice } from './JuniorFeeChoice';
import { PaymentOptionCard } from './PaymentOptionCard';
import { usePaymentDetailsFields } from './usePaymentDetailsFields';
import type { PaymentMethodSelectorProps } from './types';

/** One secretary choice: a payment method, and for money in hand how it came. */
type StaffChoice =
  'check_received' | 'cash_received' | 'group_payment' | 'check' | 'cash' | 'waived' | 'form_money';

const CHOICE_METHOD: Record<StaffChoice, PaymentMethod> = {
  form_money: 'form_money',
  check_received: 'secretary_paid',
  cash_received: 'secretary_paid',
  group_payment: 'group_payment',
  check: 'check',
  cash: 'cash',
  waived: 'waived',
};

const CHOICE_RECEIVED: Partial<Record<StaffChoice, NonNullable<PaymentDetails['receivedMethod']>>> =
  { check_received: 'check', cash_received: 'cash' };

const STAFF_ROLES = [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN];

const PAID_BADGE = (
  <Badge variant="outline" className="border-success/40 text-success">
    Paid
  </Badge>
);
const UNPAID_BADGE = (
  <Badge variant="outline" className="border-warning/50 text-foreground">
    Not paid yet
  </Badge>
);

function ChoiceGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div role="group" aria-labelledby={id} className="space-y-3">
      <h4 id={id} className="text-sm font-semibold text-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

/** The indented panel under a selected choice. */
function ChoiceDetails({ children }: { children: React.ReactNode }) {
  return <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">{children}</div>;
}

type StaffPaymentChoicesProps = Pick<
  PaymentMethodSelectorProps,
  | 'paymentMethod'
  | 'onPaymentMethodChange'
  | 'onPaymentDetailsChange'
  | 'getInitialDetails'
  | 'acceptedMethods'
  | 'juniorFee'
  | 'allowFreeEntry'
> & {
  /** MYK9-2149: money a confirmed read says the exhibitor's form already holds, or null. */
  formHeldCents?: number | null | undefined;
};

/**
 * MYK9-2020: the payment step when a secretary keys in someone else's entry
 * (the mail-in form, the phone call, the walk-up). One set of choices, in her
 * words, split into what is paid and what is still owed:
 *
 * - Paid: "Check received" and "Cash received" are the old "Secretary Payment
 *   (Already Received)" with its "Received as" toggle folded into the choice.
 *   They record exactly what that pair did (`secretary_paid` plus the received
 *   method, the check number in the payment reference), so nothing about the
 *   money changes; only the click to find it does.
 * - Not paid yet: check or cash at the show.
 * - Free entry.
 *
 * The exhibitor's own list (`PaymentMethodSelector`) is untouched.
 *
 * MYK9-2149 (inform only): when a confirmed read says the exhibitor's form already holds
 * money, one more choice is offered, "Use the money already on this form (take nothing now)",
 * carried as its own method (`form_money`), never as money received. The secretary picks it
 * herself: it is never preselected, and no later read selects, clears or hides it once chosen
 * (the page clears it only when the exhibitor, and so the form, changes). It submits with no
 * payment and no method, so the server settles what the form's money covers.
 */
export const StaffPaymentChoices: React.FC<StaffPaymentChoicesProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  getInitialDetails,
  acceptedMethods,
  juniorFee = null,
  allowFreeEntry = false,
  formHeldCents = null,
}) => {
  const { fields, update } = usePaymentDetailsFields(getInitialDetails, onPaymentDetailsChange);
  // Offered on a confirmed read; once chosen it stays, whatever a later read says.
  const offerFormMoney = formHeldCents !== null || paymentMethod === 'form_money';
  const showCheck = acceptedMethods?.check ?? true;
  const showCash = acceptedMethods?.cash ?? true;

  const isSelected = (choice: StaffChoice) => {
    const received = CHOICE_RECEIVED[choice];
    if (received) return paymentMethod === 'secretary_paid' && fields.receivedMethod === received;
    return paymentMethod === CHOICE_METHOD[choice];
  };

  const handleSelect = (choice: StaffChoice) => {
    const received = CHOICE_RECEIVED[choice];
    if (received && received !== fields.receivedMethod) update({ receivedMethod: received });
    onPaymentMethodChange(CHOICE_METHOD[choice]);
  };

  const card = (
    choice: StaffChoice,
    icon: LucideIcon,
    title: string,
    description: string,
    badge?: React.ReactNode
  ) => (
    <PaymentOptionCard
      value={choice}
      selected={isSelected(choice)}
      icon={icon}
      title={title}
      description={description}
      onSelect={handleSelect}
      badge={badge}
    />
  );

  const receivedOnField = (
    <div>
      <Label htmlFor="payment-date">Date received</Label>
      <Input
        id="payment-date"
        type="date"
        value={fields.paymentDate}
        onChange={e => update({ paymentDate: e.target.value })}
      />
    </div>
  );

  const notesField = (
    <div>
      <Label htmlFor="payment-notes">Payment notes</Label>
      <Textarea
        id="payment-notes"
        value={fields.paymentNotes}
        onChange={e => update({ paymentNotes: e.target.value })}
        placeholder="Anything else about this payment"
        rows={2}
      />
    </div>
  );

  // The payment reference is the field "Received as: Check" labelled "Check number"
  // (MYK9-1742), so a check's number lands where it always has.
  const receivedDetails = (referenceLabel: string, placeholder: string) => (
    <ChoiceDetails>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="payment-reference">{referenceLabel}</Label>
          <Input
            id="payment-reference"
            value={fields.paymentReference}
            onChange={e => update({ paymentReference: e.target.value })}
            placeholder={placeholder}
          />
        </div>
        {receivedOnField}
      </div>
      {notesField}
    </ChoiceDetails>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How was this entry paid?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {offerFormMoney && (
          <ChoiceGroup id="staff-payment-form-money" title="Money already on this form">
            {card(
              'form_money',
              Wallet,
              'Use the money already on this form (take nothing now)',
              'Nothing is taken or recorded now. The money on this form pays what it can.'
            )}
          </ChoiceGroup>
        )}
        <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT} role={STAFF_ROLES}>
          <ChoiceGroup id="staff-payment-paid" title="Paid with the entry">
            {paymentMethod === 'secretary_paid' && !fields.receivedMethod && (
              <p role="status" className="text-sm text-muted-foreground">
                Choose whether a check or cash came with this entry.
              </p>
            )}
            {card(
              'check_received',
              FileCheck,
              'Check received',
              'A check came with the entry form.',
              PAID_BADGE
            )}
            {isSelected('check_received') && receivedDetails('Check number', '1234')}
            {card(
              'cash_received',
              Banknote,
              'Cash received',
              'Cash came with the entry form.',
              PAID_BADGE
            )}
            {isSelected('cash_received') && receivedDetails('Receipt #', 'Receipt #123')}
            {card(
              'group_payment',
              Users,
              'Paid by a club or group',
              'A club or group organizer paid for this entry.',
              PAID_BADGE
            )}
            {isSelected('group_payment') && (
              <ChoiceDetails>
                <div>
                  <Label htmlFor="group-reference">Club or group reference</Label>
                  <Input
                    id="group-reference"
                    value={fields.groupReference}
                    onChange={e => update({ groupReference: e.target.value })}
                    placeholder="Club payment batch #123"
                  />
                </div>
              </ChoiceDetails>
            )}
          </ChoiceGroup>
        </PermissionGuard>

        {(showCheck || showCash) && (
          <ChoiceGroup id="staff-payment-unpaid" title="Not paid yet">
            {showCheck &&
              card(
                'check',
                FileText,
                'Check (pay at show)',
                'The exhibitor pays by check at the show.',
                UNPAID_BADGE
              )}
            {showCash &&
              card(
                'cash',
                CircleDollarSign,
                'Cash (pay at show)',
                'The exhibitor pays cash at the show.',
                UNPAID_BADGE
              )}
          </ChoiceGroup>
        )}

        {allowFreeEntry && (
          <PermissionGuard permission="registration:override_fees">
            <ChoiceGroup id="staff-payment-free" title="No fee">
              {card('waived', Tag, 'Free entry', 'No entry fees are charged.')}
              {isSelected('waived') && (
                <ChoiceDetails>
                  <div>
                    <Label htmlFor="waiver-reason">Why is this entry free?</Label>
                    <Textarea
                      id="waiver-reason"
                      value={fields.paymentNotes}
                      onChange={e => update({ paymentNotes: e.target.value })}
                      placeholder="For example, a judge or worker entry"
                      required
                    />
                  </div>
                </ChoiceDetails>
              )}
            </ChoiceGroup>
          </PermissionGuard>
        )}

        {juniorFee !== null && (
          <JuniorFeeChoice
            fee={juniorFee}
            checked={fields.chargeJuniorFee}
            onCheckedChange={value => update({ chargeJuniorFee: value })}
          />
        )}

        {allowFreeEntry && (
          <PermissionGuard permission="registration:override_fees">
            <p className="text-xs text-muted-foreground">
              To accept an entry or move it to the waitlist, set it back to unpaid, or mark several
              entries paid at once, use Entry management after you save.
            </p>
          </PermissionGuard>
        )}
      </CardContent>
    </Card>
  );
};
