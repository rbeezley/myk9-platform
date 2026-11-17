import React, { useEffect } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Banknote, CircleDollarSign, FileCheck, FileText, Tag, Users } from 'lucide-react';
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
import {
  alreadyCoveredLabel,
  collectDifferenceLabel,
  type DeskAddOnCollect,
} from '@/features/registration/deskAddOnCollect';
import type { PaymentMethodSelectorProps } from './types';

/** One secretary choice: a payment method, and for money in hand how it came. */
type StaffChoice =
  'check_received' | 'cash_received' | 'group_payment' | 'check' | 'cash' | 'waived';

const CHOICE_METHOD: Record<StaffChoice, PaymentMethod> = {
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
  /** MYK9-2149: how much of this entry the exhibitor's form already covers. */
  deskCollect?: DeskAddOnCollect | undefined;
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
 * MYK9-2149: when the money already on the exhibitor's form covers the entry, there is
 * nothing to collect, so the paid / not-paid choices give way to "Already covered" and the
 * entry is submitted with no payment (the server settles it from the money held). When the
 * form covers part of it, the paid choices say to collect only the difference, which is what
 * the server records.
 */
export const StaffPaymentChoices: React.FC<StaffPaymentChoicesProps> = ({
  paymentMethod,
  onPaymentMethodChange,
  onPaymentDetailsChange,
  getInitialDetails,
  acceptedMethods,
  juniorFee = null,
  allowFreeEntry = false,
  deskCollect = { kind: 'unchanged' },
}) => {
  const { fields, update } = usePaymentDetailsFields(getInitialDetails, onPaymentDetailsChange);
  const covered = deskCollect.kind === 'covered';
  const coveredSelected = paymentMethod === 'secretary_paid' && fields.coveredByForm;

  // The server's answer arrives after the step opens: a covered entry takes "Already covered"
  // unless the secretary made it a Free entry, and an entry no longer covered drops it, so
  // its method then asks for cash or check again before it can be submitted.
  useEffect(() => {
    if (covered && !coveredSelected && paymentMethod !== 'waived') {
      update({ coveredByForm: true, receivedMethod: undefined });
      onPaymentMethodChange('secretary_paid');
    } else if (!covered && fields.coveredByForm) {
      update({ coveredByForm: false });
    }
    // `update` and the change handler are recreated each render; the answer and the
    // selection are what this follows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [covered, coveredSelected, paymentMethod, fields.coveredByForm]);
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
        {deskCollect.kind === 'covered' ? (
          <div role="status" className="space-y-1 rounded-md border border-success/40 p-4">
            <p className="font-semibold text-foreground">
              {alreadyCoveredLabel(deskCollect.heldCents)}
            </p>
            <p className="text-sm text-muted-foreground">
              Nothing to collect. The money already on this form pays for this entry.
            </p>
          </div>
        ) : (
          <>
            <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT} role={STAFF_ROLES}>
              <ChoiceGroup id="staff-payment-paid" title="Paid with the entry">
                {paymentMethod === 'secretary_paid' && !fields.receivedMethod && (
                  <p role="status" className="text-sm text-muted-foreground">
                    Choose whether a check or cash came with this entry.
                  </p>
                )}
                {deskCollect.kind === 'partial' && (
                  <p role="status" className="text-sm font-semibold text-foreground">
                    {collectDifferenceLabel(deskCollect.collectCents, deskCollect.heldCents)}
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
          </>
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
