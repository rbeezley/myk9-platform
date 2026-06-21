import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus, PaymentStatus } from '@/types/show-registration-types';

/** Lifecycle states that aren't in the show — never collect money for these. */
const INACTIVE_ENTRY_STATUSES: ReadonlySet<EntryStatus> = new Set([
  EntryStatus.CANCELLED, // 'withdrawn'
  EntryStatus.SCRATCHED,
  EntryStatus.REJECTED, // 'not_accepted'
]);

/** An entry qualifies for the "Request payment" flow when it still owes money
 * AND is still active: payment_status='pending' covers both a mail-in entry and
 * a promoted waitlist entry (Task 1 finding); comped entries owe nothing; a
 * withdrawn/scratched/rejected entry isn't in the show. Server authz + the
 * club's payout-enabled check remain authoritative.
 *
 * Lives in its own module (not RequestPaymentDialog.tsx) so the component file
 * exports only components — satisfies react-refresh/only-export-components,
 * mirroring refundEligibility.ts. */
export function isPaymentRequestable(
  entry: Pick<EntryManagementEntry, 'paymentStatus' | 'comped' | 'entryStatus'>
): boolean {
  return (
    entry.paymentStatus === PaymentStatus.PENDING &&
    !entry.comped &&
    !INACTIVE_ENTRY_STATUSES.has(entry.entryStatus)
  );
}
