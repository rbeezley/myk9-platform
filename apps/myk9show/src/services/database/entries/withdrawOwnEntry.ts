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
import { logger } from '@/services/LoggingService';
import { replicatedEntriesTable } from '@/services/replication/ReplicatedEntriesTable';
import { createDatabaseError, logQuery } from '../supabaseClient';
import type {
  RemoveFromClassKind,
  WithdrawalReasonCode,
} from '@/features/registries/withdrawalPolicy';

/**
 * MYK9-632: `kind` picks the act. 'withdraw' needs one of the two recognised
 * reason codes and writes `entry_status='withdrawn'`; 'pull' takes no reason and
 * writes `'scratched'`, the platform's stored word for a pull.
 */
export interface RemoveOwnEntryOptions {
  kind?: RemoveFromClassKind;
  reason?: WithdrawalReasonCode | null;
}

export const withdrawOwnEntry = async (entryId: string, options: RemoveOwnEntryOptions = {}) => {
  const startTime = Date.now();
  const kind: RemoveFromClassKind = options.kind ?? 'withdraw';

  try {
    const { from, to } = await replicatedEntriesTable.withdrawOwnEntry(entryId, {
      kind,
      reason: options.reason ?? null,
    });

    logQuery('entries', 'withdraw_own_entry', Date.now() - startTime);

    // The server has already committed the withdrawal. A failure to WRITE THE
    // AUDIT RECORD (a localStorage quota throw, say) must not be reported to the
    // exhibitor as a failed withdrawal — the entry really is withdrawn.
    try {
      await auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'entry',
        entityId: entryId,
        changes: { entryStatus: { from: from ?? null, to } },
        metadata: {
          action: 'withdraw_own_entry',
          kind,
          ...(kind === 'withdraw' && options.reason
            ? { withdrawalReasonCode: options.reason }
            : {}),
        },
      });
    } catch (auditError) {
      logger.warn(
        `${kind === 'pull' ? 'Pull' : 'Withdrawal'} succeeded but its audit record could not be written`,
        'entries',
        { entryId, auditError }
      );
    }

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

/**
 * The same guards for every class row on a card, in ONE round trip. The dialog
 * runs this on each open and a multi-dog order is routinely 20-40 rows, so the
 * per-id version would be that many parallel PostgREST reads every time.
 */
export const getWithdrawEligibilityForEntries = async (entryIds: string[]) =>
  replicatedEntriesTable.getWithdrawEligibilityForEntries(entryIds);

/**
 * MYK9-632: both verdicts per row, so a paid entry can show Withdraw greyed out
 * with its reason while Pull stays live. One round trip for the whole card.
 */
export const getRemoveFromClassEligibilityForEntries = async (entryIds: string[]) =>
  replicatedEntriesTable.getRemoveFromClassEligibilityForEntries(entryIds);
