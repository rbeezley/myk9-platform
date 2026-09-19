/**
 * Entry mutation queries
 *
 * Write operations for creating, updating, deleting, and managing entry state.
 * Includes bulk operations, status transitions, and handler/detail updates.
 */
import { supabase, logQuery, createDatabaseError } from '../supabaseClient';
import { logger } from '@/services/LoggingService';
import type { DbEntryInsert, DbEntryUpdate } from '../../../types/database-mappings';
import type { EntryStatus } from '@/types/entry-lifecycle';
import { removeEntryAsManager, setEntryLifecycleStatus } from './lifecycle';
import { withdrawOwnEntry } from './withdrawOwnEntry';
import type {
  RemoveFromClassKind,
  WithdrawalReasonCode,
} from '@/features/registries/withdrawalPolicy';
import { updateOwnEntryJumpHeight } from './updateOwnEntryJumpHeight';
import {
  AUTHENTICATED_ENTRY_READ_COLUMNS,
  ENTRY_WITH_STANDARD_RELATIONS_SELECT,
} from './entrySelects';

// Create new entry
export const createEntry = async (entryData: DbEntryInsert) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .insert(entryData)
      .select(ENTRY_WITH_STANDARD_RELATIONS_SELECT)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'insert');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'insert');
    logQuery('entries', 'insert', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update entry
export const updateEntry = async (params: { id: string; updates: DbEntryUpdate }) => {
  const { id, updates } = params;
  const startTime = Date.now();

  try {
    // Add updated_at timestamp
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('entries')
      .update(updateData)
      .eq('id', id)
      .select(ENTRY_WITH_STANDARD_RELATIONS_SELECT)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'update', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update');
    logQuery('entries', 'update', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Delete entry (soft delete)
export const deleteEntry = async (id: string, deletedBy?: string) => {
  const startTime = Date.now();

  try {
    const { error } = await supabase
      .from('entries')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: deletedBy || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    const duration = Date.now() - startTime;
    logQuery('entries', 'delete', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'delete');
    }

    return { data: null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'delete');
    logQuery('entries', 'delete', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Update entry status — routes through the lifecycle seam so the status
// change is audit-logged and the standard side-effect fields (e.g.
// check_in_status='pulled' for scratch) are applied. Re-exported from
// entries/index.ts as `updateEntryStatusWithAudit`.
export const updateEntryStatus = async (params: {
  id: string;
  status: EntryStatus;
  userId: string;
  reason?: string;
}) => {
  const { id, status, userId, reason } = params;
  const startTime = Date.now();

  try {
    const { data, error } = await setEntryLifecycleStatus({
      entryId: id,
      status,
      reason,
    });

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_status');
    }

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_status', duration);

    // Log for debugging (userId is for audit purposes)
    logger.debug(`Entry ${id} status updated to ${status} by user ${userId}`, 'database', {});

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_status');
    logQuery('entries', 'update_status', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Bulk create entries
export const createMultipleEntries = async (entriesData: DbEntryInsert[]) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .insert(entriesData)
      .select(ENTRY_WITH_STANDARD_RELATIONS_SELECT);

    const duration = Date.now() - startTime;
    logQuery('entries', 'bulk_insert', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'bulk_insert');
    }

    return { data: data || [], error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'bulk_insert');
    logQuery('entries', 'bulk_insert', duration, dbError.message);
    return { data: [], error: dbError };
  }
};

/**
 * Update the jump height on an entry — MYK9-561.
 *
 * NOT a direct UPDATE any more. `entries` has one UPDATE policy,
 * `entries_update`, whose USING and WITH CHECK are both
 * `can_manage_show(show_id)`, so an exhibitor's UPDATE matched zero rows and
 * `.single()` reported PGRST116 as "Failed to update jump height". The write now
 * goes through the `update_own_entry_jump_height` SECURITY DEFINER RPC, which
 * admits BOTH the show manager (restating `entries_update`) and the entry's own
 * exhibitor — the same shape as `updateEntryHandler` below, called by the same
 * Save Changes handler.
 *
 * The `updates` bag is gone deliberately: the RPC's column allow-list is its
 * signature, so a general-purpose `{ entry_status?, handler?, jump_height? }`
 * parameter would promise writes it cannot perform. `entry_status` transitions
 * belong to `setEntryLifecycleStatus` / `withdrawOwnEntry`, and `handler` to
 * `updateEntryHandler`.
 */
export const updateEntryDetails = async (params: { entryId: string; jumpHeight: string }) =>
  updateOwnEntryJumpHeight(params.entryId, params.jumpHeight);

// Update entry handler through an RPC because entries_update RLS only permits
// show managers. The RPC preserves exhibitor owner/co-owner/handler scope, and
// also lets show managers correct both handler text and handler_id.
export const updateEntryHandler = async (params: {
  entryId: string;
  handler: string;
  handlerId?: string | null;
  clearHandlerId?: boolean | undefined;
}) => {
  const startTime = Date.now();
  const { entryId, handler, handlerId = null, clearHandlerId = false } = params;

  try {
    const { error } = await supabase.rpc(
      'update_entry_handler_for_entry_management' as never,
      {
        p_entry_id: entryId,
        p_handler: handler,
        p_handler_id: handlerId,
        ...(clearHandlerId ? { p_clear_handler_id: true } : {}),
      } as never
    );

    const duration = Date.now() - startTime;
    logQuery('entries', 'update_handler', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'update_handler');
    }

    return { data: null, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'update_handler');
    logQuery('entries', 'update_handler', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Withdraw an entry.
//
// MYK9-535: the two tiers take different paths on purpose. A SHOW MANAGER is
// admitted by the `entries_update` RLS policy, so they keep the lifecycle /
// mutation-manager transition. An EXHIBITOR is NOT admitted by that policy (its
// USING and WITH CHECK are both `can_manage_show(show_id)`), so their direct
// UPDATE matched zero rows and failed with failureKind "authorization"; the
// owner tier therefore goes through the `withdraw_own_entry` SECURITY DEFINER
// RPC, pre-checked locally.
// MYK9-632: `kind` and `reason` describe WHICH act was chosen, and BOTH tiers
// honour them. The tiers still differ in HOW they write — a manager is admitted
// by `entries_update` and keeps the lifecycle / mutation-manager path, an
// exhibitor is not and goes through the definer RPC — but they no longer differ
// in WHAT they write. Routing a manager's Pull to `rejectEntry` stored it as
// 'withdrawn', badged the row "Pulled", and kept it out of the Pull tab, so the
// refund decision for that pull could not be reached from anywhere.
export const withdrawEntry = async (
  entryId: string,
  options: {
    asShowManager?: boolean;
    kind?: RemoveFromClassKind;
    reason?: WithdrawalReasonCode | null;
  } = {}
) => {
  const kind: RemoveFromClassKind = options.kind ?? 'withdraw';
  const reason = kind === 'withdraw' ? (options.reason ?? null) : null;
  if (options.asShowManager) return removeEntryAsManager(entryId, kind, reason);
  return withdrawOwnEntry(entryId, { kind, reason });
};

// Comp an entry (mark as comped with reason, set payment_status to waived)
export const compEntry = async (params: { entryId: string; reason: string }) => {
  const { entryId, reason } = params;
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        comped: true,
        comped_reason: reason,
        payment_status: 'waived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'comp_entry', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'comp_entry');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'comp_entry');
    logQuery('entries', 'comp_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

// Remove comp from an entry (restore to pending payment status)
export const uncompEntry = async (entryId: string) => {
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        comped: false,
        comped_reason: null,
        payment_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'uncomp_entry', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'uncomp_entry');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'uncomp_entry');
    logQuery('entries', 'uncomp_entry', duration, dbError.message);
    return { data: null, error: dbError };
  }
};

export type EntrySubmissionSource = 'self_service' | 'organizer' | 'show_desk';

export type EntrySubmissionOutcomeKind = 'created' | 'waitlisted' | 'denied';

export interface EntrySubmissionOutcome {
  dogId: string;
  classId: string;
  outcome: EntrySubmissionOutcomeKind;
  entryId: string | null;
  waitlistEntryId: string | null;
  waitlistPosition?: number | null;
  feeCents: number;
  capacityOverride: boolean;
  denialReason?: string | null;
}

export interface SubmitShowEntriesResult {
  entries: Array<{ entryId: string; dogId: string }>;
  outcomes: EntrySubmissionOutcome[];
  registrationId: string;
  submissionId: string;
}

interface RpcEntrySubmissionOutcome {
  dog_id: string;
  class_id: string;
  outcome: EntrySubmissionOutcomeKind;
  entry_id: string | null;
  waitlist_entry_id: string | null;
  waitlist_position?: number | null;
  fee_cents: number;
  capacity_override: boolean;
  denial_reason?: string | null;
}

// Submit show entries via the server-side RPC (enforces ownership, fees, payment auth, and capacity)
export async function submitShowEntries(params: {
  showId: string;
  registrationId: string;
  entries: Array<{
    dogId: string;
    classId: string;
    handlerId?: string | undefined;
    handlerName: string;
    paymentMethod: string;
    clientFeeCents: number;
  }>;
  submissionId: string;
  paymentMethod: string;
  submissionSource: EntrySubmissionSource;
}): Promise<SubmitShowEntriesResult> {
  const { showId, registrationId, entries, submissionId, paymentMethod, submissionSource } = params;

  const rpcEntries = entries.map(e => ({
    dog_id: e.dogId,
    class_id: e.classId,
    handler_id: e.handlerId ?? null,
    handler_name: e.handlerName,
    payment_method: e.paymentMethod,
    client_fee_cents: e.clientFeeCents,
    submission_source: submissionSource,
  }));

  const { data, error } = await supabase.rpc(
    'submit_show_entries' as never,
    {
      p_show_id: showId,
      p_registration_id: registrationId,
      p_entries: rpcEntries,
      p_submission_id: submissionId,
      p_payment_method: paymentMethod,
    } as never
  );

  if (error) {
    throw createDatabaseError(error, 'entry_submissions', 'rpc_submit');
  }

  const result = data as unknown as {
    entries: Array<{ entry_id: string; dog_id: string }>;
    outcomes?: RpcEntrySubmissionOutcome[];
    registration_id: string;
    submission_id: string;
  };
  const mappedEntries = result.entries.map(e => ({ entryId: e.entry_id, dogId: e.dog_id }));
  const outcomes = Array.isArray(result.outcomes)
    ? result.outcomes.map(outcome => ({
        dogId: outcome.dog_id,
        classId: outcome.class_id,
        outcome: outcome.outcome,
        entryId: outcome.entry_id,
        waitlistEntryId: outcome.waitlist_entry_id,
        waitlistPosition: outcome.waitlist_position ?? null,
        feeCents: outcome.fee_cents,
        capacityOverride: outcome.capacity_override,
        denialReason: outcome.denial_reason ?? null,
      }))
    : mappedEntries.map((entry, index) => ({
        dogId: entry.dogId,
        classId: entries[index]?.classId ?? '',
        outcome: 'created' as const,
        entryId: entry.entryId,
        waitlistEntryId: null,
        waitlistPosition: null,
        feeCents: entries[index]?.clientFeeCents ?? 0,
        capacityOverride: false,
        denialReason: null,
      }));

  return {
    entries: mappedEntries,
    outcomes,
    registrationId: result.registration_id,
    submissionId: result.submission_id,
  };
}

// Apply a promo code to an entry
export const applyPromoCodeToEntry = async (params: {
  entryId: string;
  promoCodeId: string;
  discountAmount: number;
}) => {
  const { entryId, promoCodeId, discountAmount } = params;
  const startTime = Date.now();

  try {
    const { data, error } = await supabase
      .from('entries')
      .update({
        promo_code_id: promoCodeId,
        discount_amount: discountAmount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', entryId)
      .select(AUTHENTICATED_ENTRY_READ_COLUMNS)
      .single();

    const duration = Date.now() - startTime;
    logQuery('entries', 'apply_promo_code', duration, error?.message);

    if (error) {
      throw createDatabaseError(error, 'entries', 'apply_promo_code');
    }

    return { data, error: null };
  } catch (error) {
    const duration = Date.now() - startTime;
    const dbError = createDatabaseError(error, 'entries', 'apply_promo_code');
    logQuery('entries', 'apply_promo_code', duration, dbError.message);
    return { data: null, error: dbError };
  }
};
