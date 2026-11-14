import type { CheckInStatus } from '@myk9/core';
import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { updateEntryStatus } from '@/services/database/entries/secretary';
import { replicatedEntriesTable, type ReplicatedEntry } from '@/services/replication';
import { logReplicatedEntryStatusChange } from './entryStatusAudit';

/**
 * Which authorization path a check-in write takes:
 *  - `'replicated'`     → `ringside_update_entry` / direct UPDATE, authorized by
 *                         staff role (manager / judge / steward). Offline-first.
 *  - `'self-checkin-rpc'` → `self_checkin_entry`, authorized by dog ownership
 *                         (handler / owner / co-owner). Online-only by design.
 */
export type CheckInWriter = 'replicated' | 'self-checkin-rpc';

export async function updateReplicatedCheckInStatus(
  entryId: string,
  status: CheckInStatus,
  updates: Partial<ReplicatedEntry> = {}
): Promise<string | null> {
  if (Object.keys(updates).length === 0) {
    return replicatedEntriesTable.updateCheckInStatus(entryId, status);
  }

  return replicatedEntriesTable.updateEntry(entryId, {
    ...updates,
    checkInStatus: status,
    check_in_status: status,
  });
}

/** What a write expects to replace; the RPC refuses it when the row has moved on (MYK9-1911). */
export interface ExpectedCheckIn {
  status: CheckInStatus;
  /** Who made the Pull being undone, when the expectation is a Pull. */
  pullSource?: 'exhibitor' | 'staff';
  /**
   * The `entries.version` the original Pull produced (what `updateSelfCheckInStatus` returned).
   * Bumped on every write, so it tells that Pull apart from a later identical-looking one.
   */
  version?: number;
}

/** SQLSTATE `self_checkin_entry` raises when the row no longer matches the expectation. */
export const STALE_CHECKIN_SQLSTATE = 'MK911';

/** The server refused a write because a newer status superseded the one it expected. */
export class StaleCheckInError extends Error {
  constructor() {
    super('The entry status changed after this write was prepared.');
    this.name = 'StaleCheckInError';
  }
}

/** True for the refusal itself, or a wrapper carrying it as `cause`. */
export function isStaleCheckIn(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth += 1) {
    if (current instanceof StaleCheckInError) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function updateSelfCheckInStatus(
  entryId: string,
  status: CheckInStatus,
  expected?: ExpectedCheckIn
): Promise<number | undefined> {
  const { data, error } = await supabase.rpc('self_checkin_entry', {
    p_entry_id: entryId,
    p_new_status: status,
    ...(expected && {
      p_expected_status: expected.status,
      ...(expected.pullSource && { p_expected_pull_source: expected.pullSource }),
      ...(expected.version !== undefined && { p_expected_version: expected.version }),
    }),
  });

  if (error) {
    // Permanent, never retried: replaying a superseded write only fails the same way.
    if (error.code === STALE_CHECKIN_SQLSTATE) throw new StaleCheckInError();
    throw createDatabaseError(error, 'entries', 'self_checkin_entry');
  }
  // The version this write produced; an Undo of a Pull carries it back as its expectation.
  return typeof data === 'number' ? data : undefined;
}

/**
 * Show Day's Pull fast path. MYK9-918: it is the SAME mutation as
 * Entry Management's Pull (`updateEntryStatus` → `buildReplicatedEntryStatusUpdate`),
 * so both write identical fields — `scratched`, `check_in_status='pulled'`, the
 * typed reason in `withdrawal_reason` (shown as "Pulled · <reason>"),
 * `withdrawal_reason_code` cleared — and neither overwrites the exhibitor's
 * `special_requests`. The reason is also kept in the audit log.
 */
export async function updateReplicatedDayOfScratch(
  entryId: string,
  reason: string
): Promise<string | null> {
  const { data, error } = await updateEntryStatus(entryId, 'scratched', reason);
  if (error) throw error;

  await logReplicatedEntryStatusChange({
    entryId,
    toStatus: 'scratched',
    action: 'scratch_entry_day_of',
    reason,
    metadata: { checkInStatus: 'pulled' },
  });

  return data?.mutationId ?? null;
}
