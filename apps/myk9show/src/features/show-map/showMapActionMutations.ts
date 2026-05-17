import { createDatabaseError, supabase } from '@/services/database/supabaseClient';
import { processMoveUp } from '@/services/database/day-of-operations';

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

export function sourceIdFromShowMapNodeId(nodeId: string, expectedType: string): string | null {
  const prefix = `${expectedType}:`;
  if (!nodeId.startsWith(prefix)) return null;
  const sourceId = nodeId.slice(prefix.length);
  return sourceId.length > 0 ? sourceId : null;
}

export async function markShowMapEntryCheckedIn(entryId: string): Promise<void> {
  // Secretary/staff Show Map path mirrors CheckInReportPage: staff can update
  // check_in_status directly, while exhibitor self-check-in uses the RPC path.
  const { error } = await supabase
    .from('entries')
    .update({ check_in_status: 'checked-in' } as Record<string, unknown>)
    .eq('id', entryId);

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_mark_checked_in');
  }
}

export async function scratchShowMapEntry(
  entryId: string,
  reason: string | undefined
): Promise<void> {
  const { error } = await supabase
    .from('entries')
    .update({
      entry_status: 'scratched',
      check_in_status: 'pulled',
      withdrawal_reason: reason?.trim() || 'Marked no-show from Show Map',
      updated_at: new Date().toISOString(),
    } as Record<string, unknown>)
    .eq('id', entryId);

  if (error) {
    throw createDatabaseError(error, 'entries', 'show_map_scratch_entry');
  }
}

function readNestedName(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const name = (value as Record<string, unknown>).name;
  return typeof name === 'string' && name.trim() ? name : null;
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
    } as Record<string, unknown>)
    .eq('id', input.newEntryId);

  if (removeError) {
    throw createDatabaseError(removeError, 'entries', 'show_map_undo_move_up_remove');
  }

  const { error: restoreError } = await supabase
    .from('entries')
    .update({
      entry_status: input.previousEntryStatus,
      check_in_status: input.previousCheckInStatus,
      special_requests: input.previousSpecialRequests,
      updated_at: now,
    } as Record<string, unknown>)
    .eq('id', input.originalEntryId);

  if (restoreError) {
    throw createDatabaseError(restoreError, 'entries', 'show_map_undo_move_up_restore');
  }
}
