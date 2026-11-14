import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { Banknote, CircleCheck, Clock, DollarSign, FileText, Mail, Tag, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PermissionGuard } from '@/components/auth/PermissionGuard';
import { REGISTRATION_PERMISSIONS } from '@/hooks/useRegistrationPermissions';
import { UserRole } from '@/types/auth-types';
import { cn } from '@/lib/utils';
import type { PaymentDetails, PaymentMethod } from '@/types/show-registration-types';
import { PaymentOptionCard, type PaymentOptionTone } from './PaymentOptionCard';

/**
 * One desk choice. "Check received" and "Cash received" are both the stored
 * `secretary_paid` method, told apart by `receivedMethod` (MYK9-677); naming
 * them as two choices puts the posted check on the screen in the secretary's
 * words instead of behind "Secretary Payment (Already Received)" (MYK9-2020).
 */
export type DeskChoice =
  'check_received' | 'cash_received' | 'group_payment' | 'check' | 'cash' | 'waived';

export function deskChoiceFor(
  paymentMethod: PaymentMethod | '',
  receivedMethod: PaymentDetails['receivedMethod']
): DeskChoice | null {
  switch (paymentMethod) {
    case 'secretary_paid':
      if (receivedMethod === 'check') return 'check_received';
      if (receivedMethod === 'cash') return 'cash_received';
      return null;
    case 'group_payment':
    case 'check':
    case 'cash':
    case 'waived':
      return paymentMethod;
    default:
      return null;
  }
}

interface DeskOption {
  value: DeskChoice;
  icon: LucideIcon;
  title: string;
  description: string;
}

const RECEIVED_CHECK: DeskOption = {
  value: 'check_received',
  icon: Mail,
  title: 'Check received',
  description: 'The check came with the entry form, or was handed to you.',
};
const RECEIVED_CASH: DeskOption = {
  value: 'cash_received',
  icon: Banknote,
  title: 'Cash received',
  description: 'The cash is in hand.',
};
const GROUP: DeskOption = {
  value: 'group_payment',
  icon: Users,
  title: 'Paid by a club or group',
  description: 'A club or group organizer paid for this entry.',
};
const CHECK_AT_SHOW: DeskOption = {
  value: 'check',
  icon: FileText,
  title: 'Check (pay at show)',
  description: 'Not paid yet. The exhibitor brings a check on show day.',
};
const CASH_AT_SHOW: DeskOption = {
  value: 'cash',
  icon: DollarSign,
  title: 'Cash (pay at show)',
  description: 'Not paid yet. The exhibitor pays cash on show day.',
};
const FREE: DeskOption = {
  value: 'waived',
  icon: Tag,
  title: 'Free entry',
  description: 'No entry fees are charged.',
};

const STAFF_ROLES = [UserRole.SECRETARY, UserRole.CLUB_ADMIN, UserRole.SITE_ADMIN];

export interface DeskPaymentDetailsValues {
  paymentDate: string;
  paymentReference: string;
  paymentNotes: string;
  groupReference: string;
}

export interface DeskPaymentOptionsProps {
  paymentMethod: PaymentMethod | '';
  receivedMethod: PaymentDetails['receivedMethod'];
  showCheck: boolean;
  showCash: boolean;
  allowFreeEntry: boolean;
  values: DeskPaymentDetailsValues;
  onChoose: (choice: DeskChoice) => void;
  onPaymentDateChange: (value: string) => void;
  onPaymentReferenceChange: (value: string) => void;
  onPaymentNotesChange: (value: string) => void;
  onGroupReferenceChange: (value: string) => void;
}

const GroupHeading: React.FC<{
  id: string;
  icon: LucideIcon;
  tone: PaymentOptionTone;
  children: React.ReactNode;
}> = ({ id, icon: Icon, tone, children }) => (
  <h4
    id={id}
    className={cn(
      'flex items-center gap-2 text-sm font-semibold',
      tone === 'paid' ? 'text-success' : 'text-warning'
    )}
  >
    <Icon className="h-4 w-4" aria-hidden />
    {children}
  </h4>
);

const DetailPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="ml-4 space-y-3 border-l-2 border-primary/20 pl-4">{children}</div>
);

/**
 * The secretary's payment choices for an entry she is keying (MYK9-2020): one
 * list, grouped by whether the money is already in hand. Replaces both the old
 * five-card list (worded for the exhibitor) and the "Payment at the desk" card
 * below it, which offered the same two actions a second time.
 */
export const DeskPaymentOptions: React.FC<DeskPaymentOptionsProps> = ({
  paymentMethod,
  receivedMethod,
  showCheck,
  showCash,
  allowFreeEntry,
  values,
  onChoose,
  onPaymentDateChange,
  onPaymentReferenceChange,
  onPaymentNotesChange,
  onGroupReferenceChange,
}) => {
  const chosen = deskChoiceFor(paymentMethod, receivedMethod);
  const card = (option: DeskOption, tone?: PaymentOptionTone) => (
    <PaymentOptionCard<DeskChoice>
      value={option.value}
      selected={chosen === option.value}
      icon={option.icon}
      title={option.title}
      description={option.description}
      onSelect={onChoose}
      tone={tone}
    />
  );
  const isReceived = chosen === 'check_received' || chosen === 'cash_received';

  return (
    <div className="space-y-5">
      <PermissionGuard permission={REGISTRATION_PERMISSIONS.MARK_PAYMENT} role={STAFF_ROLES}>
        <section aria-labelledby="desk-paid-heading" className="space-y-3">
          <GroupHeading id="desk-paid-heading" icon={CircleCheck} tone="paid">
            Paid
          </GroupHeading>
          {paymentMethod === 'secretary_paid' && !receivedMethod && (
            <p className="text-sm text-muted-foreground">
              If the money came with the form, choose Check received or Cash received.
            </p>
          )}
          {card(RECEIVED_CHECK, 'paid')}
          {card(RECEIVED_CASH, 'paid')}
          {isReceived && (
            <DetailPanel>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  {/* MYK9-1742: a check from the envelope is recorded by its
                      number, in the payment reference field. */}
                  <Label htmlFor="payment-reference">
                    {chosen === 'check_received' ? 'Check number' : 'Receipt #'}
                  </Label>
                  <Input
                    id="payment-reference"
                    value={values.paymentReference}
                    onChange={e => onPaymentReferenceChange(e.target.value)}
                    placeholder={chosen === 'check_received' ? '1234' : 'Receipt #123'}
                  />
                </div>
                <div>
                  <Label htmlFor="payment-date">Date received</Label>
                  <Input
                    id="payment-date"
                    type="date"
                    value={values.paymentDate}
                    onChange={e => onPaymentDateChange(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="payment-notes">Payment notes</Label>
                <Textarea
                  id="payment-notes"
                  value={values.paymentNotes}
                  onChange={e => onPaymentNotesChange(e.target.value)}
                  placeholder="Anything to remember about this payment"
                  rows={2}
                />
              </div>
            </DetailPanel>
          )}
          {card(GROUP, 'paid')}
          {chosen === 'group_payment' && (
            <DetailPanel>
              <div>
                <Label htmlFor="group-reference">Club or group reference</Label>
                <Input
                  id="group-reference"
                  value={values.groupReference}
                  onChange={e => onGroupReferenceChange(e.target.value)}
                  placeholder="Club payment batch #123"
                />
              </div>
            </DetailPanel>
          )}
        </section>
      </PermissionGuard>

      {(showCheck || showCash) && (
        <section aria-labelledby="desk-unpaid-heading" className="space-y-3">
          <GroupHeading id="desk-unpaid-heading" icon={Clock} tone="unpaid">
            Not paid yet
          </GroupHeading>
          {showCheck && card(CHECK_AT_SHOW, 'unpaid')}
          {showCash && card(CASH_AT_SHOW, 'unpaid')}
          {(chosen === 'check' || chosen === 'cash') && (
            <p className="text-sm text-muted-foreground">
              The entry stays unpaid until you mark it paid in Entry management.
            </p>
          )}
        </section>
      )}

      {allowFreeEntry && (
        <PermissionGuard permission="registration:override_fees">
          <section aria-label="No fee" className="space-y-3">
            {card(FREE)}
            {chosen === 'waived' && (
              <DetailPanel>
                <div>
                  <Label htmlFor="waiver-reason">Why is this entry free?</Label>
                  <Textarea
                    id="waiver-reason"
                    value={values.paymentNotes}
                    onChange={e => onPaymentNotesChange(e.target.value)}
                    placeholder="For example, a judge or worker entry"
                    required
                  />
                </div>
              </DetailPanel>
            )}
          </section>
        </PermissionGuard>
      )}

      <p className="text-xs text-muted-foreground">
        To accept an entry or move it to the waitlist, set it back to unpaid, or mark several
        entries paid at once, use Entry management after you save.
      </p>
    </div>
  );
};
