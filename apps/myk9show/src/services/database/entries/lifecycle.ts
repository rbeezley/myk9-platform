/**
 * Entry lifecycle transitions — the canonical seam for every `entry_status`
 * change.
 *
 * Callers should use these named transitions instead of writing `entry_status`
 * values directly. Every transition writes the status (and any side-effect
 * fields the operation implies, e.g. `check_in_status='pulled'` for day-of
 * scratch) and emits an `auditService.log` entry recording the from/to status
 * plus a domain action name.
 *
 * Out of scope:
 *  - The dual `EntryStatus` enum (`@/types/entry-lifecycle` vs
 *    `@/types/show-registration-types`). `mapStatusToDb` stays as-is.
 *  - Refund accounting (`refund_status`, `refund_amount`, `updateRefundStatus`).
 *  - Entry creation (INSERT) — the day-of walk-in and waitlist-acceptance
 *    paths are creations, not transitions, and stay where they are.
 */
import type { EntryStatus } from '@/types/entry-lifecycle';
import { auditService } from '@/services/AuditService';
import { AuditAction } from '@/types/audit-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus as SecretaryEntryStatus } from '@/types/show-registration-types';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { updateEntryStatus } from './secretary';
import type { EntryStatusCheckInContext } from './statusCheckIn';
import type { CheckInStatus } from '@myk9/core';
import type { SecretaryStatusEntrySeed } from './secretary';

export interface SetEntryLifecycleStatusParams {
  entryId: string;
  status: EntryStatus;
  reason?: string | undefined;
  sourceEntry?: SecretaryStatusEntrySeed | undefined;
  /** MYK9-632: the recognised withdrawal reason code; explicit null clears it. */
  reasonCode?: string | null | undefined;
  /** MYK9-1384: context that lets leaving `scratched` clear `pulled`. */
  checkInContext?: EntryStatusCheckInContext | undefined;
}

export interface EntryLifecycleArmbandPatch {
  dogId: string;
  showId: string;
  armband: string;
}

export interface ChangeSecretaryEntryStatusParams {
  entry: EntryManagementEntry;
  newStatus: SecretaryEntryStatus;
  secretaryId?: string;
  withdrawalReason?: string;
  /** MYK9-1384: check-in value to restore when this change un-pulls the entry (Undo of a Pull). */
  priorCheckInStatus?: CheckInStatus | undefined;
}

export interface ChangeSecretaryEntryStatusResult {
  armbandPatch?: EntryLifecycleArmbandPatch;
}

export interface SecretaryEntryStatusDependencies {
  setEntryLifecycleStatus: typeof setEntryLifecycleStatus;
  auditLog: typeof auditService.log;
}

export async function setEntryLifecycleStatus(params: SetEntryLifecycleStatusParams) {
  return updateEntryStatus(
    params.entryId,
    params.status,
    params.reason,
    params.sourceEntry,
    params.reasonCode,
    params.checkInContext
  );
}

/**
 * Log a status change to the audit trail. Used by every named transition so
 * downstream consumers (admin dashboards, dispute review) can reconstruct the
 * `entry_status` history without re-querying Supabase.
 */
interface LogEntryStatusChangeParams {
  entryId: string;
  fromStatus: EntryStatus | string | null | undefined;
  toStatus: EntryStatus | string;
  action: string;
  reason?: string | null | undefined;
  metadata?: Record<string, unknown>;
}

async function logEntryStatusChange(params: LogEntryStatusChangeParams): Promise<void> {
  await auditService.log({
    action: AuditAction.UPDATE,
    entityType: 'entry',
    entityId: params.entryId,
    changes: { entryStatus: { from: params.fromStatus ?? null, to: params.toStatus } },
    metadata: {
      action: params.action,
      ...(params.reason ? { reason: params.reason } : {}),
      ...(params.metadata ?? {}),
    },
  });
}

/**
 * MYK9-632: a SHOW MANAGER leaving a class on someone's behalf, as the two acts.
 *
 * The manager tier is admitted by `entries_update`, so it keeps the lifecycle /
 * mutation-manager path rather than the exhibitor's definer RPC. What it must
 * NOT keep is the old collapse: `rejectEntry` wrote `entry_status='withdrawn'`
 * and audited `reject_entry` for BOTH choices, so a secretary who picked Pull
 * got a withdrawal that the Pull tab (`rawEntryStatus === 'scratched'`) never
 * listed — the refund decision for that pull was unreachable from any surface.
 *
 * A Pull writes 'scratched' with the reason code explicitly NULLED; a Withdraw
 * writes 'withdrawn' plus the code. The audit action names the act.
 */
export const removeEntryAsManager = async (
  entryId: string,
  kind: 'withdraw' | 'pull',
  reasonCode?: string | null
) => {
  const status: EntryStatus = kind === 'pull' ? 'scratched' : 'withdrawn';
  const code = kind === 'pull' ? null : (reasonCode ?? null);
  const result = await setEntryLifecycleStatus({ entryId, status, reasonCode: code });
  await logEntryStatusChange({
    entryId,
    fromStatus: undefined,
    toStatus: status,
    action: kind === 'pull' ? 'pull_entry' : 'withdraw_entry',
    ...(code ? { metadata: { withdrawalReasonCode: code } } : {}),
  });
  return result;
};

// ---------------------------------------------------------------------------
// Move-up workflow
// ---------------------------------------------------------------------------

/**
 * Secretary denies a pending move-up request — restores `entry_status='confirmed'`
 * and records the denial reason in `special_requests`. Guarded by
 * `entry_status='move-up-requested'`.
 */
export const denyMoveUpRequest = async (entryId: string, reason?: string) => {
  const startTime = Date.now();
  const note = reason ? `Move-up denied: ${reason}` : 'Move-up request denied';

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'confirmed',
        special_requests: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'move-up-requested')
      .select(
        `
        id,
        entry_status,
        handler,
        armband,
        dog:dog_id (
          id,
          name,
          call_name
        ),
        class:class_id (
          id,
          name,
          class_number
        )
      `
      )
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'deny_move_up_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_move_up_request');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: 'move-up-requested',
      toStatus: 'confirmed',
      action: 'deny_move_up_request',
      reason,
    });

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_move_up_request');
    logQuery('entries', 'deny_move_up_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ---------------------------------------------------------------------------
// Secretary status-change flow (Entry Management dashboard)
// ---------------------------------------------------------------------------

const defaultSecretaryDependencies: SecretaryEntryStatusDependencies = {
  setEntryLifecycleStatus,
  auditLog: input => auditService.log(input),
};

function buildSecretaryStatusSeed(entry: EntryManagementEntry): SecretaryStatusEntrySeed {
  const seed: SecretaryStatusEntrySeed = {
    id: entry.id,
    showId: entry.showId,
    dogId: entry.dogId,
    handler: entry.handlerName,
    registrationId: entry.registrationId,
    entryStatus: mapStatusToDb(entry.entryStatus),
    paymentStatus: entry.paymentStatus,
  };

  const classId = entry.classes[0]?.classId ?? entry.classes[0]?.id;
  if (classId) seed.classId = classId;
  if (entry.armbandNumber) seed.armband = entry.armbandNumber;

  return seed;
}

export async function changeSecretaryEntryStatus(
  params: ChangeSecretaryEntryStatusParams,
  dependencies: SecretaryEntryStatusDependencies = defaultSecretaryDependencies
): Promise<ChangeSecretaryEntryStatusResult> {
  const { entry, newStatus, secretaryId, withdrawalReason, priorCheckInStatus } = params;

  const { error } = await dependencies.setEntryLifecycleStatus({
    entryId: entry.id,
    status: mapStatusToDb(newStatus),
    reason: withdrawalReason,
    sourceEntry: buildSecretaryStatusSeed(entry),
    checkInContext: {
      previousEntryStatus: mapStatusToDb(entry.entryStatus),
      priorCheckInStatus,
    },
  });
  if (error) throw error;

  await dependencies.auditLog({
    action: AuditAction.UPDATE,
    entityType: 'entry',
    entityId: entry.id,
    changes: { entryStatus: { from: entry.entryStatus, to: newStatus } },
    metadata: {
      action: 'status_change',
      secretaryId,
      entryNumber: entry.entryNumber,
      ...(withdrawalReason ? { withdrawalReason } : {}),
    },
  });

  if (newStatus !== SecretaryEntryStatus.ACCEPTED) {
    return {};
  }

  if (!entry.armbandNumber || !entry.dogId || !entry.showId) {
    return {};
  }

  return {
    armbandPatch: {
      armband: entry.armbandNumber,
      dogId: entry.dogId,
      showId: entry.showId,
    },
  };
}
