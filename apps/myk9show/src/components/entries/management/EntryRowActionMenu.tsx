import {
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  DollarSign,
  Mail,
  PencilLine,
  Ticket,
  Trash2,
  XCircle,
} from 'lucide-react';
import { RowActionMenu, type RowAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { isPaymentRequestable } from './paymentRequestEligibility';

export interface EntryRowActionMenuProps {
  entry: EntryManagementEntry;
  onStatusChange?: ((entryId: string, status: EntryStatus) => void) | undefined;
  onCheckInEntry?: ((entryId: string) => void) | undefined;
  onOpenArmbandDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onOpenCompDialog?: ((entry: EntryManagementEntry) => void) | undefined;
  onUncompEntry?: ((entryId: string) => void) | undefined;
  onRemoveEntry?: ((entryId: string) => void) | undefined;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
  onOpenRequestPayment?: ((entry: EntryManagementEntry) => void) | undefined;
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
  onOpenCompDialog,
  onUncompEntry,
  onRemoveEntry,
  onResendEmail,
  isResendDisabled,
  onOpenRequestPayment,
}: EntryRowActionMenuProps) {
  const actions: RowAction[] = [
    {
      id: 'accept',
      label: 'Accept entry',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.ACCEPTED),
      hidden: !onStatusChange || entry.entryStatus === EntryStatus.ACCEPTED,
    },
    {
      id: 'waitlist',
      label: 'Move to waitlist',
      icon: <Ticket className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.WAITLIST),
      hidden: !onStatusChange || !canMoveToWaitlist(entry.entryStatus),
    },
    {
      id: 'check-in',
      label: 'Check in all classes',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: () => onCheckInEntry?.(entry.id),
      hidden: !onCheckInEntry || !canCheckIn(entry.entryStatus),
    },
    {
      id: 'armband',
      label: entry.armbandNumber ? 'Change armband' : 'Assign armband',
      icon: <PencilLine className="h-4 w-4" />,
      onSelect: () => onOpenArmbandDialog?.(entry),
      hidden: !onOpenArmbandDialog,
    },
    {
      id: 'comp',
      label: entry.comped ? 'Remove comp' : 'Comp entry',
      icon: <DollarSign className="h-4 w-4" />,
      onSelect: () => (entry.comped ? onUncompEntry?.(entry.id) : onOpenCompDialog?.(entry)),
      hidden: entry.comped ? !onUncompEntry : !onOpenCompDialog,
    },
    {
      id: 'request-payment',
      label: 'Request payment…',
      icon: <CreditCard className="h-4 w-4" />,
      onSelect: () => onOpenRequestPayment?.(entry),
      hidden: !onOpenRequestPayment || !isPaymentRequestable(entry),
    },
    {
      id: 'resend-email',
      label: 'Resend confirmation',
      icon: <Mail className="h-4 w-4" />,
      onSelect: () => onResendEmail?.(entry.registrationId),
      disabled: !onResendEmail || isResendDisabled?.(entry.registrationId) === true,
      hidden: !entry.registrationId,
    },
    {
      id: 'reject',
      label: 'Reject entry',
      icon: <XCircle className="h-4 w-4" />,
      onSelect: () => onStatusChange?.(entry.id, EntryStatus.REJECTED),
      hidden: !onStatusChange || entry.entryStatus === EntryStatus.REJECTED,
      variant: 'destructive',
    },
    {
      id: 'remove',
      label: 'Remove entry',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => onRemoveEntry?.(entry.id),
      hidden: !onRemoveEntry,
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />;
}
