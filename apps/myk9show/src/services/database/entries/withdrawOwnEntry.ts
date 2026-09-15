/**
 * MYK9-535: exhibitor self-withdrawal of their own, unpaid entry.
 *
 * Lives in its own module rather than in `lifecycle.ts` (597 lines) so neither
 * that file nor `ReplicatedEntriesTable.ts` grows further.
 *
 * WHY THIS IS NOT THE LIFECYCLE PATH. `entries` has one UPDATE policy,
 * `entries_update`, whose USING and WITH CHECK are both
 * `can_manage_show(show_id)`. An exhibitor's direct UPDATE matches zero rows and
 * the MutationManager reports failureKind "authorization". The owner tier
 * therefore goes through the `withdraw_own_entry` SECURITY DEFINER RPC. Show
 * managers keep the existing `rejectEntry` lifecycle transition (and its
 * `reject_entry` audit action and secretary seed) — see `withdrawEntry`.
 *
 * WHY IT IS ONLINE-ONLY. The call awaits the server and writes nothing
 * optimistically. Withdrawal is pre-show by definition (the RPC refuses a
 * checked-in or in-ring entry), so this is not a show-day offline flow, and it
 * is money-adjacent: reporting a withdrawal the server refused leaves the
 * exhibitor believing they owe nothing. Everything below therefore runs AFTER
 * the server confirms — including the audit record, which carries the real
 * from-status rather than a placeholder.
 */
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, logQuery } from '../supabaseClient';

export const withdrawOwnEntry = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { from } = await replicatedEntriesTable.withdrawOwnEntry(entryId);

    logQuery('entries', 'withdraw_own_entry', Date.now() - startTime);

    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'entry',
      entityId: entryId,
      changes: { entryStatus: { from: from ?? null, to: 'withdrawn' } },
      metadata: { action: 'withdraw_own_entry' },
    });

    return { data: { id: entryId }, error: null };
  } catch (error) {
    const dbError = createDatabaseError(error, 'entries', 'withdraw_own_entry');
    logQuery('entries', 'withdraw_own_entry', Date.now() - startTime, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Whether the Pull affordance should be offered for this entry, and if not, the
 * sentence to show instead. Reads the replicated row, so the dialog needs no new
 * props and cannot disagree with the pre-check.
 */
export const getWithdrawEligibility = async (entryId: string) =>
  replicatedEntriesTable.getWithdrawEligibility(entryId);
