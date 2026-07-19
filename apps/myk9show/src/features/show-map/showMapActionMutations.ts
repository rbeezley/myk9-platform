import { CLASS_STATUS, logger, type CheckInStatus } from '@myk9/core';

import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { buildMovedUpFromNote } from '@/services/database/entries/moveUpNote';
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
import { getTrialRegistry } from '@/features/registries';

export interface ShowMapMoveUpInput {
  entryId: string;
  targetClassId: string;
  reason?: string | undefined;
}

export interface ShowMapMoveUpUndoInput {
  originalEntryId: string;
  newEntryId: string;
  previousEntryStatus: string | null;
  previousCheckInStatus: string | null;
  previousSpecialRequests: string | null;
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
      new Error('Cannot undo scratch because the original entry status was not captured.'),
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

// INTENT: Show Map move-up stays on replicated entry mutations because this
// action is show-day/offline-critical. The online day-of path routes status
// changes through entries/lifecycle.ts; this path mirrors the same domain
// transition locally, audit-logs it, and relies on sync/server review as the
// backstop for stale replicas or concurrent capacity changes.
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

  // Enforce the move-up rule server-side too — the UI target picker is the
  // first line of defense, but a stale UI or alternate surface must not be able
  // to move e.g. a Buried Master into Container Novice. Same element, strictly
  // higher level. See isEligibleMoveUpTarget.
  const sourceClassId = currentEntry.classId ?? currentEntry.class_id ?? null;
  const sourceClass = sourceClassId
    ? await replicatedClassesTable.getClassById(sourceClassId)
    : null;
  if (!sourceClass) {
    throw createDatabaseError(new Error('Current class not found'), 'classes', 'show_map_move_up');
  }
  // Resolve the registry server-side too, from the source class's trial (a show's
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
  const previousCheckInStatus = currentEntry.checkInStatus ?? currentEntry.check_in_status ?? null;
  const previousSpecialRequests =
    currentEntry.specialRequests ?? currentEntry.special_requests ?? null;
  const moveNote = `Moved up to ${targetClass.name}${reason ? ': ' + reason : ''}`;
  const movedUpFromNote = buildMovedUpFromNote(
    currentEntry.classId ?? currentEntry.class_id,
    reason
  );
  const newEntryId = generateUUID();

  // Create the promoted entry FIRST. If this fails, the original entry is left
  // exactly as it was — the dog still runs where it is, nothing is corrupted.
  try {
    await replicatedEntriesTable.createEntry({
      id: newEntryId,
      dogId: currentEntry.dogId,
      showId: currentEntry.showId,
      classId: targetClassId,
      trialId: targetClass.trialId ?? targetClass.trial_id,
      trial_id: targetClass.trialId ?? targetClass.trial_id,
      entryStatus: 'confirmed',
      entry_status: 'confirmed',
      paymentStatus: 'waived',
      entryFee: 0,
      jumpHeight: currentEntry.jumpHeight,
      handler: currentEntry.handler,
      armband: currentEntry.armband,
      specialRequests: movedUpFromNote,
      special_requests: movedUpFromNote,
    });
  } catch (error) {
    throw createDatabaseError(error, 'entries', 'show_map_move_up_create');
  }

  // New entry exists; now retire the original. If THIS fails, soft-delete the
  // entry we just created so we don't leave a duplicate. Use a soft-delete
  // UPDATE (not a hard deleteEntry) deliberately: on flaky show-day WiFi the
  // create's INSERT may still be in retry-backoff in the mutation queue, and a
  // hard DELETE is an independent, un-ordered mutation that could upload first,
  // no-op against a not-yet-inserted row, and then let the INSERT land — leaving
  // a live orphan on the server, invisible on this device. An UPDATE targets the
  // SAME row as the pending INSERT, so it can never resurrect into a live entry
  // regardless of queue ordering. This mirrors undoShowMapMoveUp's retire path.
  try {
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: 'moved',
      entry_status: 'moved',
      specialRequests: moveNote,
      special_requests: moveNote,
    });
  } catch (error) {
    // updateEntry is NOT atomic: it commits the local row BEFORE it queues the
    // sync mutation (ReplicatedEntriesTable.updateEntry), so a throw here may
    // have already left the original locally marked 'moved'. Restore it to its
    // captured previous state FIRST — that makes the dog runnable again on this
    // device even if the next step fails — then soft-delete the new entry.
    // Ordering matters: if we soft-deleted first and the restore then threw, the
    // dog would be stranded with no runnable entry; restoring first means the
    // worst case is a visible duplicate the secretary can scratch.
    try {
      await replicatedEntriesTable.updateEntry(entryId, {
        entryStatus: previousEntryStatus ?? undefined,
        entry_status: previousEntryStatus ?? undefined,
        checkInStatus: previousCheckInStatus ?? undefined,
        check_in_status: previousCheckInStatus ?? undefined,
        specialRequests: previousSpecialRequests,
        special_requests: previousSpecialRequests,
      });
    } catch (restoreError) {
      logger.error(
        '[show-map] Failed to restore original entry after mark-moved failure',
        restoreError
      );
    }
    try {
      const rolledBackAt = new Date().toISOString();
      await replicatedEntriesTable.updateEntry(newEntryId, {
        deletedAt: rolledBackAt,
        deleted_at: rolledBackAt,
      });
    } catch (rollbackError) {
      logger.error(
        '[show-map] Failed to soft-delete move-up entry after mark-moved failure',
        rollbackError
      );
    }
    throw createDatabaseError(error, 'entries', 'show_map_move_up');
  }

  await logReplicatedEntryStatusChange({
    entryId,
    fromStatus: previousEntryStatus,
    toStatus: 'moved',
    action: 'mark_entry_moved',
    reason,
    metadata: { targetClassName: targetClass.name },
  });

  return {
    originalEntryId: entryId,
    newEntryId,
    previousEntryStatus,
    previousCheckInStatus,
    previousSpecialRequests,
    targetClassName: targetClass.name,
  };
}

export async function undoShowMapMoveUp(input: ShowMapMoveUpUndoInput): Promise<void> {
  if (!input.previousEntryStatus) {
    throw createDatabaseError(
      new Error('Cannot undo move-up because the original entry status was not captured.'),
      'entries',
      'show_map_undo_move_up_restore'
    );
  }

  const deletedAt = new Date().toISOString();
  await replicatedEntriesTable.updateEntry(input.newEntryId, {
    deletedAt,
    deleted_at: deletedAt,
  });
  const restoredCheckInStatus = (input.previousCheckInStatus ?? 'no-status') as CheckInStatus;
  await replicatedEntriesTable.updateEntry(input.originalEntryId, {
    entryStatus: input.previousEntryStatus,
    entry_status: input.previousEntryStatus,
    checkInStatus: restoredCheckInStatus,
    check_in_status: restoredCheckInStatus,
    specialRequests: input.previousSpecialRequests,
    special_requests: input.previousSpecialRequests,
  });

  await logReplicatedEntryStatusChange({
    entryId: input.originalEntryId,
    fromStatus: 'moved',
    toStatus: input.previousEntryStatus,
    action: 'restore_entry_status',
    metadata: {
      checkInStatus: restoredCheckInStatus,
    },
  });
}
