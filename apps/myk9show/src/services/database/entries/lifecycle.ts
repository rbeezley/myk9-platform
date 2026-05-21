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
import { getEntryArmbandById } from '@/services/database/armbands';
import { AuditAction } from '@/types/audit-types';
import type { EntryManagementEntry } from '@/types/entry-management-types';
import { EntryStatus as SecretaryEntryStatus } from '@/types/show-registration-types';
import { mapStatusToDb } from '@/utils/entryManagementUtils';
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { updateEntryStatus } from './secretary';

export type EntryLifecycleAction = 'accept' | 'reject' | 'scratch' | 'waitlist';

export interface EntryLifecycleTransitionParams {
  entryId: string;
  action: EntryLifecycleAction;
  reason?: string | undefined;
}

export interface SetEntryLifecycleStatusParams {
  entryId: string;
  status: EntryStatus;
  reason?: string | undefined;
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
}

export interface ChangeSecretaryEntryStatusResult {
  armbandPatch?: EntryLifecycleArmbandPatch;
}

export interface SecretaryEntryStatusDependencies {
  setEntryLifecycleStatus: typeof setEntryLifecycleStatus;
  getEntryArmbandById: typeof getEntryArmbandById;
  auditLog: typeof auditService.log;
}

const ENTRY_LIFECYCLE_STATUS: Record<EntryLifecycleAction, EntryStatus> = {
  accept: 'confirmed',
  reject: 'withdrawn',
  scratch: 'scratched',
  // Wait List membership is represented by waitlist_entries today. Until
  // promotion is unified, this preserves the existing pending-entry decision
  // behavior behind a named Entry transition.
  waitlist: 'confirmed',
};

export async function setEntryLifecycleStatus(params: SetEntryLifecycleStatusParams) {
  return updateEntryStatus(params.entryId, params.status, params.reason);
}

export async function transitionEntryLifecycle(params: EntryLifecycleTransitionParams) {
  const status = ENTRY_LIFECYCLE_STATUS[params.action];
  return setEntryLifecycleStatus({ entryId: params.entryId, status, reason: params.reason });
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

export const acceptEntry = async (entryId: string) => {
  const result = await transitionEntryLifecycle({ entryId, action: 'accept' });
  await logEntryStatusChange({
    entryId,
    fromStatus: undefined,
    toStatus: 'confirmed',
    action: 'accept_entry',
  });
  return result;
};

export const rejectEntry = async (entryId: string, reason?: string) => {
  const result = await transitionEntryLifecycle({ entryId, action: 'reject', reason });
  await logEntryStatusChange({
    entryId,
    fromStatus: undefined,
    toStatus: 'withdrawn',
    action: 'reject_entry',
    reason,
  });
  return result;
};

/**
 * Pre-show scratch — withdrawal before day-of. Writes `entry_status='scratched'`
 * via the secretary transition (which also sets `check_in_status='pulled'` per
 * the `buildEntryStatusUpdate` helper) and `withdrawal_reason`. Does NOT touch
 * `special_requests`. For day-of pulls that need to overwrite `special_requests`
 * with the pull reason, use `scratchEntryDayOf` instead.
 */
export const scratchEntry = async (entryId: string, reason?: string) => {
  const result = await transitionEntryLifecycle({ entryId, action: 'scratch', reason });
  await logEntryStatusChange({
    entryId,
    fromStatus: undefined,
    toStatus: 'scratched',
    action: 'scratch_entry',
    reason,
  });
  return result;
};

export const waitlistEntry = async (entryId: string) => {
  const result = await transitionEntryLifecycle({ entryId, action: 'waitlist' });
  await logEntryStatusChange({
    entryId,
    fromStatus: undefined,
    toStatus: 'confirmed',
    action: 'waitlist_entry',
  });
  return result;
};

/**
 * Day-of pull — writes `entry_status='scratched'`, `check_in_status='pulled'`,
 * `withdrawal_reason`, and `special_requests` (the last two carry the pull
 * reason so the ringside team sees why the entry was pulled).
 *
 * This is the replacement for the legacy `day-of-operations/scratch.ts:scratchEntry`
 * function. Pre-show withdrawals that should not overwrite `special_requests`
 * use `scratchEntry` (the secretary path) instead.
 */
export const scratchEntryDayOf = async (entryId: string, reason?: string) => {
  const startTime = Date.now();
  const fallbackReason = reason || 'Pulled day-of';

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        withdrawal_reason: fallbackReason,
        special_requests: fallbackReason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
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
    logQuery('entries', 'scratch_entry_day_of', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'scratch_entry_day_of');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: undefined,
      toStatus: 'scratched',
      action: 'scratch_entry_day_of',
      reason: fallbackReason,
      metadata: { checkInStatus: 'pulled' },
    });

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'scratch_entry_day_of');
    logQuery('entries', 'scratch_entry_day_of', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Exhibitor-initiated scratch request — sets `entry_status='scratch-requested'`
 * so the secretary can approve or deny. Stores the reason in
 * `special_requests` so it's visible in the queue UI.
 */
export const requestScratch = async (entryId: string, reason?: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratch-requested',
        special_requests: reason || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(
        `
        id,
        entry_status,
        entry_fee,
        handler,
        armband,
        payment_status,
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
    logQuery('entries', 'request_scratch', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'request_scratch');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: undefined,
      toStatus: 'scratch-requested',
      action: 'request_scratch',
      reason,
    });

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'request_scratch');
    logQuery('entries', 'request_scratch', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Secretary approves a pending scratch request — guarded by
 * `entry_status='scratch-requested'` so a race that already approved or denied
 * the request returns no row instead of stomping a different state.
 */
export const approveScratchRequest = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'scratched',
        check_in_status: 'pulled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch-requested')
      .select(
        `
        id,
        entry_status,
        check_in_status,
        entry_fee,
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
    logQuery('entries', 'approve_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'approve_scratch_request');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: 'scratch-requested',
      toStatus: 'scratched',
      action: 'approve_scratch_request',
      metadata: { checkInStatus: 'pulled' },
    });

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'approve_scratch_request');
    logQuery('entries', 'approve_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

/**
 * Secretary denies a pending scratch request — restores
 * `entry_status='confirmed'` and records the denial reason in
 * `special_requests`. Guarded by `entry_status='scratch-requested'`.
 */
export const denyScratchRequest = async (entryId: string, reason?: string) => {
  const startTime = Date.now();
  const note = reason ? `Pull denied: ${reason}` : 'Pull request denied';

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        entry_status: 'confirmed',
        special_requests: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .eq('entry_status', 'scratch-requested')
      .select()
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'deny_scratch_request', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'deny_scratch_request');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: 'scratch-requested',
      toStatus: 'confirmed',
      action: 'deny_scratch_request',
      reason,
    });

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'deny_scratch_request');
    logQuery('entries', 'deny_scratch_request', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// ---------------------------------------------------------------------------
// Move-up workflow
// ---------------------------------------------------------------------------

/**
 * Mark the original entry as `moved` once a move-up has been processed. The
 * sibling `processMoveUp` orchestrator owns the multi-step transaction
 * (capacity check, mark original, insert new). This transition is just the
 * status write + audit log on the original entry.
 */
export interface MarkEntryMovedParams {
  entryId: string;
  targetClassName: string;
  reason?: string | undefined;
}

export const markEntryMoved = async (params: MarkEntryMovedParams) => {
  const startTime = Date.now();
  const { entryId, targetClassName, reason } = params;
  const note = `Moved up to ${targetClassName}${reason ? ': ' + reason : ''}`;

  try {
    const { error } = await supabase
      .from('entries')
      .update({
        entry_status: 'moved',
        special_requests: note,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    const duration = Date.now() - startTime;
    logQuery('entries', 'mark_entry_moved', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'mark_entry_moved');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: undefined,
      toStatus: 'moved',
      action: 'mark_entry_moved',
      reason,
      metadata: { targetClassName },
    });

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'mark_entry_moved');
    logQuery('entries', 'mark_entry_moved', duration, dbError.message);
    return { error: dbError };
  }
};

/**
 * Rollback the `moved` status back to `confirmed` when a move-up failed
 * mid-transaction (e.g. the new entry insert failed). Restores
 * `special_requests=null` to match the pre-move state.
 */
export const rollbackEntryMove = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('entries')
      .update({
        entry_status: 'confirmed',
        special_requests: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId);

    const duration = Date.now() - startTime;
    logQuery('entries', 'rollback_entry_move', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'rollback_entry_move');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: 'moved',
      toStatus: 'confirmed',
      action: 'rollback_entry_move',
    });

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'rollback_entry_move');
    logQuery('entries', 'rollback_entry_move', duration, dbError.message);
    return { error: dbError };
  }
};

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

/**
 * Restore an entry to a captured prior `entry_status` — used by the Show Map
 * undo-move-up flow which captures the original status before the move and
 * restores it on undo. This is intentionally not a domain transition: the
 * caller supplies the target status verbatim.
 */
export interface RestoreEntryStatusParams {
  entryId: string;
  previousEntryStatus: string;
  previousCheckInStatus: string | null;
  previousSpecialRequests: string | null;
}

export const restoreEntryStatus = async (params: RestoreEntryStatusParams) => {
  const startTime = Date.now();
  const { entryId, previousEntryStatus, previousCheckInStatus, previousSpecialRequests } = params;

  try {
    const { error } = await supabase
      .from('entries')
      .update({
        entry_status: previousEntryStatus,
        check_in_status: previousCheckInStatus,
        special_requests: previousSpecialRequests,
        updated_at: new Date().toISOString(),
      } as Record<string, unknown>)
      .eq('id', entryId);

    const duration = Date.now() - startTime;
    logQuery('entries', 'restore_entry_status', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'restore_entry_status');
    }

    await logEntryStatusChange({
      entryId,
      fromStatus: undefined,
      toStatus: previousEntryStatus,
      action: 'restore_entry_status',
      metadata: {
        checkInStatus: previousCheckInStatus,
      },
    });

    return { error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'restore_entry_status');
    logQuery('entries', 'restore_entry_status', duration, dbError.message);
    return { error: dbError };
  }
};

// ---------------------------------------------------------------------------
// Secretary status-change flow (Entry Management dashboard)
// ---------------------------------------------------------------------------

const defaultSecretaryDependencies: SecretaryEntryStatusDependencies = {
  setEntryLifecycleStatus,
  getEntryArmbandById,
  auditLog: input => auditService.log(input),
};

export async function changeSecretaryEntryStatus(
  params: ChangeSecretaryEntryStatusParams,
  dependencies: SecretaryEntryStatusDependencies = defaultSecretaryDependencies
): Promise<ChangeSecretaryEntryStatusResult> {
  const { entry, newStatus, secretaryId, withdrawalReason } = params;

  const { error } = await dependencies.setEntryLifecycleStatus({
    entryId: entry.id,
    status: mapStatusToDb(newStatus),
    reason: withdrawalReason,
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

  const triggerArmband = await dependencies.getEntryArmbandById(entry.id);
  if (!triggerArmband?.armband || !triggerArmband.dogId || !triggerArmband.showId) {
    return {};
  }

  return {
    armbandPatch: {
      armband: triggerArmband.armband,
      dogId: triggerArmband.dogId,
      showId: triggerArmband.showId,
    },
  };
}
