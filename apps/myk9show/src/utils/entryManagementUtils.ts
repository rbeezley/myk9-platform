import React from 'react';
import { Badge } from '@/components/ui/badge';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryStatus as CanonicalEntryStatus } from '@/types/entry-lifecycle';
import { getEntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';

/**
 * Entry management utility functions
 * Extracted from EntryManagementPage.tsx as part of DEBT-002 refactoring
 */

/**
 * Map a raw DB entry status to the UI `EntryStatus` enum.
 *
 * Re-exported from the single classifier home (`services/entryDisplay/`) so the
 * page + secretary surfaces classify identically to the exhibitor tab. The
 * `paid`/`promotion-expired` bucket preservation lives there too — see
 * `entryStatusUiAdapter`.
 */
export { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';

/**
 * Map database payment status to UI enum
 */
export const mapPaymentStatus = (status?: string | null): PaymentStatus => {
  switch (status) {
    case 'paid':
    case PaymentStatus.PAID_ONLINE:
      return PaymentStatus.PAID_ONLINE;
    case PaymentStatus.PAID_BY_CHECK:
      return PaymentStatus.PAID_BY_CHECK;
    case PaymentStatus.PAID_BY_CASH:
      return PaymentStatus.PAID_BY_CASH;
    case 'refunded':
    case PaymentStatus.REFUNDED:
      return PaymentStatus.REFUNDED;
    case PaymentStatus.PARTIAL_REFUND:
      return PaymentStatus.PARTIAL_REFUND;
    case 'pending':
    case PaymentStatus.PENDING:
    default:
      return PaymentStatus.PENDING;
  }
};

/**
 * Map database class entry status to the participation chip shown on a class row.
 * Derives from the single classifier KIND (no parallel raw switch) so the chip
 * agrees with every other entry-status surface.
 */
export const mapClassEntryStatus = (
  status?: string | null
): 'entered' | 'scratched' | 'moved' | 'absent' => {
  switch (getEntryStatusKind(status)) {
    case 'withdrawn':
    case 'scratched':
      return 'scratched';
    case 'moved':
      return 'moved';
    case 'not_accepted': // declined / promotion-expired — not running
    case 'absent':
      return 'absent';
    default:
      // accepted / pending / waitlist / in_ring / completed / move_up_requested
      // / unknown all read as a live "entered" chip, matching the prior default.
      return 'entered';
  }
};

/**
 * Map UI entry status to a value valid for the `entry_status` DB constraint.
 *
 * The UI-side `EntryStatus` enum (`accepted`, `pending`, `waitlist`, `rejected`,
 * `cancelled`, `missing_info`) does not line up 1:1 with the canonical DB
 * `EntryStatus` union in `types/entry-lifecycle.ts`. This function bridges them.
 *
 * Known lossy mappings (no better DB value exists under the current schema):
 *   - REJECTED and CANCELLED both collapse to 'withdrawn'. Distinguishing
 *     secretary-rejected from exhibitor-cancelled requires a future schema
 *     addition (e.g., a 'rejected' value in the constraint).
 *   - WAITLIST returns 'submitted'. Waitlist membership is tracked separately
 *     in the `waitlist_entries` table; `entry_status` stays in its pre-decision
 *     state until the entry is promoted off the waitlist.
 */
export const mapStatusToDb = (status: EntryStatus): CanonicalEntryStatus => {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return 'confirmed';
    case EntryStatus.WAITLIST:
      return 'submitted';
    case EntryStatus.REJECTED:
      return 'not_accepted';
    case EntryStatus.CANCELLED:
      return 'withdrawn';
    case EntryStatus.SCRATCHED:
      return 'scratched';
    case EntryStatus.MOVED:
      return 'moved';
    case EntryStatus.COMPLETED:
      return 'completed';
    case EntryStatus.MOVE_UP_REQUESTED:
      return 'move-up-requested';
    case EntryStatus.PENDING:
    case EntryStatus.MISSING_INFO:
    default:
      return 'submitted';
  }
};

/**
 * Get badge component for entry status
 */
export function getEntryStatusBadge(status: EntryStatus): React.ReactNode {
  switch (status) {
    case EntryStatus.ACCEPTED:
      return React.createElement(Badge, { className: 'bg-teal-100 text-teal-800' }, 'Accepted');
    case EntryStatus.PENDING:
      return React.createElement(Badge, { variant: 'secondary' }, 'Pending');
    case EntryStatus.WAITLIST:
      return React.createElement(Badge, { className: 'bg-amber-100 text-amber-800' }, 'Waitlist');
    case EntryStatus.REJECTED:
      return React.createElement(Badge, { variant: 'destructive' }, 'Not Accepted');
    case EntryStatus.CANCELLED:
      return React.createElement(Badge, { variant: 'outline' }, 'Withdrawn');
    case EntryStatus.MISSING_INFO:
      return React.createElement(
        Badge,
        { className: 'bg-amber-100 text-amber-800' },
        'Missing Info'
      );
    case EntryStatus.SCRATCHED:
      return React.createElement(Badge, { className: 'bg-gray-100 text-gray-700' }, 'Pulled');
    case EntryStatus.MOVED:
      return React.createElement(Badge, { className: 'bg-gray-100 text-gray-700' }, 'Moved');
    case EntryStatus.COMPLETED:
      return React.createElement(Badge, { className: 'bg-blue-100 text-blue-800' }, 'Scored');
    case EntryStatus.MOVE_UP_REQUESTED:
      return React.createElement(
        Badge,
        { className: 'bg-amber-100 text-amber-800' },
        'Move-Up Requested'
      );
    default:
      return React.createElement(Badge, { variant: 'outline' }, 'Unknown');
  }
}

/**
 * Get badge component for payment status
 */
export function getPaymentStatusBadge(status: PaymentStatus): React.ReactNode {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return React.createElement(Badge, { className: 'bg-teal-100 text-teal-800' }, 'Paid');
    case PaymentStatus.PENDING:
      return React.createElement(Badge, { className: 'bg-red-100 text-red-800' }, 'Payment Due');
    case PaymentStatus.REFUNDED:
      return React.createElement(
        Badge,
        { variant: 'outline', className: 'text-blue-600' },
        'Refunded'
      );
    case PaymentStatus.PARTIAL_REFUND:
      return React.createElement(
        Badge,
        { variant: 'outline', className: 'text-blue-600' },
        'Partial Refund'
      );
    default:
      return React.createElement(Badge, { variant: 'outline' }, 'Unknown');
  }
}

/**
 * Get Tailwind CSS classes for an entry status badge (string-based, for tables).
 * Accepts raw status strings from DB queries (e.g., 'confirmed', 'pending') and
 * derives the colour from the single classifier KIND, so the Trial entries table
 * and Show Details entries tab tint statuses exactly as every other surface
 * classifies them.
 */
export function getEntryStatusClasses(status: string | null): string {
  switch (getEntryStatusKind(status)) {
    case 'accepted':
      return 'bg-success/10 text-success border-success/30';
    case 'pending':
      return 'bg-warning/10 text-warning border-amber-200 ';
    case 'withdrawn':
      return 'bg-destructive/10 text-destructive border-red-200 ';
    case 'waitlist':
      return 'bg-info/10 text-info border-blue-200 ';
    default:
      // not_accepted / scratched / moved / completed / in_ring / absent /
      // move_up_requested / unknown — neutral chip, as before.
      return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-200';
  }
}

/**
 * Format date string for display
 */
export const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return 'TBD';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};
