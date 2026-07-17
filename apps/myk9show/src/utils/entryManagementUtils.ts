import React from 'react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/status';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';
import type { EntryStatus as CanonicalEntryStatus } from '@/types/entry-lifecycle';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { getEntryStatusKind } from '@/services/entryDisplay/entryDisplaySelectors';
import { mapEntryStatus } from '@/services/entryDisplay/entryStatusUiAdapter';

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
 * `entryStatusUiAdapter`. Imported above (for local colour use) and re-exported
 * here so existing `@/utils/entryManagementUtils` import paths keep working.
 */
export { mapEntryStatus };

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
    case 'waived':
    case PaymentStatus.WAIVED:
      return PaymentStatus.WAIVED;
    case 'pending':
    case PaymentStatus.PENDING:
    default:
      return PaymentStatus.PENDING;
  }
};

export function getEffectivePaymentStatus(
  entry: Pick<EntryManagementEntry, 'paymentStatus' | 'enrollmentPaymentStatus'>
): PaymentStatus {
  return entry.enrollmentPaymentStatus ?? entry.paymentStatus;
}

export function hasEntryLevelRefund(
  entry: Pick<EntryManagementEntry, 'paymentStatus' | 'refundAmount'>
): boolean {
  return (
    entry.paymentStatus === PaymentStatus.REFUNDED ||
    entry.paymentStatus === PaymentStatus.PARTIAL_REFUND ||
    (entry.refundAmount ?? 0) > 0
  );
}

export function getEntryPaidAmount(
  entry: Pick<
    EntryManagementEntry,
    'paymentStatus' | 'enrollmentPaymentStatus' | 'totalFee' | 'refundAmount'
  >
): number {
  if (hasEntryLevelRefund(entry)) {
    return entry.refundAmount != null ? Math.max(0, entry.totalFee - entry.refundAmount) : 0;
  }

  switch (getEffectivePaymentStatus(entry)) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return entry.totalFee;
    case PaymentStatus.REFUNDED:
      return 0;
    case PaymentStatus.PARTIAL_REFUND:
      return entry.totalFee;
    case PaymentStatus.WAIVED:
      return 0;
    case PaymentStatus.PENDING:
    default:
      return 0;
  }
}

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

// Status/payment chips speak the warm `--chip-*` token vocabulary (each pair
// ships matched light + dark values) instead of raw Tailwind palette classes,
// which had no `dark:` variant (light chip on a dark card) and used cool grays
// banned outside the status vocabulary. Hues are preserved; "Pulled"/"Moved"
// move from cool gray to the warm `stone=inactive` token.
// Each filled chip overrides the Badge default variant's hover:bg-primary/80
// (badgeVariants.ts) with its own token, otherwise a tokenized chip flips to the
// user's accent on hover. The outline-variant CHIP_BLUE_FG needs no hover (the
// outline variant has no hover background).
const CHIP_TEAL =
  'bg-[color:var(--chip-teal-bg)] text-[color:var(--chip-teal-fg)] hover:bg-[color:var(--chip-teal-bg)]';
const CHIP_BLUE =
  'bg-[color:var(--chip-blue-bg)] text-[color:var(--chip-blue-fg)] hover:bg-[color:var(--chip-blue-bg)]';
const CHIP_RED =
  'bg-[color:var(--chip-red-bg)] text-[color:var(--chip-red-fg)] hover:bg-[color:var(--chip-red-bg)]';
const CHIP_BLUE_FG = 'text-[color:var(--chip-blue-fg)]';

/**
 * Get badge component for entry status
 */
export function getEntryStatusBadge(status: EntryStatus): React.ReactNode {
  return React.createElement(StatusBadge, { family: 'entry', status, variant: 'outline' });
}

/**
 * Get badge component for payment status
 */
export function getPaymentStatusBadge(status: PaymentStatus): React.ReactNode {
  switch (status) {
    case PaymentStatus.PAID_ONLINE:
    case PaymentStatus.PAID_BY_CHECK:
    case PaymentStatus.PAID_BY_CASH:
      return React.createElement(Badge, { className: CHIP_TEAL }, 'Paid');
    case PaymentStatus.PENDING:
      return React.createElement(Badge, { className: CHIP_RED }, 'Payment Due');
    case PaymentStatus.WAIVED:
      return React.createElement(Badge, { className: CHIP_BLUE }, 'Waived');
    case PaymentStatus.REFUNDED:
      return React.createElement(
        Badge,
        { variant: 'outline', className: CHIP_BLUE_FG },
        'Refunded'
      );
    case PaymentStatus.PARTIAL_REFUND:
      return React.createElement(
        Badge,
        { variant: 'outline', className: CHIP_BLUE_FG },
        'Partial Refund'
      );
    default:
      return React.createElement(Badge, { variant: 'outline' }, 'Unknown');
  }
}
