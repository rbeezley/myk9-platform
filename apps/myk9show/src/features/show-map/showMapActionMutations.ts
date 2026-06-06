import { CLASS_STATUS } from '@myk9/core';

import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { processMoveUp } from '@/services/database/day-of-operations';
import { restoreEntryStatus, scratchEntryDayOf } from '@/services/database/entries/lifecycle';
import { replicatedClassesTable } from '@/services/replication';
import { updateReplicatedCheckInStatus } from '@/services/show-day/checkInStatus';

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
  // Route through the lifecycle seam so the pull is audit-logged and the
  // side-effect fields (check_in_status='pulled', withdrawal_reason,
  // special_requests) are written consistently with other day-of pulls.
  const trimmed = reason?.trim();
  const { error } = await scratchEntryDayOf(
    entryId,
    trimmed || 'Marked no-show from Show Map'
  );

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_scratch_entry');
  }
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
  const { data: currentEntry, error: fetchError } = await supabase
    .from('entries')
    .select('id, entry_status, check_in_status, special_requests')
    .eq('id', entryId)
    .single();

  if (fetchError || !currentEntry) {
    throw createDatabaseError(
      fetchError || new Error('Entry not found'),
      'entries',
      'show_map_move_up_fetch'
    );
  }

  const { data, error } = await processMoveUp(entryId, targetClassId, reason);
  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_move_up');
  }

  const newEntryId = data?.id ? String(data.id) : null;
  if (!newEntryId) {
    throw createDatabaseError(
      new Error('Move-up did not return the new entry.'),
      'entries',
      'show_map_move_up'
    );
  }

  return {
    originalEntryId: entryId,
    newEntryId,
    previousEntryStatus:
      typeof currentEntry.entry_status === 'string' ? currentEntry.entry_status : null,
    previousCheckInStatus:
      typeof currentEntry.check_in_status === 'string' ? currentEntry.check_in_status : null,
    previousSpecialRequests:
      typeof currentEntry.special_requests === 'string' ? currentEntry.special_requests : null,
    targetClassName: readNestedName(data?.class),
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

  const now = new Date().toISOString();
  const { error: removeError } = await supabase
    .from('entries')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('id', input.newEntryId);

  if (removeError) {
    throw createDatabaseError(removeError, 'entries', 'show_map_undo_move_up_remove');
  }

  const { error: restoreError } = await restoreEntryStatus({
    entryId: input.originalEntryId,
    previousEntryStatus: input.previousEntryStatus,
    previousCheckInStatus: input.previousCheckInStatus,
    previousSpecialRequests: input.previousSpecialRequests,
  });

  if (restoreError) {
    throw createDatabaseError(restoreError, 'entries', 'show_map_undo_move_up_restore');
  }
}
