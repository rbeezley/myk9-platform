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
import type { EntityAction } from '@/components/ui/RowActionMenu';
import { EntryStatus } from '@/types/show-registration-types';
import type { BulkActionResult, EntryManagementEntry } from '@/types/entry-management-types';
import { isPaymentRequestable } from './paymentRequestEligibility';
import { isStripeRefundable } from './refundEligibility';
import { getEligibleForBulkAction } from './bulkActionEligibility';

/** Handlers an EntityAction<EntryManagementEntry, ...> definition may call. Every
 * handler is optional — a page wires up only the callbacks it supports, and
 * `applicableWhen` treats a missing handler as "not applicable" so the action
 * disappears from the row menu rather than firing into a no-op. */
export interface EntryActionHandlers {
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
  onBulkStatusChange?: (
    entryIds: string[],
    status: EntryStatus
  ) => BulkActionResult | Promise<BulkActionResult>;
  onBulkCheckIn?: (entryIds: string[]) => BulkActionResult | Promise<BulkActionResult>;
  onClear?: () => void;
}

const canMoveToWaitlist = (status: EntryStatus) =>
  status === EntryStatus.PENDING || status === EntryStatus.MISSING_INFO;

const canCheckIn = (status: EntryStatus) =>
  status === EntryStatus.ACCEPTED || status === EntryStatus.MOVE_UP_REQUESTED;

/** Runs a bulk status/check-in mutation and clears the selection unless the
 * handler explicitly reports failure (`result === false`) — mirrors the prior
 * EntryBulkActionMenu orchestration so retry-on-failure behavior is unchanged. */
async function runBulkAndClear(
  handlers: EntryActionHandlers,
  action: () => BulkActionResult | Promise<BulkActionResult> | undefined
): Promise<void> {
  try {
    const result = await action();
    if (result !== false) handlers.onClear?.();
  } catch {
    // Parent action handlers own user-visible error copy; keeping selection enables retry.
  }
}

/**
 * Entry Management's shared action catalog. Ports `bulkActionEligibility.ts`'s
 * predicates into `applicableWhen`/`bulk.applicableWhen` (that module's exports
 * stay in place for external callers). Row and bulk eligibility for the same
 * action can differ on purpose — e.g. the row "Accept entry" action is offered
 * for any non-accepted status, while the bulk "Accept selected" excludes
 * closed/terminal statuses (see `CLOSED_STATUSES`) to avoid corrupting scored
 * or moved-queue entries via a batch write.
 */
export const entryActions: ReadonlyArray<EntityAction<EntryManagementEntry, EntryActionHandlers>> =
  [
    {
      id: 'edit',
      label: 'Edit entry',
      sectionLabel: 'Entry',
      icon: <PencilLine className="h-4 w-4" />,
      applicableWhen: (_entry, handlers) => Boolean(handlers.onOpenEditEntry),
      run: (entry, handlers) => handlers.onOpenEditEntry?.(entry),
    },
    {
      id: 'accept',
      label: 'Accept entry',
      sectionLabel: 'Entry',
      icon: <CheckCircle2 className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onStatusChange) && entry.entryStatus !== EntryStatus.ACCEPTED,
      run: (entry, handlers) => handlers.onStatusChange?.(entry.id, EntryStatus.ACCEPTED),
      bulk: {
        applicableWhen: entry => getEligibleForBulkAction([entry], 'approve').length === 1,
        label: (eligibleCount, selectedCount) =>
          eligibleCount > 0
            ? `Accept ${eligibleCount} of ${selectedCount} selected`
            : 'Accept selected',
        unavailableReason: 'No selected entries can be accepted',
        run: (eligible, handlers) =>
          runBulkAndClear(handlers, () =>
            handlers.onBulkStatusChange?.(
              eligible.map(entry => entry.id),
              EntryStatus.ACCEPTED
            )
          ),
      },
    },
    {
      id: 'waitlist',
      label: 'Move to waitlist',
      sectionLabel: 'Entry',
      icon: <Ticket className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onStatusChange) && canMoveToWaitlist(entry.entryStatus),
      run: (entry, handlers) => handlers.onStatusChange?.(entry.id, EntryStatus.WAITLIST),
    },
    {
      id: 'check-in',
      label: 'Check in all classes',
      sectionLabel: 'Show day',
      icon: <ClipboardCheck className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onCheckInEntry) && canCheckIn(entry.entryStatus),
      run: (entry, handlers) => handlers.onCheckInEntry?.(entry.id),
      bulk: {
        applicableWhen: entry => getEligibleForBulkAction([entry], 'check-in').length === 1,
        label: (eligibleCount, selectedCount) =>
          eligibleCount > 0
            ? `Check in ${eligibleCount} of ${selectedCount} selected`
            : 'Check in selected',
        unavailableReason: 'Only accepted entries can be checked in',
        run: (eligible, handlers) =>
          runBulkAndClear(handlers, () =>
            handlers.onBulkCheckIn?.(eligible.map(entry => entry.id))
          ),
      },
    },
    {
      id: 'armband',
      label: entry => (entry.armbandNumber ? 'Change armband' : 'Assign armband'),
      sectionLabel: 'Show day',
      icon: <PencilLine className="h-4 w-4" />,
      applicableWhen: (_entry, handlers) => Boolean(handlers.onOpenArmbandDialog),
      run: (entry, handlers) => handlers.onOpenArmbandDialog?.(entry),
    },
    {
      id: 'comp',
      label: entry => (entry.comped ? 'Remove comp' : 'Comp entry'),
      sectionLabel: 'Payment',
      icon: <DollarSign className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        entry.comped ? Boolean(handlers.onUncompEntry) : Boolean(handlers.onOpenCompDialog),
      run: (entry, handlers) =>
        entry.comped ? handlers.onUncompEntry?.(entry.id) : handlers.onOpenCompDialog?.(entry),
    },
    {
      id: 'request-payment',
      label: 'Request payment…',
      sectionLabel: 'Payment',
      icon: <CreditCard className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onOpenRequestPayment) && isPaymentRequestable(entry),
      run: (entry, handlers) => handlers.onOpenRequestPayment?.(entry),
    },
    {
      id: 'refund',
      label: 'Refund payment…',
      sectionLabel: 'Payment',
      icon: <Undo2 className="h-4 w-4" />,
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onOpenRefund) && isStripeRefundable(entry),
      run: (entry, handlers) => handlers.onOpenRefund?.(entry),
    },
    {
      id: 'resend-email',
      label: 'Resend confirmation',
      sectionLabel: 'Communication',
      icon: <Mail className="h-4 w-4" />,
      applicableWhen: entry => Boolean(entry.registrationId),
      disabledWhen: (entry, handlers) =>
        !handlers.onResendEmail || handlers.isResendDisabled?.(entry.registrationId) === true,
      run: (entry, handlers) => handlers.onResendEmail?.(entry.registrationId),
    },
    {
      id: 'reject',
      label: 'Reject entry',
      sectionLabel: 'Danger',
      icon: <XCircle className="h-4 w-4" />,
      variant: 'destructive',
      applicableWhen: (entry, handlers) =>
        Boolean(handlers.onStatusChange) && entry.entryStatus !== EntryStatus.REJECTED,
      run: (entry, handlers) => handlers.onStatusChange?.(entry.id, EntryStatus.REJECTED),
      bulk: {
        applicableWhen: entry => getEligibleForBulkAction([entry], 'reject').length === 1,
        label: (eligibleCount, selectedCount) =>
          eligibleCount > 0
            ? `Reject ${eligibleCount} of ${selectedCount} selected`
            : 'Reject selected',
        unavailableReason: 'No selected entries can be rejected',
        run: (eligible, handlers) =>
          runBulkAndClear(handlers, () =>
            handlers.onBulkStatusChange?.(
              eligible.map(entry => entry.id),
              EntryStatus.REJECTED
            )
          ),
      },
    },
    {
      id: 'remove',
      label: 'Remove entry',
      sectionLabel: 'Danger',
      icon: <Trash2 className="h-4 w-4" />,
      variant: 'destructive',
      applicableWhen: (_entry, handlers) => Boolean(handlers.onRemoveEntry),
      run: (entry, handlers) => handlers.onRemoveEntry?.(entry.id),
    },
  ];
