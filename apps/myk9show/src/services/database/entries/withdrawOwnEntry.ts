/**
 * MYK9-535: exhibitor self-withdrawal of their own, unpaid entry.
 *
 * Lives in its own module rather than in `lifecycle.ts` (641 lines) so neither
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
 * WHY THE PRE-CHECK. `queueMutation` resolves once the row is durable locally,
 * long before the server answers, so a refusal would otherwise dead-letter
 * silently while the UI showed the withdrawal as done. `evaluateWithdrawEligibility`
 * runs the RPC's owner-tier guards against the replicated row FIRST and refuses
 * locally, so the server refusal becomes the rare race (a secretary marking the
 * entry paid between render and click) rather than the normal case. That race is
 * caught by the authorization-failure revert in `ReplicationSyncProvider`.
 */
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, logQuery } from '../supabaseClient';

export const withdrawOwnEntry = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { mutationId, entry } = await replicatedEntriesTable.withdrawOwnEntry(entryId);

    logQuery('entries', 'withdraw_own_entry', Date.now() - startTime);

    // Logged after the pre-check passed and the mutation is durable, carrying
    // the REAL from-status read off the hydrated row (not a null placeholder).
    await auditService.log({
      action: AuditAction.UPDATE,
      entityType: 'entry',
      entityId: entryId,
      changes: { entryStatus: { from: entry.entryStatus ?? null, to: 'withdrawn' } },
      metadata: { action: 'withdraw_own_entry' },
    });

    return {
      data: {
        id: entryId,
        show_id: entry.showId ?? null,
        class_id: entry.classId ?? null,
        mutationId,
      },
      error: null,
    };
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
