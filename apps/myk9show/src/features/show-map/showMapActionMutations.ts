import { CLASS_STATUS, type CheckInStatus } from '@myk9/core';

import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { replicatedClassesTable, replicatedEntriesTable } from '@/services/replication';
import {
  updateReplicatedCheckInStatus,
  updateReplicatedDayOfScratch,
} from '@/services/show-day/checkInStatus';
import { generateUUID } from '@/utils/idUtils';

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

export async function markShowMapEntryCheckedIn(entryId: string): Promise<void> {
  await updateReplicatedCheckInStatus(entryId, 'checked-in');
}

export async function markShowMapClassStarted(classId: string): Promise<void> {
  await replicatedClassesTable.updateClass(classId, {
    classStatus: CLASS_STATUS.IN_PROGRESS,
    actual_start_time: new Date().toISOString(),
    isCompleted: false,
  });
}

export async function markShowMapClassComplete(classId: string): Promise<void> {
  await replicatedClassesTable.updateClass(classId, {
    classStatus: CLASS_STATUS.COMPLETED,
    actual_end_time: new Date().toISOString(),
    isCompleted: true,
  });
}

export async function scratchShowMapEntry(
  entryId: string,
  reason: string | undefined
): Promise<void> {
  const trimmed = reason?.trim();
  await updateReplicatedDayOfScratch(entryId, trimmed || 'Marked no-show from Show Map');
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

export async function moveUpShowMapEntry({
  entryId,
  targetClassId,
  reason,
}: ShowMapMoveUpInput): Promise<ShowMapMoveUpResult> {
  const currentEntry = await replicatedEntriesTable.getEntryById(entryId);

  if (!currentEntry) {
    throw createDatabaseError(
      new Error('Entry not found'),
      'entries',
      'show_map_move_up_fetch'
    );
  }

  const targetClass = await replicatedClassesTable.getClassById(targetClassId);
  if (!targetClass) {
    throw createDatabaseError(new Error('Target class not found'), 'classes', 'show_map_move_up');
  }

  const targetEntries = await replicatedEntriesTable.getEntriesByClass(targetClassId);
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
  const newEntryId = generateUUID();

  await replicatedEntriesTable.updateEntry(entryId, {
    entryStatus: 'moved',
    entry_status: 'moved',
    specialRequests: moveNote,
    special_requests: moveNote,
  });

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
      specialRequests: `Moved up from class ${currentEntry.classId ?? currentEntry.class_id}${reason ? ': ' + reason : ''}`,
      special_requests: `Moved up from class ${currentEntry.classId ?? currentEntry.class_id}${reason ? ': ' + reason : ''}`,
    });
  } catch (error) {
    await replicatedEntriesTable.updateEntry(entryId, {
      entryStatus: previousEntryStatus ?? undefined,
      entry_status: previousEntryStatus ?? undefined,
      checkInStatus: previousCheckInStatus ?? undefined,
      check_in_status: previousCheckInStatus ?? undefined,
      specialRequests: previousSpecialRequests,
      special_requests: previousSpecialRequests,
    });
    throw createDatabaseError(error, 'entries', 'show_map_move_up_create');
  }

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

  await replicatedEntriesTable.deleteEntry(input.newEntryId);
  const restoredCheckInStatus = (input.previousCheckInStatus ?? 'no-status') as CheckInStatus;
  await replicatedEntriesTable.updateEntry(input.originalEntryId, {
    entryStatus: input.previousEntryStatus,
    entry_status: input.previousEntryStatus,
    checkInStatus: restoredCheckInStatus,
    check_in_status: restoredCheckInStatus,
    specialRequests: input.previousSpecialRequests,
    special_requests: input.previousSpecialRequests,
  });
}
