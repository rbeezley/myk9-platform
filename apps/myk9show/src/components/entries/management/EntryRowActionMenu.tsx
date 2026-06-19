import {
  CheckCircle2,
  ClipboardCheck,
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

interface EntryRowActionMenuProps {
  entry: EntryManagementEntry;
  onStatusChange: (entryId: string, status: EntryStatus) => void;
  onCheckInEntry: (entryId: string) => void;
  onOpenArmbandDialog: (entry: EntryManagementEntry) => void;
  onOpenCompDialog: (entry: EntryManagementEntry) => void;
  onUncompEntry: (entryId: string) => void;
  onRemoveEntry: (entryId: string) => void;
  onResendEmail?: ((registrationId: string) => void) | undefined;
  isResendDisabled?: ((registrationId: string) => boolean) | undefined;
}

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
}: EntryRowActionMenuProps) {
  const actions: RowAction[] = [
    {
      id: 'accept',
      label: 'Accept entry',
      icon: <CheckCircle2 className="h-4 w-4" />,
      onSelect: () => onStatusChange(entry.id, EntryStatus.ACCEPTED),
    },
    {
      id: 'waitlist',
      label: 'Move to waitlist',
      icon: <Ticket className="h-4 w-4" />,
      onSelect: () => onStatusChange(entry.id, EntryStatus.WAITLIST),
    },
    {
      id: 'check-in',
      label: 'Check in all classes',
      icon: <ClipboardCheck className="h-4 w-4" />,
      onSelect: () => onCheckInEntry(entry.id),
    },
    {
      id: 'armband',
      label: entry.armbandNumber ? 'Change armband' : 'Assign armband',
      icon: <PencilLine className="h-4 w-4" />,
      onSelect: () => onOpenArmbandDialog(entry),
    },
    {
      id: 'comp',
      label: entry.comped ? 'Remove comp' : 'Comp entry',
      icon: <DollarSign className="h-4 w-4" />,
      onSelect: () => (entry.comped ? onUncompEntry(entry.id) : onOpenCompDialog(entry)),
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
      onSelect: () => onStatusChange(entry.id, EntryStatus.REJECTED),
      variant: 'destructive',
    },
    {
      id: 'remove',
      label: 'Remove entry',
      icon: <Trash2 className="h-4 w-4" />,
      onSelect: () => onRemoveEntry(entry.id),
      variant: 'destructive',
    },
  ];

  return <RowActionMenu actions={actions} size="sm" label={`Actions for ${entry.dogName}`} />;
}
