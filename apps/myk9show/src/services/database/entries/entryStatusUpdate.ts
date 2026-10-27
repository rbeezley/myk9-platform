import type { ReplicatedEntry } from '@/services/replication/ReplicatedEntriesTable';
import type { EntryStatus } from '@/types/entry-lifecycle';
import { resolveCheckInStatusForTransition, type EntryStatusCheckInContext } from './statusCheckIn';

/** Build the replicated field patch for a secretary entry-status change. */
export function buildReplicatedEntryStatusUpdate(
  status: EntryStatus,
  withdrawalReason?: string,
  withdrawalReasonCode?: string | null,
  checkInContext?: EntryStatusCheckInContext
): Partial<ReplicatedEntry> {
  const updateData: Partial<ReplicatedEntry> = {
    entryStatus: status,
    entry_status: status,
    status,
  };

  // MYK9-1384: a Pull writes `pulled`; leaving `scratched` for an active status
  // clears it. Anything else leaves check-in untouched.
  const checkIn = resolveCheckInStatusForTransition(status, checkInContext);
  if (checkIn !== undefined) {
    updateData.checkInStatus = checkIn;
    updateData.check_in_status = checkIn;
  }

  if (withdrawalReason !== undefined) {
    updateData.withdrawalReason = withdrawalReason;
    updateData.withdrawal_reason = withdrawalReason;
  }

  // MYK9-632: an explicit `null` is meaningful — a Pull clears the reason code a
  // previous Withdraw left on the row, so the stored reason can never disagree
  // with the stored act. Only `undefined` means "do not touch", EXCEPT on a Pull:
  // MYK9-918 makes every Pull (Entry Management and Show Day) clear the code
  // here, in the one builder, so no caller can forget it.
  const reasonCode =
    status === 'scratched' && withdrawalReasonCode === undefined ? null : withdrawalReasonCode;
  if (reasonCode !== undefined) {
    updateData.withdrawalReasonCode = reasonCode;
    updateData.withdrawal_reason_code = reasonCode;
  }

  return updateData;
}
