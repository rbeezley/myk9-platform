import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  Mail,
  PencilLine,
  Ticket,
  Trash2,
  Undo2,
  XCircle,
} from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { isPaymentRequestable } from './paymentRequestEligibility';
import { isStripeRefundable } from './refundEligibility';

export interface EntryRowActionMenuProps {
  entry: EntryManagementEntry;
  onStatusChange?: ((entryId: string, status: EntryStatus) => void) | undefined;
  onCheckInEntry?: ((entryId: string) => void) | undefined;
  onOpenArmbandDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenEditEntry?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenCompDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onRemoveEntry?: ((entryId: string) => void) | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  onOpenRequestPayment?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenRefund?: ((entry: EntryManagementEntry) => void) | undefined;
}

const canMoveToWaitlist = (status: EntryStatus) =>
  status === EntryStatus.PENDING || status === EntryStatus.MISSING_INFO;

const canCheckIn = (status: EntryStatus) =>
  status === EntryStatus.ACCEPTED || status === EntryStatus.MOVE_UP_REQUESTED;

export function EntryRowActionMenu({
  entry,
  onStatusChange,
  onCheckInEntry,
  onOpenArmbandDialog,
  onOpenEditEntry,
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  onResendEmail,
  isResendDisabled,
  onOpenRequestPayment,
  onOpenRefund,
}: EntryRowActionMenuProps) {
  const actions: RowAction[] = [
    {
      id: 'edit',
      label: 'Edit entry',
      sectionLabel: 'Entry',
      icon: <PencilLine className="h-4 w-4" />,
      onSelect: () => onOpenEditEntry?.(entry),
      hidden: !onOpenEditEntry,
    },
    {
      id: 'accept',
      label: 'Accept entry',
      sectionLabel: 'Entry',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.ACCEPTED),
      hidden: !onStatusChange || entry.entryStatus === EntryStatus.ACCEPTED,
    },
    {
      id: 'waitlist',
      label: 'Move to waitlist',
      sectionLabel: 'Entry',
      icon: <Ticket className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.WAITLIST),
      hidden: !onStatusChange || !canMoveToWaitlist(entry.entryStatus),
    },
    {
      id: 'check-in',
      label: 'Check in all classes',
      sectionLabel: 'Show day',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: () => onCheckInEntry?.(entry.id),
      hidden: !onCheckInEntry || !canCheckIn(entry.entryStatus),
    },
    {
      id: 'armband',
      label: entry.armbandNumber ? 'Change armband' : 'Assign armband',
      sectionLabel: 'Show day',
      icon: <PencilLine className="h-4 w-4" />,
      onSelect: () => onOpenArmbandDialog?.(entry),
      hidden: !onOpenArmbandDialog,
    },
    {
      id: 'comp',
      label: entry.comped ? 'Remove comp' : 'Comp entry',
      sectionLabel: 'Payment',
      icon: <DollarSign className="h-4 w-4" />,
      onSelect: () => (entry.comped ? onUncompEntry?.(entry.id) : onOpenCompDialog?.(entry)),
      hidden: entry.comped ? !onUncompEntry : !onOpenCompDialog,
    },
    {
      id: 'request-payment',
      label: 'Request payment…',
      sectionLabel: 'Payment',
      icon: <CreditCard className="h-4 w-4" />,
      onSelect: () => onOpenRequestPayment?.(entry),
      hidden: !onOpenRequestPayment || !isPaymentRequestable(entry),
    },
    {
      id: 'refund',
      label: 'Refund payment…',
      sectionLabel: 'Payment',
      icon: <Undo2 className="h-4 w-4" />,
      onSelect: () => onOpenRefund?.(entry),
      hidden: !onOpenRefund || !isStripeRefundable(entry),
    },
    {
      id: 'resend-email',
      label: 'Resend confirmation',
      sectionLabel: 'Communication',
      icon: <Mail className="h-4 w-4" />,
      onSelect: () => onResendEmail?.(entry.registrationId),
      disabled: !onResendEmail || isResendDisabled?.(entry.registrationId) === true,
      hidden: !entry.registrationId,
    },
    {
      id: 'reject',
      label: 'Reject entry',
      sectionLabel: 'Danger',
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.REJECTED),
      hidden: !onStatusChange || entry.entryStatus === EntryStatus.REJECTED,
      variant: 'destructive',
    },
    {
      id: 'remove',
      label: 'Remove entry',
      sectionLabel: 'Danger',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => onRemoveEntry?.(entry.id),
      hidden: !onRemoveEntry,
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />;
}
