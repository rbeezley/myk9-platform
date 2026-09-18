import { CLASS_STATUS, type CheckInStatus } from '@myk9/core';

import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import {
  replicatedClassesTable,
  replicatedEntriesTable,
  replicatedTrialsTable,
} from '@/services/replication';
import { applyManualClassStatus } from '@/services/show-day/classStatusMutations';
import {
  updateReplicatedCheckInStatus,
  updateReplicatedDayOfScratch,
} from '@/services/show-day/checkInStatus';
import { logReplicatedEntryStatusChange } from '@/services/show-day/entryStatusAudit';
import { generateUUID } from '@/utils/idUtils';
import { isEligibleMoveUpTarget } from '@/utils/moveUpEligibility';
import { reverseShowMapMoveUp } from './moveUpSupersession';
import { getTrialRegistry } from '@/features/registries';

export interface ShowMapMoveUpInput {
  entryId: string;
  targetClassId: string;
  reason?: string | undefined;
}

export interface ShowMapMoveUpUndoInput {
  originalEntryId: string;
  /**
   * The destination entry. It is all the reverse needs: the server follows
   * `moved_from_entry_id` from here to the source it must restore, so nothing
   * captured at move time can go stale in between (MYK9-640).
   */
  newEntryId: string;
}

export interface ShowMapMoveUpResult extends ShowMapMoveUpUndoInput {
  targetClassName: string | null;
}

export interface ShowMapHandlerMessageTarget {
  participantAuthUserId: string;
  handlerName: string | null;
  dogName: string | null;
  className: string | null;
}

export function sourceIdFromShowMapNodeId(nodeId: string, expectedType: string): string | null {
  const prefix = `${expectedType}:`;
  if (!nodeId.startsWith(prefix)) return null;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : null;
}

export function entryIdFromShowMapNodeId(nodeId: string): string | null {
  return (
    sourceIdFromShowMapNodeId(nodeId, 'entry') ?? sourceIdFromShowMapNodeId(nodeId, 'dog-entry')
  );
}

export async function markShowMapEntryCheckedIn(entryId: string): Promise<void> {
  await updateReplicatedCheckInStatus(entryId, 'checked-in');
}

function readEntryStatus(entry: Awaited<ReturnType<typeof replicatedEntriesTable.getEntryById>>) {
  return entry?.entryStatus ?? entry?.entry_status ?? entry?.status ?? null;
}

export async function approveShowMapEntry(entryId: string): Promise<string | null> {
  const entry = await replicatedEntriesTable.getEntryById(entryId);
  const mutationId = await replicatedEntriesTable.updateEntryStatus(entryId, 'confirmed');

  await logReplicatedEntryStatusChange({
    entryId,
    fromStatus: readEntryStatus(entry),
    toStatus: 'confirmed',
    action: 'approve_entry',
  });

  return mutationId;
}

export async function bulkApproveShowMapEntries(entryIds: string[]): Promise<(string | null)[]> {
  return Promise.all(entryIds.map(entryId => approveShowMapEntry(entryId)));
}

export async function markShowMapClassStarted(classId: string): Promise<void> {
  await applyManualClassStatus(classId, CLASS_STATUS.IN_PROGRESS);
}

export async function markShowMapClassComplete(classId: string): Promise<void> {
  await applyManualClassStatus(classId, CLASS_STATUS.COMPLETED);
}

export interface ShowMapScratchUndoInput {
  entryId: string;
  previousEntryStatus: string | null;
  previousCheckInStatus: string | null;
  previousSpecialRequests: string | null;
  previousWithdrawalReason: string | null;
}

export async function scratchShowMapEntry(
  entryId: string,
  reason: string | undefined
): Promise<ShowMapScratchUndoInput> {
  const currentEntry = await replicatedEntriesTable.getEntryById(entryId);
  const previousEntryStatus =
    currentEntry?.entryStatus ?? currentEntry?.entry_status ?? currentEntry?.status ?? null;
  const previousCheckInStatus =
    currentEntry?.checkInStatus ?? currentEntry?.check_in_status ?? null;
  const previousSpecialRequests =
    currentEntry?.specialRequests ?? currentEntry?.special_requests ?? null;
  const previousWithdrawalReason =
    currentEntry?.withdrawalReason ?? currentEntry?.withdrawal_reason ?? null;

  const trimmed = reason?.trim();
  await updateReplicatedDayOfScratch(entryId, trimmed || 'Marked no-show from Show Map');

  return {
    entryId,
    previousEntryStatus,
    previousCheckInStatus,
    previousSpecialRequests,
    previousWithdrawalReason,
  };
}

export async function undoShowMapScratch(input: ShowMapScratchUndoInput): Promise<void> {
  if (!input.previousEntryStatus) {
    throw createDatabaseError(
      new Error('Cannot undo this pull because the original entry status was not captured.'),
      'entries',
      'show_map_undo_scratch_restore'
    );
  }

  const restoredCheckInStatus = (input.previousCheckInStatus ?? 'no-status') as CheckInStatus;
  await replicatedEntriesTable.updateEntry(input.entryId, {
    entryStatus: input.previousEntryStatus,
    entry_status: input.previousEntryStatus,
    checkInStatus: restoredCheckInStatus,
    check_in_status: restoredCheckInStatus,
    specialRequests: input.previousSpecialRequests,
    special_requests: input.previousSpecialRequests,
    withdrawalReason: input.previousWithdrawalReason,
    withdrawal_reason: input.previousWithdrawalReason,
  });

  await logReplicatedEntryStatusChange({
    entryId: input.entryId,
    fromStatus: 'scratched',
    toStatus: input.previousEntryStatus,
    action: 'restore_entry_status',
    metadata: {
      checkInStatus: restoredCheckInStatus,
    },
  });
}

function readNestedName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name : null;
}

function readNestedString(value: unknown, key: string): string | null {
  if (!value || typeof value !== 'object') return null;
  const nestedValue = (value as Record<string, unknown>)[key];
  return typeof nestedValue === 'string' && nestedValue.trim() ? nestedValue : null;
}

function readMaybeRelatedObject(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
  }
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function formatPersonName(person: Record<string, unknown> | null): string | null {
  if (!person) return null;
  const firstName = readNestedString(person, 'first_name');
  const lastName = readNestedString(person, 'last_name');
  return [firstName, lastName].filter(Boolean).join(' ').trim() || null;
}

function readDogName(value: unknown): string | null {
  return readNestedString(value, 'call_name') ?? readNestedString(value, 'name');
}

export async function getShowMapHandlerMessageTarget(
  entryId: string
): Promise<ShowMapHandlerMessageTarget> {
  const { data: entry, error } = await supabase
    .from('entries')
    .select(
      `
      id,
      handler,
      handler_id,
      handler_person:people!entries_handler_id_fkey (
        id,
        auth_user_id,
        first_name,
        last_name
      ),
      dog:dog_id (
        call_name,
        name
      ),
      class:class_id (
        name
      )
    `
    )
    .eq('id', entryId)
    .single();

  if (error || !entry) {
    throw createDatabaseError(
      error || new Error('Entry not found'),
      'entries',
      'show_map_message_handler_fetch'
    );
  }

  const record = entry as Record<string, unknown>;
  const handlerId = readNestedString(record, 'handler_id');
  if (!handlerId) {
    throw createDatabaseError(
      new Error('This entry does not have a handler assigned.'),
      'entries',
      'show_map_message_handler_fetch'
    );
  }

  const handler = readMaybeRelatedObject(record.handler_person);
  const participantAuthUserId = readNestedString(handler, 'auth_user_id');

  if (!participantAuthUserId) {
    throw createDatabaseError(
      new Error('This handler does not have a messaging account yet.'),
      'entries',
      'show_map_message_handler_fetch'
    );
  }

  return {
    participantAuthUserId,
    handlerName: formatPersonName(handler) ?? readNestedString(record, 'handler'),
    dogName: readDogName(record.dog),
    className: readNestedName(record.class),
  };
}

// INTENT: the move-up is a SHOW-DAY operation and stays on the replicated entry
// layer for its READS (source, classes, trial, capacity) so the secretary sees
// the same data offline. The WRITE is one server transaction — see
// `moveUpEntryViaRpc` for why it is online-only and why the previous queued
// pair of writes had to go.
export async function moveUpShowMapEntry({
  entryId,
  targetClassId,
  reason,
}: ShowMapMoveUpInput): Promise<ShowMapMoveUpResult> {
  const currentEntry = await replicatedEntriesTable.getEntryById(entryId);

  if (!currentEntry) {
    throw createDatabaseError(new Error('Entry not found'), 'entries', 'show_map_move_up_fetch');
  }

  const targetClass = await replicatedClassesTable.getClassById(targetClassId);
  if (!targetClass) {
    throw createDatabaseError(new Error('Target class not found'), 'classes', 'show_map_move_up');
  }

  // Enforce the move-up rule client-side: the registry level ladder lives in TS
  // (the registry is on the trial, not on a CHECK), so this is the layer that
  // can reason about it. The RPC owns everything a stale client must not be
  // trusted with — who may write, that the source is movable, and atomicity.
  const sourceClassId = currentEntry.classId ?? currentEntry.class_id ?? null;
  const sourceClass = sourceClassId
    ? await replicatedClassesTable.getClassById(sourceClassId)
    : null;
  if (!sourceClass) {
    throw createDatabaseError(new Error('Current class not found'), 'classes', 'show_map_move_up');
  }
  // Resolve the registry client-side too, from the source class's trial (a show's
  // trials always share one registry — scoping §7) — defaults to AKC if the trial
  // can't be resolved, matching getTrialRegistry's own fallback.
  const sourceTrialId = sourceClass.trialId ?? sourceClass.trial_id ?? null;
  const sourceTrial = sourceTrialId
    ? await replicatedTrialsTable.getTrialById(sourceTrialId)
    : null;
  const registryId = getTrialRegistry(sourceTrial).id;
  if (!isEligibleMoveUpTarget(sourceClass, targetClass, registryId)) {
    throw createDatabaseError(
      new Error(
        `${targetClass.name} is not a valid move-up target for ${sourceClass.name}. ` +
          'A move-up must be to a higher level within the same element.'
      ),
      'entries',
      'show_map_move_up'
    );
  }

  const targetEntries = await replicatedEntriesTable.getEntriesByClass(targetClassId);
  // INTENT: This is an offline-first local capacity guard. It can under-count if
  // the replica is incomplete; server sync/conflict review remains the backstop
  // for concurrent move-ups or stale devices.
  const acceptedCount = targetEntries.filter(entry => {
    const status = entry.entryStatus ?? entry.entry_status;
    return status === 'confirmed' || status === 'checked-in';
  }).length;
  const limit = targetClass.maxEntries ?? 999;
  if (acceptedCount >= limit) {
    throw createDatabaseError(new Error('Target class is full'), 'entries', 'show_map_move_up');
  }

  const previousEntryStatus =
    currentEntry.entryStatus ?? currentEntry.entry_status ?? currentEntry.status ?? null;
  const newEntryId = generateUUID();

  // ONE server call. It inserts the money-neutral destination carrying
  // `moved_from_entry_id`, copies the check-in only when it is a check-in, and
  // marks the source `moved` — in a single transaction, so there is no window
  // in which the dog is entered twice or entered nowhere. It also refuses a
  // source that is pulled, withdrawn, scratched, absent or already moved.
  const destinationEntryId = await replicatedEntriesTable.moveUpEntryViaRpc({
    sourceEntryId: entryId,
    targetClassId,
    newEntryId,
    reason,
  });

  await logReplicatedEntryStatusChange({
    entryId,
    fromStatus: previousEntryStatus,
    toStatus: 'moved',
    action: 'mark_entry_moved',
    reason,
    metadata: { targetClassName: targetClass.name, destinationEntryId },
  });

  return {
    originalEntryId: entryId,
    newEntryId: destinationEntryId,
    targetClassName: targetClass.name,
  };
}

/**
 * The 8-second banner's Undo.
 *
 * It is the SAME operation as the durable "Move back" on the dialog, so it is
 * the same call: one server transaction that restores the source and removes
 * the destination. Before, the banner restored a status captured at move time
 * while the dialog restored the live one, and the banner's own path was two
 * uncompensated writes — if the second failed the dog was left with no live
 * entry at all.
 */
export async function undoShowMapMoveUp(input: ShowMapMoveUpUndoInput): Promise<void> {
  await reverseShowMapMoveUp(input.newEntryId);
}
